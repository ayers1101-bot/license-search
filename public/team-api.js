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
export async function signup(email,password){return request('/auth/v1/signup',{method:'POST',body:{email,password}});}
export async function user(){return request('/auth/v1/user',{token:await access()});}
export async function signout(){try{await request('/auth/v1/logout',{method:'POST',token:await access()});}finally{logout();}}
export async function query(path){return request('/rest/v1/'+path,{token:await access()});}
export async function rpc(name,body){return request('/rest/v1/rpc/'+name,{method:'POST',body,token:await access()});}
