import {teamConfig} from '../../public/team-config.js';
// Only this server function reads the administrative key. It must never be bundled into public/.
export async function handleInvite(request,{env=process.env,fetcher=fetch}={}){
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply(405,{message:'只接受 POST'});
 const site=env.TEAM_SITE_URL||'https://deft-naiad-72ef5b.netlify.app';
 let redirect;try{const u=new URL(site);if(u.protocol!=='https:'||u.username||u.password)throw Error();redirect=new URL('/team.html',u.origin).href;if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin)return reply(403,{message:'來源不允許'});}catch{return reply(503,{message:'網站網址尚未正確設定'});}
 const token=request.headers.get('authorization');if(!token?.startsWith('Bearer '))return reply(401,{message:'請先登入管理者帳號'});
 const secret=env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)return reply(503,{message:'邀請寄信服務尚未設定，請管理者依設定文件填寫 Netlify 伺服器環境變數'});
 let input;try{input=await request.json();}catch{return reply(400,{message:'請提供 Email'});}
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return reply(400,{message:'Email 格式錯誤'});
 const publicHeaders={apikey:teamConfig.publishableKey,Authorization:token,'Content-Type':'application/json'};
 try{
  const who=await fetcher(teamConfig.url+'/auth/v1/user',{headers:publicHeaders});if(!who.ok)return reply(401,{message:'登入已失效，請重新登入'});
  const check=await fetcher(teamConfig.url+'/rest/v1/rpc/team_access_status',{method:'POST',headers:publicHeaders,body:'{}'});const status=check.ok?await check.json():null;
  if(!status?.admin)return reply(403,{message:'只有系統管理者可以邀請使用者'});
  const grant=await fetcher(teamConfig.url+'/rest/v1/rpc/team_access_set',{method:'POST',headers:publicHeaders,body:JSON.stringify({target_email:email,enabled:true})});
  if(!grant.ok)return reply(400,{message:'無法儲存允許名單，請確認 Email 與管理者權限'});
  const sent=await fetcher(teamConfig.url+'/auth/v1/invite?redirect_to='+encodeURIComponent(redirect),{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({email})});
  if(sent.ok)return reply(200,{allowed:true,delivered:true,message:'已核准並寄出邀請信，請對方開啟邀請設定個人名稱與密碼。'});
  const error=await sent.json().catch(()=>({}));
  if(['email_exists','user_already_exists'].includes(error.code)||/already.*registered/i.test(error.msg||error.message||''))return reply(200,{allowed:true,delivered:false,message:'已核准使用；此 Email 已有帳號，請直接登入。首次登入會要求設定個人名稱與密碼；若忘記密碼，請由管理者在 Supabase 寄送密碼重設信。'});
  return reply(200,{allowed:true,delivered:false,message:/rate.limit/i.test(error.msg||error.message||'')?'使用權已核准，但邀請信寄送達限額，尚未寄出。請設定自訂 SMTP 後再寄送。':'使用權已核准，但邀請信尚未寄出。請檢查 Supabase Auth 寄信設定後再試。'});
 }catch{return reply(502,{message:'邀請服務連線失敗；請重新整理允許名單確認狀態，再決定是否重試。'});}
}
export default request=>handleInvite(request);
