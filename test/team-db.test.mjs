import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
test('database enforces membership, immutable history, concurrent edits, review and time restore',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(let i=0;i<ids.length;i++)await db.query('insert into auth.users values($1,$2)',[ids[i],['owner@example.com','editor@example.com','viewer@example.com'][i]]);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 async function as(i){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await db.exec('set role authenticated');}
 await as(0);const body={name:'Project',tasks:[]};const result=await db.query('select * from public.team_write(null,null,$1::jsonb,$2)',[JSON.stringify(body),'建立']);const p=result.rows[0];assert.equal(p.revision,1);
 await as(1);assert.equal((await db.query('select * from public.team_projects')).rows.length,0);await assert.rejects(db.query('select public.team_write($1,1,$2::jsonb,$3)',[p.id,JSON.stringify(body),'未授權']),/沒有編輯權限/);
 await as(0);await db.query("select public.team_member($1,'editor@example.com','editor')",[p.id]);await db.query("select public.team_member($1,'viewer@example.com','viewer')",[p.id]);
 await as(1);assert.equal((await db.query('select * from public.team_projects')).rows.length,1);body.name='Changed';await db.query('select public.team_write($1,1,$2::jsonb,$3)',[p.id,JSON.stringify(body),'修改名稱']);await assert.rejects(db.query('select public.team_write($1,1,$2::jsonb,$3)',[p.id,JSON.stringify(body),'過期寫入']),/版本衝突/);
 await assert.rejects(db.query('delete from public.team_versions'),/permission denied/);await assert.rejects(db.query('update public.team_projects set document=$1',[JSON.stringify(body)]),/permission denied/);
 await as(2);await assert.rejects(db.query('select public.team_write($1,2,$2::jsonb,$3)',[p.id,JSON.stringify(body),'檢視者修改']),/沒有編輯權限/);await assert.rejects(db.query('select public.team_restore($1,2,now(),$2)',[p.id,'禁止還原']),/只有擁有者/);
 await as(0);const history=(await db.query('select * from public.team_versions order by revision')).rows;assert.equal(history.length,2);await db.query("select public.team_review($1,'approved','確認內容')",[history[1].id]);assert.equal((await db.query("select * from public.team_events where kind='review'")).rows.length,1);
 const firstTime=(await db.query('select created_at::text as t from public.team_versions where id=$1',[history[0].id])).rows[0].t;
 await db.query('select public.team_restore($1,2,$2::timestamptz,$3)',[p.id,firstTime,'回復原始版本']);const restored=(await db.query('select * from public.team_projects')).rows[0];assert.equal(restored.revision,3);assert.equal(restored.document.name,'Project');assert.equal((await db.query('select * from public.team_versions')).rows.length,3);
 await assert.rejects(db.query("select public.team_restore($1,3,'2000-01-01','不存在的時間')",[p.id]),/尚無專案版本/);await assert.rejects(db.query("select public.team_restore($1,3,'2999-01-01','未來時間')",[p.id]),/晚於現在/);
 await db.query("select public.team_member($1,'editor@example.com','remove')",[p.id]);await as(1);assert.equal((await db.query('select * from public.team_projects')).rows.length,0);await assert.rejects(db.query('select public.team_write($1,3,$2::jsonb,$3)',[p.id,JSON.stringify(body),'已移除']),/沒有編輯權限/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.team_projects'),/permission denied/);
 }finally{await db.close();}
});
