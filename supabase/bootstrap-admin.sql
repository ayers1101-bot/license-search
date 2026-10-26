-- Run AFTER invite-only.sql. This authorizes an Email; it does NOT create an Auth user or a password.
insert into public.team_access(email,role,active)
values('ayers1101@gmail.com','admin',true)
on conflict(email) do update set role='admin',active=true,updated_at=now();
