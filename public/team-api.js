import {teamConfig} from './team-config.js';
const SESSION='teamflow.auth.session';let session=null;
try{session=JSON.parse(sessionStorage.getItem(SESSION)||'null');}catch{}
export const configured=()=>/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(teamConfig.url)&&!!teamConfig.publishableKey&&!teamConfig.publishableKey.startsWith('sb_secret_')&&!isPrivilegedKey(teamConfig.publishableKey);
function isPrivilegedKey(key){try{return JSON.parse(atob(key.split('.')[1])).role==='service_role';}catch{return false;}}
function setSession(s){session=s;sessionStorage.setItem(SESSION,JSON.stringify(s));}
export function logout(){session=null;sessionStorage.removeItem(SESSION);}
async function request(path,{method='GET',body,token}={}){
 const response=await fetch(teamConfig.url+path,{method,headers:{apikey:teamConfig.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}if(!response.ok){const error=Error(data?.message||data?.error_description||data?.msg||`請求失敗 (${response.status})`);error.code=data?.code||data?.error_code;error.status=response.status;throw error;}return data;
}
async function access(){if(!session)throw Error('請先登入');if(Date.now()>=session.expires_at*1000-60000){const s=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});setSession({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in});}return session.access_token;}
export async function login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});setSession({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in});return s.user;}
export async function user(){return request('/auth/v1/user',{token:await access()});}
export async function signout(){try{await request('/auth/v1/logout',{method:'POST',token:await access()});}finally{logout();}}
export async function query(path){return request('/rest/v1/'+path,{token:await access()});}
export async function rpc(name,body){return request('/rest/v1/rpc/'+name,{method:'POST',body,token:await access()});}

export async function consumeInvite(){
 const params=new URLSearchParams(location.hash.slice(1));
 if(!params.has('access_token')&&!params.has('error'))return false;
 history.replaceState(null,'',location.pathname+location.search);
 logout();
 if(params.has('error'))throw Error('邀請或重設密碼連結無效或已過期，請管理者重新寄送。');
 if(!['invite','recovery'].includes(params.get('type')))throw Error('請使用管理者提供的邀請連結，或以 Email 與密碼登入。');
 const token=params.get('access_token'),refresh=params.get('refresh_token');if(!token||!refresh)throw Error('邀請連結不完整，請管理者重新寄送。');
 try{await request('/auth/v1/user',{token});}catch{throw Error('邀請或重設密碼連結無效或已過期，請管理者重新寄送。');}
 setSession({access_token:token,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+(Number(params.get('expires_in'))||3600)});
 return true;
}
export async function finishProfile(displayName,password){
 await request('/auth/v1/user',{method:'PUT',token:await access(),body:{password}});
 await rpc('team_complete_profile',{account_name:displayName.trim()});
}
export async function invite(email){
 const response=await fetch('/.netlify/functions/team-invite',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await access()},body:JSON.stringify({email})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'邀請服務無法使用，請確認 Netlify Functions 與環境變數設定');return data;
}
