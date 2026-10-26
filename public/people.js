// Pure import validation shared by the browser and regression tests.
export function planImport(rows, existing) {
 const errors=[], records=[], seen=new Set();
 if(!rows.length) return {errors:['工作表沒有資料'],records:[]};
 const headers=rows[0].map(v=>String(v??'').trim().toLowerCase());
 const aliases={id:['工號','員工編號','employeeid','employee id'],name:['姓名','人名','name'],email:['email','電子郵件','e-mail']};
 const cols=Object.fromEntries(Object.entries(aliases).map(([k,a])=>[k,headers.findIndex(h=>a.includes(h))]));
 if(Object.values(cols).some(i=>i<0))return {errors:['第一列須包含：工號、姓名、Email'],records:[]};
 for(let i=1;i<rows.length;i++){
  const row=rows[i];if(row.every(v=>String(v??'').trim()===''))continue;
  const p=Object.fromEntries(Object.entries(cols).map(([k,n])=>[k,String(row[n]??'').trim()]));
  if(!p.id||!p.name||!/^([^\s@<>]+)@([^\s@<>]+)\.[^\s@<>]+$/.test(p.email)||/[\r\n]/.test(p.email))errors.push(`第 ${i+1} 列：工號、姓名或 Email 無效`);
  else if(seen.has(p.id))errors.push(`第 ${i+1} 列：工號 ${p.id} 重複`);
  else {seen.add(p.id);const old=existing.find(e=>e.id===p.id);records.push({...p,action:!old?'新增':old.name!==p.name||old.email!==p.email?'更新':'不變'});}
 }
 if(!records.length&&!errors.length)errors.push('沒有可匯入的人員');
 return {errors,records};
}
export function resolvePerson(task,people){return people.find(p=>p.id===task.employeeId);}
export function activeReminder(task){
 if(task.status==='done')return null;
 const rule=task.reminders?.[task.status];
 return rule&&rule.frequency!=='off'?rule:null;
}
