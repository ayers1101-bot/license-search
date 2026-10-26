-- Run once in a new Supabase project's SQL Editor. No service-role key is used by the browser.
begin;
create table public.team_projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 document jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 check (jsonb_typeof(document) = 'object' and length(trim(document->>'name')) between 1 and 120 and jsonb_typeof(document->'tasks') = 'array')
);
create table public.team_members (
 project_id uuid not null references public.team_projects(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('editor','viewer')),
 primary key(project_id,user_id)
);
create table public.team_versions (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.team_projects(id),
 revision bigint not null,
 actor_id uuid not null references auth.users(id),
 actor_email text not null,
 kind text not null check(kind in ('create','edit','restore')),
 document jsonb not null,
 reason text not null,
 restored_from bigint references public.team_versions(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(project_id,revision)
);
create table public.team_events (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.team_projects(id),
 actor_id uuid not null references auth.users(id),
 actor_email text not null,
 kind text not null check(kind in ('member','review')),
 detail jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index team_members_user on public.team_members(user_id);
create index team_versions_time on public.team_versions(project_id,created_at);

create function public.team_role(pid uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=auth.uid() then 'owner' else m.role end
 from public.team_projects p left join public.team_members m on m.project_id=p.id and m.user_id=auth.uid() where p.id=pid;
$$;
alter table public.team_projects enable row level security;
alter table public.team_members enable row level security;
alter table public.team_versions enable row level security;
alter table public.team_events enable row level security;
create policy project_read on public.team_projects for select to authenticated using (public.team_role(id) is not null);
create policy member_read on public.team_members for select to authenticated using (public.team_role(project_id) is not null);
create policy version_read on public.team_versions for select to authenticated using (public.team_role(project_id) is not null);
create policy event_read on public.team_events for select to authenticated using (public.team_role(project_id) is not null);
-- All writes use checked RPC functions. No client can overwrite/delete the audit trail.
revoke all on public.team_projects,public.team_members,public.team_versions,public.team_events from anon,authenticated;
grant select on public.team_projects,public.team_members,public.team_versions,public.team_events to authenticated;

create function public.team_write(pid uuid, expected_revision bigint, body jsonb, change_reason text)
returns public.team_projects language plpgsql security definer set search_path='' as $$
declare p public.team_projects; who text; r text;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 if change_reason is null or length(trim(change_reason)) not between 1 and 1000 then raise exception '請填寫修改原因（1–1000 字）'; end if;
 if body is null or jsonb_typeof(body) <> 'object' or body->>'name' is null or length(trim(body->>'name')) not between 1 and 120 or jsonb_typeof(body->'tasks') is distinct from 'array' or pg_column_size(body)>1048576 then raise exception '專案格式錯誤或超過 1 MB'; end if;
 select email into who from auth.users where id=auth.uid();
 if pid is null then
  insert into public.team_projects(owner_id,document) values(auth.uid(),body) returning * into p;
 else
  select * into p from public.team_projects where id=pid for update;
  r:=public.team_role(pid);
  if r is null or r not in ('owner','editor') then raise exception '沒有編輯權限'; end if;
  if expected_revision is null or p.revision<>expected_revision then raise exception '版本衝突，請重新載入後再修改'; end if;
  update public.team_projects set document=body,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 end if;
 insert into public.team_versions(project_id,revision,actor_id,actor_email,kind,document,reason)
 values(p.id,p.revision,auth.uid(),coalesce(who,''),case when pid is null then 'create' else 'edit' end,p.document,trim(change_reason));
 return p;
end; $$;

create function public.team_restore(pid uuid, expected_revision bigint, point_in_time timestamptz, change_reason text)
returns public.team_projects language plpgsql security definer set search_path='' as $$
declare p public.team_projects; v public.team_versions; who text;
begin
 select * into p from public.team_projects where id=pid for update;
 if public.team_role(pid) is distinct from 'owner' then raise exception '只有擁有者可以還原'; end if;
 if expected_revision is null or p.revision<>expected_revision then raise exception '版本衝突，請重新載入'; end if;
 if change_reason is null or length(trim(change_reason)) not between 1 and 1000 then raise exception '請填寫還原原因'; end if;
 if point_in_time is null or point_in_time>clock_timestamp() then raise exception '還原時間不可為空或晚於現在'; end if;
 select * into v from public.team_versions where project_id=pid and created_at<=point_in_time order by revision desc limit 1;
 if v.id is null then raise exception '該時間點尚無專案版本'; end if;
 select email into who from auth.users where id=auth.uid();
 update public.team_projects set document=v.document,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 insert into public.team_versions(project_id,revision,actor_id,actor_email,kind,document,reason,restored_from)
 values(pid,p.revision,auth.uid(),coalesce(who,''),'restore',p.document,trim(change_reason),v.id);
 return p;
end; $$;

create function public.team_member(pid uuid, member_email text, member_role text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; who text;
begin
 -- Lock the project to serialize membership removal against in-flight edits/restores.
 perform 1 from public.team_projects where id=pid for update;
 if public.team_role(pid) is distinct from 'owner' then raise exception '只有擁有者可以管理成員'; end if;
 if member_role is null or member_role not in ('editor','viewer','remove') then raise exception '角色錯誤'; end if;
 select id into uid from auth.users where lower(email)=lower(trim(member_email));
 if uid is null then raise exception '此 Email 尚未註冊，請先請同事註冊並驗證帳號'; end if;
 if uid=auth.uid() then raise exception '不可變更擁有者角色'; end if;
 if member_role='remove' then delete from public.team_members where project_id=pid and user_id=uid;
 else insert into public.team_members values(pid,uid,member_role) on conflict(project_id,user_id) do update set role=excluded.role; end if;
 select email into who from auth.users where id=auth.uid();
 insert into public.team_events(project_id,actor_id,actor_email,kind,detail) values(pid,auth.uid(),coalesce(who,''),'member',jsonb_build_object('email',lower(trim(member_email)),'role',member_role));
end; $$;

create function public.team_review(version_id bigint, decision text, comment_text text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.team_versions; who text;
begin
 select * into v from public.team_versions where id=version_id;
 if public.team_role(v.project_id) is distinct from 'owner' then raise exception '只有擁有者可以審閱'; end if;
 if decision is null or decision not in ('approved','changes_requested') then raise exception '審閱結果錯誤'; end if;
 if comment_text is null or length(trim(comment_text)) not between 1 and 1000 then raise exception '請填寫審閱意見'; end if;
 select email into who from auth.users where id=auth.uid();
 insert into public.team_events(project_id,actor_id,actor_email,kind,detail)
 values(v.project_id,auth.uid(),coalesce(who,''),'review',jsonb_build_object('version_id',v.id,'decision',decision,'comment',trim(comment_text)));
end; $$;

revoke all on function public.team_role(uuid),public.team_write(uuid,bigint,jsonb,text),public.team_restore(uuid,bigint,timestamptz,text),public.team_member(uuid,text,text),public.team_review(bigint,text,text) from public;
grant execute on function public.team_role(uuid),public.team_write(uuid,bigint,jsonb,text),public.team_restore(uuid,bigint,timestamptz,text),public.team_member(uuid,text,text),public.team_review(bigint,text,text) to authenticated;
commit;
