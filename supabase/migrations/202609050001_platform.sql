create extension if not exists pgcrypto with schema extensions;
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),created_at timestamptz not null default now());
create table public.organization_members(organization_id uuid not null references public.organizations on delete cascade,user_id uuid not null references auth.users on delete cascade,role text not null check(role in ('owner','editor','viewer')),primary key(organization_id,user_id));
create table public.scenarios(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,name text not null check(length(trim(name)) between 1 and 200),payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1500000),version integer not null default 1,created_by uuid not null references auth.users,updated_at timestamptz not null default now(),unique(id,organization_id));
create table public.scenario_versions(scenario_id uuid not null,organization_id uuid not null,version integer not null,name text not null,payload jsonb not null,created_by uuid not null references auth.users,created_at timestamptz not null default now(),primary key(scenario_id,version),foreign key(scenario_id,organization_id) references public.scenarios(id,organization_id) on delete cascade);
create table public.organization_invitations(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,email text not null,role text not null check(role in ('editor','viewer')),token_hash text not null unique,expires_at timestamptz not null,accepted_at timestamptz,created_by uuid not null references auth.users);
create table public.catalog_imports(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,payload jsonb not null check(octet_length(payload::text)<=1900000),status text not null default 'staged' check(status in ('staged','published')),created_by uuid not null references auth.users,created_at timestamptz not null default now(),unique(id,organization_id));
create table public.catalog_publications(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,import_id uuid not null unique,payload jsonb not null,created_at timestamptz not null default now(),foreign key(import_id,organization_id) references public.catalog_imports(id,organization_id));
create index on public.organization_members(user_id);
create index on public.scenarios(organization_id,updated_at desc);

create function public.member_role(p_org uuid) returns text language sql stable security definer set search_path='' as $$ select role from public.organization_members where organization_id=p_org and user_id=auth.uid() $$;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.catalog_imports enable row level security;
alter table public.catalog_publications enable row level security;
create policy org_read on public.organizations for select to authenticated using(public.member_role(id) is not null);
create policy membership_read on public.organization_members for select to authenticated using(public.member_role(organization_id) is not null);
create policy scenario_read on public.scenarios for select to authenticated using(public.member_role(organization_id) is not null);
create policy history_read on public.scenario_versions for select to authenticated using(public.member_role(organization_id) is not null);
create policy imports_read on public.catalog_imports for select to authenticated using(public.member_role(organization_id) in ('owner','editor'));
create policy publications_read on public.catalog_publications for select to authenticated using(public.member_role(organization_id) is not null);
-- No table mutation policies: validated transactional RPCs are the only write boundary.
revoke all on public.organizations,public.organization_members,public.scenarios,public.scenario_versions,public.organization_invitations,public.catalog_imports,public.catalog_publications from anon,authenticated;
grant select on public.organizations,public.organization_members,public.scenarios,public.scenario_versions,public.catalog_imports,public.catalog_publications to authenticated;

create function public.create_organization(p_name text) returns public.organizations language plpgsql security definer set search_path='' as $$
declare result public.organizations;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 insert into public.organizations(name) values(trim(p_name)) returning * into result;
 insert into public.organization_members values(result.id,auth.uid(),'owner');
 return result;
end $$;

create function public.save_scenario(p_org uuid,p_id uuid,p_name text,p_payload jsonb,p_expected_version integer) returns public.scenarios language plpgsql security definer set search_path='' as $$
declare result public.scenarios;
begin
 if coalesce(public.member_role(p_org),'') not in ('owner','editor') then raise exception 'forbidden'; end if;
 if p_id is null then
  insert into public.scenarios(organization_id,name,payload,created_by) values(p_org,trim(p_name),p_payload,auth.uid()) returning * into result;
 else
  update public.scenarios set name=trim(p_name),payload=p_payload,version=version+1,updated_at=now() where id=p_id and organization_id=p_org and version=p_expected_version returning * into result;
  if result.id is null then raise exception 'version_conflict_or_not_found'; end if;
 end if;
 insert into public.scenario_versions(scenario_id,organization_id,version,name,payload,created_by) values(result.id,result.organization_id,result.version,result.name,result.payload,auth.uid());
 return result;
end $$;

