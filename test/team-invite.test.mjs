import {test} from 'node:test';import assert from 'node:assert/strict';import {handleInvite} from '../netlify/functions/team-invite.mjs';
const env={SUPABASE_SERVICE_ROLE_KEY:'server-only-test-secret',TEAM_SITE_URL:'https://example.com'};
const req=(email='member@example.com',headers={})=>new Request('https://example.com/.netlify/functions/team-invite',{method:'POST',headers:{Authorization:'Bearer user-session',Origin:'https://example.com','Content-Type':'application/json',...headers},body:JSON.stringify({email})});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('rejects missing config, invalid tokens, non-admins and hostile origins before sending mail',async()=>{
 assert.equal((await handleInvite(req(),{env:{TEAM_SITE_URL:'https://example.com'},fetcher:()=>{throw Error('must not fetch');}})).status,503);
 assert.equal((await handleInvite(req('x@example.com',{Origin:'https://evil.example'}),{env})).status,403);
 assert.equal((await handleInvite(req(),{env,fetcher:async()=>json({},401)})).status,401);
 let calls=0;const response=await handleInvite(req(),{env,fetcher:async()=>{calls++;return calls===1?json({id:'user'}):json({admin:false});}});assert.equal(response.status,403);assert.equal(calls,2);
});
test('admin invitation grants access using user credentials and only server uses secret key',async()=>{
 const requests=[];const result=await handleInvite(req('Member@Example.com'),{env,fetcher:async(url,opts)=>{requests.push({url,...opts});if(url.endsWith('/user'))return json({id:'admin'});if(url.endsWith('/team_access_status'))return json({admin:true});return json({});}});assert.equal(result.status,200);assert.equal((await result.json()).delivered,true);assert.equal(requests.length,4);assert.equal(requests[2].headers.Authorization,'Bearer user-session');assert.equal(requests[3].headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);assert.match(requests[3].url,/redirect_to=https%3A%2F%2Fexample.com%2Fteam.html/);assert.equal(JSON.parse(requests[3].body).email,'member@example.com');
});
test('email limits distinguish saved authorization from undelivered invitations, with no retry',async()=>{
 let calls=0;const response=await handleInvite(req(),{env,fetcher:async url=>{calls++;return url.endsWith('/user')?json({id:'admin'}):url.endsWith('/team_access_status')?json({admin:true}):url.includes('/invite?')?json({msg:'email rate limit exceeded'},429):json(null);}});const result=await response.json();assert.equal(result.allowed,true);assert.equal(result.delivered,false);assert.match(result.message,/尚未寄出/);assert.equal(calls,4);assert.doesNotMatch(JSON.stringify(result),/server-only-test-secret/);
});
