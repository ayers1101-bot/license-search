-- Apply after schema.sql. Does not remove projects, members or historical versions.
begin;
create table if not exists public.team_access (
 email text primary key check(email=lower(trim(email))),
 role text not null default 'member' check(role in ('admin','member')),
 active boolean not null default true,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.team_profiles (
 user_id uuid primary key references auth.users(id),
 display_name text not null check(length(trim(display_name)) between 2 and 50),
 completed_at timestamptz not null default now()
);
create table if not exists public.team_access_events (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 target_email text not null,
 enabled boolean not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.team_access enable row level security;
alter table public.team_profiles enable row level security;
alter table public.team_access_events enable row level security;
revoke all on public.team_access,public.team_profiles,public.team_access_events from anon,authenticated;
grant select on public.team_access,public.team_profiles,public.team_access_events to authenticated;

create or replace function public.team_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.team_access a join auth.users u on lower(u.email)=a.email where u.id=auth.uid() and a.active and u.email_confirmed_at is not null);
$$;
create or replace function public.team_ready() returns boolean language sql stable security definer set search_path='' as $$
 select public.team_allowed() and exists(select 1 from public.team_profiles p where p.user_id=auth.uid());
$$;
create or replace function public.team_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.team_ready() and exists(select 1 from public.team_access a join auth.users u on lower(u.email)=a.email where u.id=auth.uid() and a.role='admin' and a.active);
$$;
create or replace function public.team_access_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',public.team_allowed(),'ready',public.team_ready(),'admin',public.team_admin(),'display_name',(select display_name from public.team_profiles where user_id=auth.uid()));
$$;
create or replace function public.team_complete_profile(account_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.team_allowed() then raise exception '此 Email 尚未獲准使用，請聯絡管理者'; end if;
 if account_name is null or length(trim(account_name)) not between 2 and 50 then raise exception '個人名稱須為 2–50 字'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and coalesce(encrypted_password,'')<>'') then raise exception '請先設定個人密碼'; end if;
 insert into public.team_profiles(user_id,display_name) values(auth.uid(),trim(account_name)) on conflict(user_id) do update set display_name=excluded.display_name;
end; $$;
create or replace function public.team_access_set(target_email text, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare target text:=lower(trim(target_email));
begin
 if not public.team_admin() then raise exception '只有系統管理者可設定使用者'; end if;
 if target is null or length(target)>254 or target !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or enabled is null then raise exception 'Email 或使用權設定錯誤'; end if;
 if exists(select 1 from public.team_access where email=target and role='admin') then raise exception '管理者權限需由資料庫管理，不能在此變更'; end if;
 insert into public.team_access(email,active,updated_by) values(target,enabled,auth.uid()) on conflict(email) do update set active=excluded.active,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into public.team_access_events(actor_id,target_email,enabled) values(auth.uid(),target,enabled);
end; $$;

drop policy if exists access_read on public.team_access;
create policy access_read on public.team_access for select to authenticated using(public.team_admin());
drop policy if exists profile_read on public.team_profiles;
create policy profile_read on public.team_profiles for select to authenticated using(user_id=auth.uid() and public.team_allowed());
drop policy if exists access_event_read on public.team_access_events;
create policy access_event_read on public.team_access_events for select to authenticated using(public.team_admin());
-- Existing project policies still apply, plus a mandatory site-level access check.
do $$declare tab text;begin
 foreach tab in array array['team_projects','team_members','team_versions','team_events'] loop
  execute format('drop policy if exists site_access on public.%I',tab);
  execute format('create policy site_access on public.%I as restrictive for all to authenticated using(public.team_ready()) with check(public.team_ready())',tab);
 end loop;
end $$;
create or replace function public.team_role(pid uuid) returns text language sql stable security definer set search_path='' as $$
 select case when not public.team_ready() then null when p.owner_id=auth.uid() then 'owner' else m.role end
 from public.team_projects p left join public.team_members m on m.project_id=p.id and m.user_id=auth.uid() where p.id=pid;
$$;
-- Original edit/restore/member/review RPCs call team_role; new project creation needs an explicit guard too.
create schema if not exists team_private;
revoke all on schema team_private from public,anon,authenticated;
do $$begin
 if to_regprocedure('team_private.team_write(uuid,bigint,jsonb,text)') is null then
  alter function public.team_write(uuid,bigint,jsonb,text) set schema team_private;
 end if;
end $$;
revoke all on function team_private.team_write(uuid,bigint,jsonb,text) from public,anon,authenticated;
create or replace function public.team_write(pid uuid,expected_revision bigint,body jsonb,change_reason text)
returns public.team_projects language plpgsql security definer set search_path='' as $$
begin
 if not public.team_ready() then raise exception '此 Email 未獲准使用或尚未完成個人設定'; end if;
 return team_private.team_write(pid,expected_revision,body,change_reason);
end; $$;
revoke all on function public.team_allowed(),public.team_ready(),public.team_admin(),public.team_access_status(),public.team_complete_profile(text),public.team_access_set(text,boolean),public.team_write(uuid,bigint,jsonb,text) from public;
grant execute on function public.team_allowed(),public.team_ready(),public.team_admin(),public.team_access_status(),public.team_complete_profile(text),public.team_access_set(text,boolean),public.team_write(uuid,bigint,jsonb,text) to authenticated;
notify pgrst, 'reload schema';
commit;