create function public.create_invitation(p_org uuid,p_email text,p_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare token text; invitation_id uuid;
begin
 if public.member_role(p_org) is distinct from 'owner' then raise exception 'forbidden'; end if;
 if p_email is null or length(p_email)>254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_role not in ('editor','viewer') then raise exception 'invalid_invitation'; end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.organization_invitations(organization_id,email,role,token_hash,expires_at,created_by) values(p_org,lower(trim(p_email)),p_role,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '7 days',auth.uid()) returning id into invitation_id;
 return jsonb_build_object('id',invitation_id,'token',token,'expiresAt',now()+interval '7 days');
end $$;
create function public.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.organization_invitations; user_email text;
begin
 if auth.uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_invitation'; end if;
 select lower(email) into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into invitation from public.organization_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and accepted_at is null and expires_at>now() for update;
 if invitation.id is null or user_email is null or user_email<>invitation.email then raise exception 'invalid_invitation'; end if;
 insert into public.organization_members values(invitation.organization_id,auth.uid(),invitation.role) on conflict(organization_id,user_id) do nothing;
 update public.organization_invitations set accepted_at=now() where id=invitation.id;
 return invitation.organization_id;
end $$;

create function public.valid_catalog_import(p_payload jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare source jsonb; product jsonb; characteristic jsonb; reference text; identifiers text[]='{}'; product_ids text[]='{}';
begin
 if p_payload->>'mappingVersion' is distinct from '1' or jsonb_typeof(p_payload->'sources') is distinct from 'array' or jsonb_typeof(p_payload->'products') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_payload->'sources') not between 1 and 500 or jsonb_array_length(p_payload->'products') not between 1 and 1000 then return false; end if;
 for source in select * from jsonb_array_elements(p_payload->'sources') loop
  if coalesce(source->>'id','') !~ '^[a-zA-Z0-9_-]{1,120}$' or (source->>'id')=any(identifiers) or source#>>'{terms,status}' is distinct from 'permitted' or source->>'retrievalStatus' is distinct from 'retrieved' or coalesce(source->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(length(source->>'rawLocator'),0)=0 or coalesce(source->>'url','') !~ '^https?://' or coalesce(length(source->>'observedAt'),0)=0 then return false; end if;
  identifiers=array_append(identifiers,source->>'id');
 end loop;
 for product in select * from jsonb_array_elements(p_payload->'products') loop
  if coalesce(product->>'id','') !~ '^[a-zA-Z0-9_-]{1,120}$' or (product->>'id')=any(product_ids) or coalesce(length(product->>'name'),0)=0 or coalesce(length(product->>'vendor'),0)=0 or jsonb_typeof(product->'sourceIds') is distinct from 'array' or jsonb_typeof(product->'characteristics') is distinct from 'array' or product#>>'{readiness,economics}' is distinct from 'false' or product#>>'{readiness,simulation}' is distinct from 'false' or product#>>'{readiness,procurement}' is distinct from 'false' then return false; end if;
  if jsonb_array_length(product->'sourceIds')=0 then return false; end if;
  product_ids=array_append(product_ids,product->>'id');
  for reference in select jsonb_array_elements_text(product->'sourceIds') loop if not(reference=any(identifiers)) then return false; end if; end loop;
  for characteristic in select * from jsonb_array_elements(product->'characteristics') loop
   if coalesce(characteristic->>'sourceId','')<>all(identifiers) or characteristic->>'status' not in ('vendor_claim','operator_reported','verified_primary') or jsonb_typeof(characteristic->'value') not in ('number','string') then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
create function public.stage_catalog_import(p_org uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare import_id uuid;
begin
 if coalesce(public.member_role(p_org),'') not in ('owner','editor') then raise exception 'forbidden'; end if;
 if not public.valid_catalog_import(p_payload) then raise exception 'invalid_provenance'; end if;
 insert into public.catalog_imports(organization_id,payload,created_by) values(p_org,p_payload,auth.uid()) returning id into import_id;
 return jsonb_build_object('id',import_id,'status','staged');
end $$;
create function public.publish_catalog_import(p_org uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staged public.catalog_imports; publication_id uuid;
begin
 if public.member_role(p_org) is distinct from 'owner' then raise exception 'forbidden'; end if;
 select * into staged from public.catalog_imports where id=p_id and organization_id=p_org and status='staged' for update;
 if staged.id is null or not public.valid_catalog_import(staged.payload) then raise exception 'invalid_staging'; end if;
 insert into public.catalog_publications(organization_id,import_id,payload) values(p_org,p_id,staged.payload) returning id into publication_id;
 update public.catalog_imports set status='published' where id=p_id;
 return jsonb_build_object('id',publication_id,'status','published','scope','organization');
end $$;

revoke all on function public.member_role(uuid),public.create_organization(text),public.save_scenario(uuid,uuid,text,jsonb,integer),public.create_invitation(uuid,text,text),public.accept_invitation(text),public.valid_catalog_import(jsonb),public.stage_catalog_import(uuid,jsonb),public.publish_catalog_import(uuid,uuid) from public,anon;
grant execute on function public.member_role(uuid),public.create_organization(text),public.save_scenario(uuid,uuid,text,jsonb,integer),public.create_invitation(uuid,text,text),public.accept_invitation(text),public.stage_catalog_import(uuid,jsonb),public.publish_catalog_import(uuid,uuid) to authenticated;
