-- Run after migrations with psql -v ON_ERROR_STOP=1 -f tests/rls-structure.sql.
-- Structural checks use no domain fixtures and are NOT a live two-tenant proof.
begin;
do $$
declare table_name text; function_name text;
begin
 foreach table_name in array array['organizations','organization_members','scenarios','scenario_versions','organization_invitations','catalog_imports','catalog_publications'] loop
  if not(select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then raise exception 'RLS disabled: %',table_name; end if;
  if has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') then raise exception 'Direct write privilege: %',table_name; end if;
  if has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Anonymous table privilege: %',table_name; end if;
 end loop;
 foreach function_name in array array['create_organization(text)','save_scenario(uuid,uuid,text,jsonb,integer)','create_invitation(uuid,text,text)','accept_invitation(text)','stage_catalog_import(uuid,jsonb)','publish_catalog_import(uuid,uuid)'] loop
  if has_function_privilege('anon','public.'||function_name,'EXECUTE') then raise exception 'Anonymous RPC privilege: %',function_name; end if;
 end loop;
 if public.valid_catalog_import('{}'::jsonb) then raise exception 'Empty import accepted'; end if;
end $$;
rollback;
