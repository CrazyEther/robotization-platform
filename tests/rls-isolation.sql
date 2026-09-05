-- Uses THREE EXISTING, DISTINCT auth.users IDs; never inserts fictional users or objects.
-- psql -v ON_ERROR_STOP=1 -v owner_id=... -v viewer_id=... -v outsider_id=... -f tests/rls-isolation.sql
-- Run as database administrator on isolated validation database. All writes rolled back.
begin;
select set_config('test.owner_id', :'owner_id', true);
select set_config('test.viewer_id', :'viewer_id', true);
select set_config('test.outsider_id', :'outsider_id', true);
do $$ begin
 if (select count(distinct id) from auth.users where id in (current_setting('test.owner_id')::uuid,current_setting('test.viewer_id')::uuid,current_setting('test.outsider_id')::uuid))<>3 then raise exception 'Three existing distinct auth users required'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner_id'),true);
set local role authenticated;
select set_config('test.org_id',(public.create_organization('Проверка изоляции доступа')).id::text,true);
select set_config('test.scenario_id',(public.save_scenario(current_setting('test.org_id')::uuid,null,'Пустое состояние для проверки прав','{}'::jsonb,null)).id::text,true);
reset role;
insert into public.organization_members values(current_setting('test.org_id')::uuid,current_setting('test.viewer_id')::uuid,'viewer');
select set_config('request.jwt.claim.sub',current_setting('test.viewer_id'),true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.scenarios where id=current_setting('test.scenario_id')::uuid) then raise exception 'Viewer cannot read own organization'; end if;
 begin
  perform public.save_scenario(current_setting('test.org_id')::uuid,current_setting('test.scenario_id')::uuid,'Forbidden','{}'::jsonb,1);
  raise exception using message='TEST_VIEWER_WRITE_SUCCEEDED',errcode='ZX001';
 exception when others then if sqlstate='ZX001' then raise; end if; end;
 begin
  perform public.create_invitation(current_setting('test.org_id')::uuid,'access-check@example.invalid','editor');
  raise exception using message='TEST_VIEWER_INVITE_SUCCEEDED',errcode='ZX001';
 exception when others then if sqlstate='ZX001' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.outsider_id'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.organizations where id=current_setting('test.org_id')::uuid) or exists(select 1 from public.scenarios where organization_id=current_setting('test.org_id')::uuid) or exists(select 1 from public.scenario_versions where organization_id=current_setting('test.org_id')::uuid) then raise exception 'Cross-tenant disclosure'; end if;
 begin
  perform public.save_scenario(current_setting('test.org_id')::uuid,null,'Forbidden','{}'::jsonb,null);
  raise exception using message='TEST_OUTSIDER_WRITE_SUCCEEDED',errcode='ZX001';
 exception when others then if sqlstate='ZX001' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner_id'),true);
set local role authenticated;
select public.save_scenario(current_setting('test.org_id')::uuid,current_setting('test.scenario_id')::uuid,'Пустое состояние: новая версия','{}'::jsonb,1);
do $$ begin
 if (select count(*) from public.scenario_versions where scenario_id=current_setting('test.scenario_id')::uuid)<>2 then raise exception 'History not atomic'; end if;
 begin
  perform public.save_scenario(current_setting('test.org_id')::uuid,current_setting('test.scenario_id')::uuid,'Stale','{}'::jsonb,1);
  raise exception using message='TEST_STALE_WRITE_SUCCEEDED',errcode='ZX001';
 exception when others then if sqlstate='ZX001' then raise; end if; end;
end $$;
rollback;
