export const planningStatuses={todo:'待開始',doing:'進行中',done:'已完成'};
const statuses=planningStatuses;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dayNumber(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:NaN;}
export function schedule(t){const start=dayNumber(t.start),end=dayNumber(t.due);return Number.isFinite(start)&&Number.isFinite(end)&&start<=end?{start,end}:null;}
export function knownHours(t){return t.hours!==''&&t.hours!=null&&Number.isFinite(Number(t.hours))&&Number(t.hours)>=0;}
export function predecessorIds(task){return Array.isArray(task.predecessors)?[...new Set(task.predecessors.filter(id=>typeof id==='string'))]:[];}
export function getPredecessors(task,tasks){return predecessorIds(task).map(id=>tasks.find(t=>t.id===id&&t.projectId===task.projectId)).filter(Boolean);}
export function getSuccessors(task,tasks){return tasks.filter(t=>t.projectId===task.projectId&&predecessorIds(t).includes(task.id));}
export function dependencyProblem(task,tasks){
 for(const id of predecessorIds(task)){
  if(id===task.id)return '任務不可相依於自己。';
  const parent=tasks.find(t=>t.id===id&&t.projectId===task.projectId);
  if(!parent)return '請選擇同案件中仍存在的前置任務。';
  const seen=new Set(),stack=[id];
  while(stack.length){const next=stack.pop();if(next===task.id)return '此關係會形成循環相依，請移除造成循環的前置任務。';if(seen.has(next))continue;seen.add(next);const node=tasks.find(t=>t.id===next&&t.projectId===task.projectId);if(node)stack.push(...predecessorIds(node));}
 }
 return '';
}
export function isReady(task,tasks){return task.status==='todo'&&predecessorIds(task).length>0&&!dependencyProblem(task,tasks)&&getPredecessors(task,tasks).every(t=>t.status==='done');}
export function describeDependencies(task,tasks){
 const parents=getPredecessors(task,tasks),children=getSuccessors(task,tasks);if(!parents.length&&!children.length)return '';
 const pending=parents.filter(t=>t.status!=='done'),conflicts=parents.filter(t=>Number.isFinite(dayNumber(t.due))&&Number.isFinite(dayNumber(task.start))&&task.start<=t.due);
 return `<div class="dependency-summary">${parents.length?`<span>前置：${parents.map(t=>escape(t.title)).join('、')}</span>`:''}${children.length?`<span>接續：${children.map(t=>escape(t.title)).join('、')}</span>`:''}${pending.length&&task.status!=='done'?`<span class="dependency-warning">${pending.length} 項前置尚未完成</span>`:''}${conflicts.length?'<span class="dependency-warning">排程衝突：起始日須晚於前置截止日</span>':''}</div>`;
}
const numberLabel=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:1}).format(n);
export function planningAnalysis({tasks,allTasks=tasks,projects,view,startDate,endDate,todayDate}){
 const start=dayNumber(startDate),end=dayNumber(endDate),days=end-start+1;
 const error=!Number.isFinite(start)||!Number.isFinite(end)?'請填寫完整的日期區間。':days<1?'區間迄日不可早於起日。':days>366?'請選擇 366 天以內的區間。':'';
 if(error)return {error,html:'<div class="empty">請調整日期區間以查看分析。</div>'};
 const missing=tasks.filter(t=>!schedule(t));const included=tasks.filter(t=>{const d=schedule(t);return d&&d.start<=end&&d.end>=start;});
 const projectName=t=>projects.find(p=>p.id===t.projectId)?.name||'未分類案件';
 const unscheduled=missing.length?`<div class="schedule-missing"><h3>待補排程 · ${missing.length} 項</h3><p>缺少起始日、截止日或日期順序不正確，尚未計入日期區間分析。點擊任務即可補齊。</p><div>${missing.map(t=>`<button class="secondary" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}">${escape(t.title)} · ${escape(projectName(t))}</button>`).join('')}</div></div>`:'';
 if(view==='gantt'){
  const labels=Array.from({length:days},(_,i)=>{const date=new Date((start+i)*86400000).toISOString().slice(0,10);return `<span class="gantt-day ${date===todayDate?'is-today':''}" title="${date}">${date.slice(5).replace('-','/')}</span>`;}).join('');
  const ordered=[...included].sort((a,b)=>a.start.localeCompare(b.start)||a.due.localeCompare(b.due));const rows=ordered.map(t=>{const d=schedule(t),offset=Math.max(start,d.start)-start,length=Math.min(end,d.end)-Math.max(start,d.start)+1;return `<div class="gantt-row"><button class="gantt-label" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}"><strong>${escape(t.title)}</strong><small>${escape(projectName(t))} · ${escape(t.assignee||'未指派')} · ${statuses[t.status]}</small>${describeDependencies(t,allTasks)}</button><div class="gantt-track" style="width:${days*38}px"><button class="gantt-bar ${t.status}" style="left:${offset*38+2}px;width:${length*38-4}px" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}" title="${escape(t.title)}：${escape(t.start)} 至 ${escape(t.due)} · ${statuses[t.status]}" aria-label="編輯 ${escape(t.title)}，${escape(t.start)} 至 ${escape(t.due)}">${escape(t.title)}</button></div></div>`;}).join('');
  const connections=ordered.flatMap((t,index)=>getPredecessors(t,allTasks).flatMap(parent=>{const source=ordered.findIndex(item=>item.id===parent.id&&item.projectId===parent.projectId);if(source<0)return [];const x1=240+(Math.min(end,dayNumber(parent.due))-start+1)*38-2,x2=240+(Math.max(start,dayNumber(t.start))-start)*38+2,y1=44+source*100+33,y2=44+index*100+33,bend=Math.max(x1+12,x2-12);return [`<path d="M ${x1} ${y1} H ${bend} V ${y2} H ${x2}" marker-end="url(#dependency-arrow)"><title>${escape(parent.title)} → ${escape(t.title)}</title></path>`];})).join('');
  const arrows=connections?`<svg class="gantt-connections" width="${240+days*38}" height="${44+ordered.length*100}" aria-hidden="true"><defs><marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z"/></marker></defs>${connections}</svg>`:'';
  const html=`<div class="analysis-heading"><div><h2>案件甘特圖</h2><p>${included.length} 項排程任務 · ${escape(startDate)} — ${escape(endDate)}</p></div><div class="gantt-legend"><span>待開始</span><span>進行中</span><span>已完成</span></div></div><p class="analysis-note">每日一格；長排程僅顯示與區間重疊的部分。點擊長條可編輯任務。箭頭由前置任務指向接續任務；僅連接目前顯示的任務，完整關係請見任務標籤。</p>${included.length?`<div class="gantt-scroll" tabindex="0" role="region" aria-label="案件甘特圖，可左右捲動"><div class="gantt" style="min-width:${240+days*38}px"><div class="gantt-row gantt-header"><div class="gantt-label">任務 / 案件 / 負責人</div><div class="gantt-days">${labels}</div></div>${rows}${arrows}</div></div>`:'<div class="empty">此區間沒有符合條件的排程任務，可新增任務或調整日期與篩選條件。</div>'}${unscheduled}`;
  return {html,error:''};
 }
 const groups=new Map();for(const t of included){const person=t.employeeId?`${(t.assignee||'').trim()} · ${t.employeeId}`:(t.assignee||'').trim()||'未指派';if(!groups.has(person))groups.set(person,{person,tasks:[],hours:0,unknown:0});const g=groups.get(person);g.tasks.push(t);if(t.status!=='done'){if(knownHours(t)){const d=schedule(t);g.hours+=Number(t.hours)*(Math.min(end,d.end)-Math.max(start,d.start)+1)/(d.end-d.start+1);}else g.unknown++;}}
 const people=[...groups.values()].sort((a,b)=>b.hours-a.hours||a.person.localeCompare(b.person,'zh-TW'));const total=people.reduce((n,g)=>n+g.hours,0),max=Math.max(1,...people.map(g=>g.hours));
 const html=`<div class="analysis-heading"><div><h2>人力資源分析</h2><p>依負責人彙整區間內任務，掌握待辦分配與預估投入。</p></div><div class="resource-total"><strong>${numberLabel(total)}<small> h</small></strong><span>區間未完成預估工時</span></div></div><p class="analysis-note">工時依起訖日的日曆天數平均分攤至所選區間，已完成任務不計入待投入工時。未估工時不視為零；此分析未設定個人可用工時，因此不判定超載。</p><div class="table-scroll"><table class="task-list resource-table"><thead><tr><th>負責人 / 工時分配</th><th>待開始</th><th>進行中</th><th>已完成</th><th>最高同時未完成任務</th><th>未估工時</th></tr></thead><tbody>${people.map(g=>{const active=g.tasks.filter(t=>t.status!=='done');let peak=0;for(let day=start;day<=end;day++){peak=Math.max(peak,active.filter(t=>{const d=schedule(t);return d.start<=day&&d.end>=day;}).length);}return `<tr><td><div class="resource-person"><strong>${escape(g.person)}</strong><span>${numberLabel(g.hours)} h</span></div><div class="resource-meter"><i style="width:${g.hours/max*100}%"></i></div></td>${Object.keys(statuses).map(s=>`<td>${g.tasks.filter(t=>t.status===s).length}</td>`).join('')}<td>${peak}</td><td>${g.unknown?g.unknown+' 項':'—'}</td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">此區間沒有符合條件的排程任務。</td></tr>'}</tbody></table></div>${unscheduled}`;
 return {html,error:''};
}
