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
// Keep each project and its parent/child branches contiguous, respecting saved sibling order.
export function ganttHierarchy(tasks){
 const key=t=>JSON.stringify([t.projectId??'',t.id]),lookup=new Map(tasks.map(t=>[key(t),t])),groups=new Map(),children=new Map(),rows=[],seen=new Set();
 for(const task of tasks){const group=task.projectId??'';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(task);if(task.parentId){const pk=key({...task,id:task.parentId});if(lookup.has(pk)){if(!children.has(pk))children.set(pk,[]);children.get(pk).push(task);}}}
 function visit(task,depth){const k=key(task);if(seen.has(k))return;seen.add(k);rows.push({task,depth});for(const child of children.get(k)||[])visit(child,depth+1);}
 for(const group of groups.values()){
  for(const task of group)if(!task.parentId||!lookup.has(key({...task,id:task.parentId})))visit(task,0);
  // Malformed historical links must not hide tasks or cause infinite recursion.
  for(const task of group)if(!seen.has(key(task)))visit(task,0);
 }
 return rows;
}
const ganttKey=t=>JSON.stringify([t.projectId??'',t.id]);
// Derived display ranges only: never mutate task dates or persist automatic changes.
export function ganttTimeline({tasks,allTasks=tasks,start,end}){
 const lookup=new Map(allTasks.map(t=>[ganttKey(t),t]));for(const task of tasks)lookup.set(ganttKey(task),task);
 const source=[...lookup.values()],children=new Map(),models=new Map(),building=new Set();
 for(const task of source){if(!task.parentId)continue;const pk=ganttKey({...task,id:task.parentId});if(lookup.has(pk)){if(!children.has(pk))children.set(pk,[]);children.get(pk).push(task);}}
 function model(task){
  const key=ganttKey(task);if(models.has(key))return models.get(key);
  if(building.has(key))return {task,range:schedule(task),isSummary:true,incomplete:true,missingCount:1,source:'manual-fallback'};
  building.add(key);const nested=(children.get(key)||[]).map(model),valid=nested.map(item=>item.range).filter(Boolean),isSummary=nested.length>0;
  const range=isSummary&&valid.length?{start:Math.min(...valid.map(d=>d.start)),end:Math.max(...valid.map(d=>d.end))}:schedule(task);
  const missingCount=isSummary?nested.reduce((n,item)=>n+item.missingCount,0):range?0:1;
  const result={task,range,isSummary,incomplete:isSummary&&(nested.some(item=>item.incomplete)||missingCount>0),missingCount,source:isSummary?(valid.length?'children':'manual-fallback'):'manual'};
  building.delete(key);models.set(key,result);return result;
 }
 for(const task of source)model(task);
 const visible=new Set(),matched=new Set(tasks.map(ganttKey));
 for(const task of tasks){const item=models.get(ganttKey(task));if(item.range&&(item.range.end<start||item.range.start>end))continue;let node=task;const seen=new Set();while(node&&!seen.has(ganttKey(node))){const key=ganttKey(node);seen.add(key);visible.add(key);node=node.parentId?lookup.get(ganttKey({...node,id:node.parentId})):null;}}
 const rows=ganttHierarchy(source).filter(({task})=>visible.has(ganttKey(task))).map(({task,depth})=>({...models.get(ganttKey(task)),depth,context:!matched.has(ganttKey(task))}));
 return {rows,missing:tasks.filter(t=>!models.get(ganttKey(t)).range),models};
}
const ganttDate=day=>new Date(day*86400000).toISOString().slice(0,10);
const numberLabel=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:1}).format(n);
export function planningAnalysis({tasks,allTasks=tasks,projects,view,startDate,endDate,todayDate}){
 const start=dayNumber(startDate),end=dayNumber(endDate),days=end-start+1;
 const error=!Number.isFinite(start)||!Number.isFinite(end)?'請填寫完整的日期區間。':days<1?'區間迄日不可早於起日。':days>366?'請選擇 366 天以內的區間。':'';
 if(error)return {error,html:'<div class="empty">請調整日期區間以查看分析。</div>'};
 const missing=tasks.filter(t=>!schedule(t));const included=tasks.filter(t=>{const d=schedule(t);return d&&d.start<=end&&d.end>=start;});
 const projectName=t=>projects.find(p=>p.id===t.projectId)?.name||'未分類案件';
 const unscheduled=missing.length?`<div class="schedule-missing"><h3>待補排程 · ${missing.length} 項</h3><p>缺少起始日、截止日或日期順序不正確，尚未計入日期區間分析。點擊任務即可補齊。</p><div>${missing.map(t=>`<button class="secondary" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}">${escape(t.title)} · ${escape(projectName(t))}</button>`).join('')}</div></div>`:'';
 if(view==='gantt'){
  const timeline=ganttTimeline({tasks,allTasks,start,end}),ordered=timeline.rows;
  const pending=timeline.missing.length?`<div class="schedule-missing"><h3>待補排程 · ${timeline.missing.length} 項</h3><p>這些任務尚無有效時程；有子任務的任務若可彙總，會直接顯示摘要範圍。</p><div>${timeline.missing.map(t=>`<button class="secondary" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}">${escape(t.title)} · ${escape(projectName(t))}</button>`).join('')}</div></div>`:'';
  const labels=Array.from({length:days},(_,i)=>{const date=ganttDate(start+i);return `<span class="gantt-day ${date===todayDate?'is-today':''}" title="${date}">${date.slice(5).replace('-','/')}</span>`;}).join('');
  const rows=ordered.map(item=>{
   const {task:t,range:d,isSummary,depth,context}=item,inRange=d&&d.start<=end&&d.end>=start;
   const rangeText=d?`${ganttDate(d.start)} 至 ${ganttDate(d.end)}`:'尚無有效排程';
   const title=`${t.title}：${isSummary?'摘要 ':''}${rangeText} · ${statuses[t.status]||'未設定'}${isSummary?'（顯示彙總，未修改原日期）':''}`;
   const style=inRange?`left:${(Math.max(start,d.start)-start)*38+2}px;width:${(Math.min(end,d.end)-Math.max(start,d.start)+1)*38-4}px`:'';
   const bar=inRange?`<button class="gantt-bar ${escape(t.status||'todo')} ${isSummary?'gantt-summary':''}" style="${style}" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}" data-display-start="${ganttDate(d.start)}" data-display-end="${ganttDate(d.end)}" title="${escape(title)}" aria-label="編輯 ${escape(title)}">${escape(t.title)}</button>`:`<span class="gantt-unplanned">${d?'時程在目前區間外':'待補排程'}</span>`;
   const badge=isSummary?'<span class="gantt-summary-badge">摘要</span>':'';
   const original=isSummary?`<small class="gantt-original">原日期：${escape(t.start||'未設定')} → ${escape(t.due||'未設定')}</small>`:'';
   const warning=item.incomplete?`<small class="gantt-incomplete">${item.source==='manual-fallback'?(item.range?'子任務尚無有效排程，暫顯原日期':'子任務尚無有效排程，摘要待補'):`${item.missingCount} 項下層任務待補排程，摘要尚未完整`}</small>`:'';
   return `<div class="gantt-row ${isSummary?'gantt-summary-row':''} ${context?'gantt-context-row':''}" data-gantt-id="${escape(t.id)}" data-gantt-project="${escape(t.projectId||'')}" data-gantt-depth="${depth}" style="--gantt-depth:${Math.min(depth,6)}"><button class="gantt-label" data-task="${escape(t.id)}" data-analysis-project="${escape(t.projectId||'')}"><strong>${depth?'<span class="gantt-branch" aria-hidden="true">↳</span>':''}${escape(t.title)} ${badge}</strong><small>${escape(projectName(t))} · ${escape(t.assignee||'未指派')} · ${statuses[t.status]||'未設定'}${context?' · 上層脈絡':''}</small>${original}${warning}${describeDependencies(t,allTasks)}</button><div class="gantt-track" style="width:${days*38}px">${bar}</div></div>`;
  }).join('');
  const connections=ordered.flatMap((item,index)=>{
   const target=item.range;if(!target||target.start>end||target.end<start)return [];
   return getPredecessors(item.task,allTasks).flatMap(parent=>{const source=ordered.findIndex(row=>ganttKey(row.task)===ganttKey(parent));if(source<0)return [];const origin=ordered[source].range;if(!origin||origin.start>end||origin.end<start)return [];const x1=240+(Math.min(end,origin.end)-start+1)*38-2,x2=240+(Math.max(start,target.start)-start)*38+2,y1=44+source*100+33,y2=44+index*100+33,bend=Math.max(x1+12,x2-12);return [`<path d="M ${x1} ${y1} H ${bend} V ${y2} H ${x2}" marker-end="url(#dependency-arrow)"><title>${escape(parent.title)} → ${escape(item.task.title)}</title></path>`];});
  }).join('');
  const arrows=connections?`<svg class="gantt-connections" width="${240+days*38}" height="${44+ordered.length*100}" aria-hidden="true"><defs><marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z"/></marker></defs>${connections}</svg>`:'';
  const html=`<div class="analysis-heading"><div><h2>案件甘特圖</h2><p>${ordered.length} 項任務（含上層脈絡） · ${escape(startDate)} — ${escape(endDate)}</p></div><div class="gantt-legend"><span>待開始</span><span>進行中</span><span>已完成</span><span class="summary-legend">摘要時程</span></div></div><p class="analysis-note">任務依階層分組，同層保留已儲存的排序。摘要條涵蓋所有有效下層時程，只改顯示、不改寫原日期；原日期顯示於名稱下方。篩選會保留上層脈絡，摘要仍包含被篩選隱藏的子任務。相依箭頭僅連接目前區間內有時程的任務。點擊可編輯任務。</p>${ordered.length?`<div class="gantt-scroll" tabindex="0" role="region" aria-label="案件甘特圖，可左右捲動"><div class="gantt" style="min-width:${240+days*38}px"><div class="gantt-row gantt-header"><div class="gantt-label">任務階層 / 案件 / 負責人</div><div class="gantt-days">${labels}</div></div>${rows}${arrows}</div></div>`:'<div class="empty">此區間沒有符合條件的排程任務，可新增任務或調整日期與篩選條件。</div>'}${pending}`;
  return {html,error:''};
 }

 const groups=new Map();for(const t of included){const person=t.employeeId?`${(t.assignee||'').trim()} · ${t.employeeId}`:(t.assignee||'').trim()||'未指派';if(!groups.has(person))groups.set(person,{person,tasks:[],hours:0,unknown:0});const g=groups.get(person);g.tasks.push(t);if(t.status!=='done'){if(knownHours(t)){const d=schedule(t);g.hours+=Number(t.hours)*(Math.min(end,d.end)-Math.max(start,d.start)+1)/(d.end-d.start+1);}else g.unknown++;}}
 const people=[...groups.values()].sort((a,b)=>b.hours-a.hours||a.person.localeCompare(b.person,'zh-TW'));const total=people.reduce((n,g)=>n+g.hours,0),max=Math.max(1,...people.map(g=>g.hours));
 const html=`<div class="analysis-heading"><div><h2>人力資源分析</h2><p>依負責人彙整區間內任務，掌握待辦分配與預估投入。</p></div><div class="resource-total"><strong>${numberLabel(total)}<small> h</small></strong><span>區間未完成預估工時</span></div></div><p class="analysis-note">工時依起訖日的日曆天數平均分攤至所選區間，已完成任務不計入待投入工時。未估工時不視為零；此分析未設定個人可用工時，因此不判定超載。</p><div class="table-scroll"><table class="task-list resource-table"><thead><tr><th>負責人 / 工時分配</th><th>待開始</th><th>進行中</th><th>已完成</th><th>最高同時未完成任務</th><th>未估工時</th></tr></thead><tbody>${people.map(g=>{const active=g.tasks.filter(t=>t.status!=='done');let peak=0;for(let day=start;day<=end;day++){peak=Math.max(peak,active.filter(t=>{const d=schedule(t);return d.start<=day&&d.end>=day;}).length);}return `<tr><td><div class="resource-person"><strong>${escape(g.person)}</strong><span>${numberLabel(g.hours)} h</span></div><div class="resource-meter"><i style="width:${g.hours/max*100}%"></i></div></td>${Object.keys(statuses).map(s=>`<td>${g.tasks.filter(t=>t.status===s).length}</td>`).join('')}<td>${peak}</td><td>${g.unknown?g.unknown+' 項':'—'}</td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">此區間沒有符合條件的排程任務。</td></tr>'}</tbody></table></div>${unscheduled}`;
 return {html,error:''};
}
