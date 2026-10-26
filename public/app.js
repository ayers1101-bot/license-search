import {planImport, resolvePerson, activeReminder} from './people.js';
const KEY='teamflow.prototype.v1';
const statuses={todo:'待開始',doing:'進行中',done:'已完成'};
const priorities={high:'高優先',medium:'中優先',low:'低優先'};
const $=s=>document.querySelector(s);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const relativeDate=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function seed(){return {projects:[{id:'website',name:'網站改版計畫',description:'打造更直覺的品牌體驗，讓每一次造訪都更有價值。'},{id:'launch',name:'產品上市準備',description:'整合跨部門工作，讓新產品順利出發。'},{id:'team',name:'團隊日常協作',description:'讓例行工作有條不紊，為重要的事保留時間。'}],tasks:[['確認專案需求','彙整各部門需求，確認本次改版的目標與範圍。','林怡君',3,'todo','high'],['整理品牌素材','收集品牌識別、產品照片與文案，建立共用素材庫。','陳柏翰',5,'todo','medium'],['規劃網站資訊架構','重新梳理頁面層級與導覽路徑。','王雅婷',2,'doing','high'],['設計首頁視覺提案','根據品牌方向，完成首頁的第一版設計稿。','陳柏翰',6,'doing','medium'],['競品網站研究','分析同業的使用者體驗與內容策略。','林怡君',-1,'done','low'],['專案啟動會議','對齊團隊目標、分工與里程碑。','王雅婷',-3,'done','medium']].map((t,i)=>({id:'demo-'+i,projectId:'website',title:t[0],description:t[1],assignee:t[2],start:relativeDate(t[3]-4),hours:[8,12,16,24,6,2][i],due:relativeDate(t[3]),status:t[4],priority:t[5]}))};}
function valid(data){return data&&Array.isArray(data.projects)&&data.projects.length>0&&data.projects.every(p=>typeof p.id==='string'&&typeof p.name==='string')&&Array.isArray(data.tasks)&&data.tasks.every(t=>typeof t.id==='string'&&typeof t.title==='string'&&Object.hasOwn(statuses,t.status)&&Object.hasOwn(priorities,t.priority));}
let state;let storageError=false;
try{const raw=localStorage.getItem(KEY);state=raw?JSON.parse(raw):seed();if(!valid(state))throw Error('Invalid stored data');}catch{state=seed();storageError=true;}
state.people=Array.isArray(state.people)?state.people:[];
let current=state.projects[0].id,view='board',editing=null,dragged=null;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{toast('瀏覽器無法儲存，這次變更僅保留在目前頁面');return false;}}
function projectTasks(){return state.tasks.filter(t=>t.projectId===current);}
function render(){
 for(const task of state.tasks){const person=resolvePerson(task,state.people);if(person)task.assignee=person.name;}
 const project=state.projects.find(p=>p.id===current);$('#project-title').textContent=project.name;$('#project-description').textContent=project.description||'一起把計畫變成進展。';$('#breadcrumb').textContent=project.name;
 $('#project-list').innerHTML=state.projects.map(p=>`<button class="project-item ${p.id===current?'selected':''}" data-project="${escape(p.id)}"><span class="project-dot"></span>${escape(p.name)}</button>`).join('');
 const tasks=projectTasks(),done=tasks.filter(t=>t.status==='done').length,doing=tasks.filter(t=>t.status==='doing').length,late=tasks.filter(t=>t.status!=='done'&&t.due&&t.due<today()).length,percent=tasks.length?Math.round(done/tasks.length*100):0;
 $('#stats').innerHTML=[['專案任務',tasks.length,'▤',''],['進行中',doing,'◷',''],['已完成',done,'✓',`<small>${percent}% 完成率</small><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>`],['已逾期',late,'⚑','']].map(([name,n,icon,extra])=>`<div class="stat"><span class="stat-name">${name}</span><span class="stat-icon">${icon}</span><span class="stat-number">${n}${extra}</span></div>`).join('');
 const selected=$('#assignee-filter').value;const people=[...new Set(scopeTasks().map(t=>t.assignee).filter(Boolean))].sort();$('#assignee-filter').innerHTML='<option value="">所有負責人</option>'+people.map(p=>`<option value="${escape(p)}">${escape(p)}</option>`).join('');$('#assignee-filter').value=people.includes(selected)?selected:'';
 renderTasks();
 renderReadyTasks();
}
function scopeTasks(){return ['resources','gantt'].includes(view)&&$('#analysis-scope').value==='all'?state.tasks:projectTasks();}
function filtered(){const query=$('#search').value.trim().toLocaleLowerCase(),person=$('#assignee-filter').value;return scopeTasks().filter(t=>(!person||t.assignee===person)&&(!query||`${t.title} ${t.description||''} ${t.assignee||''}`.toLocaleLowerCase().includes(query)));}
// Dependencies are finish-to-start links within a project. Old tasks have no links.
function predecessorIds(task){return Array.isArray(task.predecessors)?[...new Set(task.predecessors.filter(id=>typeof id==='string'))]:[];}
function predecessors(task){return predecessorIds(task).map(id=>state.tasks.find(t=>t.id===id&&t.projectId===task.projectId)).filter(Boolean);}
function successors(task){return state.tasks.filter(t=>t.projectId===task.projectId&&predecessorIds(t).includes(task.id));}
// A handoff is explicit: only waiting tasks with every predecessor complete qualify.
function readyToStart(task){
 const ids=predecessorIds(task);
 return task.status==='todo'&&ids.length>0&&!dependencyError(task)&&predecessors(task).every(t=>t.status==='done');
}
function renderReadyTasks(){
 const ready=projectTasks().filter(readyToStart);
 $('#handoff-panel').hidden=!ready.length;
 $('#handoff-list').innerHTML=ready.map(t=>`<li><div><strong>${escape(t.title)}</strong><small>${escape(t.assignee||'未指派')} · 所有前置任務已完成</small></div><button type="button" class="primary" data-start-next="${escape(t.id)}" aria-label="開始接續任務：${escape(t.title)}">開始接續</button></li>`).join('');
}
function completionNotice(task,previousStatus){
 if(previousStatus==='done'||task.status!=='done')return '';
 const ready=successors(task).filter(readyToStart);
 return ready.length?`；${ready.length} 項任務可接續，請於「可接續任務」按下開始接續`:'';
}
function updateTaskStatus(task,status){
 const previousStatus=task.status;task.status=status;
 const notice=completionNotice(task,previousStatus),saved=save();render();
 if(saved)toast('任務狀態已更新'+notice);
}
function startNextTask(id){
 const task=state.tasks.find(t=>t.id===id&&t.projectId===current);
 if(!task||!readyToStart(task)){render();toast('此任務目前無法接續，請確認狀態及前置任務');return;}
 updateTaskStatus(task,'doing');
}
function dependencyError(task){
 const ids=predecessorIds(task);
 for(const id of ids){
  if(id===task.id)return '任務不可相依於自己。';
  const parent=state.tasks.find(t=>t.id===id);
  if(!parent||parent.projectId!==task.projectId)return '請選擇同案件中仍存在的前置任務。';
  const seen=new Set(),stack=[id];
  while(stack.length){const next=stack.pop();if(next===task.id)return '此關係會形成循環相依，請移除造成循環的前置任務。';if(seen.has(next))continue;seen.add(next);const node=state.tasks.find(t=>t.id===next);if(node)stack.push(...predecessorIds(node));}
 }
 return '';
}
function dependencySummary(task){
 const parents=predecessors(task),children=successors(task);if(!parents.length&&!children.length)return '';
 const pending=parents.filter(t=>t.status!=='done'),conflicts=parents.filter(t=>Number.isFinite(dayNumber(t.due))&&Number.isFinite(dayNumber(task.start))&&task.start<=t.due);
 return `<div class="dependency-summary">${parents.length?`<span>前置：${parents.map(t=>escape(t.title)).join('、')}</span>`:''}${children.length?`<span>接續：${children.map(t=>escape(t.title)).join('、')}</span>`:''}${pending.length&&task.status!=='done'?`<span class="dependency-warning">${pending.length} 項前置尚未完成</span>`:''}${conflicts.length?'<span class="dependency-warning">排程衝突：起始日須晚於前置截止日</span>':''}</div>`;
}
function renderDependencyEditor(task){
 $('#dependency-error').textContent='';const selected=predecessorIds(task);
 const candidates=state.tasks.filter(t=>t.projectId===task.projectId&&t.id!==task.id);
 $('#predecessor-options').innerHTML=candidates.map(t=>`<label class="dependency-option"><input type="checkbox" name="predecessors" value="${escape(t.id)}" ${selected.includes(t.id)?'checked':''}><span>${escape(t.title)}<small>${statuses[t.status]} · 截止 ${escape(t.due||'未設定')}</small></span></label>`).join('')||'<p class="dependency-help">此案件尚無其他任務，新增任務後即可設定相依。</p>';
 const next=successors(task);$('#successor-list').innerHTML=next.length?`<p class="dependency-help">接續此任務：${next.map(t=>escape(t.title)).join('、')}。請編輯接續任務以調整關係。</p>`:'';
}
function card(t){return `<article class="card" draggable="true" tabindex="0" role="button" aria-label="編輯任務：${escape(t.title)}" data-task="${escape(t.id)}"><span class="priority ${t.priority}">${priorities[t.priority]}</span><h3>${escape(t.title)}</h3>${activeReminder(t)?'<small class="reminder-badge">◷ 提醒設定草稿</small>':''}<p>${escape(t.description||'尚未新增說明')}</p><div class="card-schedule">${escape(t.start||'未設起始日')} → ${escape(t.due||'未設截止日')}</div>${dependencySummary(t)}<div class="card-bottom"><span class="person"><span class="avatar">${escape((t.assignee||'未').slice(0,1))}</span><span class="person-name">${escape(t.assignee||'未指派')}</span></span><span class="due ${t.status!=='done'&&t.due&&t.due<today()?'overdue':''}">◷ ${t.due?escape(t.due.slice(5).replace('-','/')):'未設期限'}</span></div></article>`;}
function renderTasks(){const analysis=['resources','gantt'].includes(view);$('#analysis-controls').hidden=!analysis;$('.board-intro').hidden=analysis;const tasks=filtered();if(analysis){renderAnalysis(tasks);return;}$('#tasks').className=view==='board'?'board':'';if(view==='board'){$('#tasks').innerHTML=Object.entries(statuses).map(([key,label])=>{const list=tasks.filter(t=>t.status===key);return `<div class="column ${key}" data-status="${key}"><div class="column-heading"><span><i class="status-dot"></i>${label}<b class="count">${list.length}</b></span><button data-new="${key}" aria-label="新增${label}任務">＋</button></div>${list.map(card).join('')||'<div class="empty">目前沒有任務</div>'}<button class="add-card" data-new="${key}">＋ 新增任務</button></div>`;}).join('');}else{$('#tasks').innerHTML=`<table class="task-list"><thead><tr><th>任務名稱</th><th>負責人</th><th>起始日</th><th>截止日</th><th>工時</th><th>優先</th><th>狀態</th></tr></thead><tbody>${tasks.map(t=>`<tr><td class="task-name"><button data-task="${escape(t.id)}">${escape(t.title)}</button>${dependencySummary(t)}</td><td>${escape(t.assignee||'未指派')}</td><td>${escape(t.start||'未設定')}</td><td>${escape(t.due||'未設定')}</td><td>${t.hours===''||t.hours==null?'未估算':escape(t.hours)+' h'}</td><td><span class="priority ${t.priority}">${priorities[t.priority]}</span></td><td><select data-status-task="${escape(t.id)}" aria-label="${escape(t.title)}的狀態">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${k===t.status?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="7" class="empty">沒有符合條件的任務</td></tr>'}</tbody></table>`;}}
function showProject(){ $('#project-view').hidden=false;$('#mail-view').hidden=true;$('#projects-nav').classList.add('active');$('#mail-nav').classList.remove('active');render();}
function openTask(id=null,status='todo'){editing=id;const form=$('#task-form');form.reset();form.elements.due.setCustomValidity('');const task=id?state.tasks.find(t=>t.id===id):{status,priority:'medium',projectId:current};if(!task)return;renderDependencyEditor(task);for(const name of ['title','description','assignee','start','due','hours','status','priority'])form.elements[name].value=task[name]??'';preparePeopleTask(task);$('#dialog-title').textContent=id?'編輯任務':'新增任務';$('#delete-task').hidden=!id;$('#task-dialog').showModal();}
$('#project-list').addEventListener('click',e=>{const button=e.target.closest('[data-project]');if(!button)return;current=button.dataset.project;$('#search').value='';$('#assignee-filter').value='';showProject();});
$('#handoff-list').addEventListener('click',e=>{const button=e.target.closest('[data-start-next]');if(button)startNextTask(button.dataset.startNext);});
$('#projects-nav').onclick=showProject;
$('#mail-nav').onclick=()=>{$('#project-view').hidden=true;$('#mail-view').hidden=false;$('#projects-nav').classList.remove('active');$('#mail-nav').classList.add('active');$('#breadcrumb').textContent='人員與通知';renderPeople();};
$('#add-task').onclick=()=>openTask();$('#add-project').onclick=()=>{$('#project-form').reset();$('#project-dialog').showModal();};
$('#task-form').onsubmit=e=>{e.preventDefault();const formData=new FormData(e.target);const data=Object.fromEntries(formData);data.predecessors=formData.getAll('predecessors');data.title=data.title.trim();data.assignee=data.assignee.trim();if(data.start&&data.due&&data.start>data.due){e.target.elements.due.setCustomValidity('截止日期不可早於起始日');e.target.elements.due.reportValidity();return;}data.hours=data.hours===''?'':Number(data.hours);if(!data.title){e.target.elements.title.setCustomValidity('請輸入任務名稱');e.target.elements.title.reportValidity();return;}const person=state.people.find(p=>p.id===data.employeeId);if(person)data.assignee=person.name;const reminders=readReminders();for(const key of Object.keys(data))if(key.startsWith('reminder_'))delete data[key];const task={...data,reminders,id:editing||crypto.randomUUID(),projectId:editing?state.tasks.find(t=>t.id===editing).projectId:current};const relationError=dependencyError(task);$('#dependency-error').textContent=relationError;if(relationError)return;const previousStatus=editing?state.tasks.find(t=>t.id===editing).status:null;if(editing){state.tasks=state.tasks.map(t=>t.id===editing?task:t);}else state.tasks.push(task);const notice=completionNotice(task,previousStatus),saved=save();$('#task-dialog').close();render();if(saved)toast('任務已儲存'+notice);};
for(const name of ['start','due'])$('#task-form').elements[name].oninput=()=>$('#task-form').elements.due.setCustomValidity('');
$('#task-form').elements.title.oninput=e=>e.target.setCustomValidity('');
$('#delete-task').onclick=()=>{if(!editing)return;const linked=state.tasks.filter(t=>predecessorIds(t).includes(editing)).length;if(!confirm(`確定刪除這個任務？${linked?`另有 ${linked} 項接續任務，其前置連結也會移除。`:''}此操作無法復原。`))return;state.tasks=state.tasks.filter(t=>t.id!==editing).map(t=>({...t,predecessors:predecessorIds(t).filter(id=>id!==editing)}));const saved=save();$('#task-dialog').close();render();if(saved)toast('任務已刪除');};
$('#project-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();if(!data.name){e.target.elements.name.setCustomValidity('請輸入專案名稱');e.target.elements.name.reportValidity();return;}const project={...data,id:crypto.randomUUID()};state.projects.push(project);current=project.id;const saved=save();$('#project-dialog').close();$('#search').value='';$('#assignee-filter').value='';showProject();if(saved)toast('專案已建立');};
$('#project-form').elements.name.oninput=e=>e.target.setCustomValidity('');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(t=>t.classList.toggle('selected',t===b));render();});
$('#search').oninput=renderTasks;$('#assignee-filter').onchange=renderTasks;
$('#tasks').addEventListener('click',e=>{const add=e.target.closest('[data-new]'),task=e.target.closest('[data-task]');if(add)openTask(null,add.dataset.new);else if(task)openTask(task.dataset.task);});
$('#tasks').addEventListener('keydown',e=>{const task=e.target.closest('article[data-task]');if(task&&['Enter',' '].includes(e.key)){e.preventDefault();openTask(task.dataset.task);}});
$('#tasks').addEventListener('change',e=>{const id=e.target.dataset.statusTask;if(!id)return;const task=state.tasks.find(t=>t.id===id);if(task&&Object.hasOwn(statuses,e.target.value)){updateTaskStatus(task,e.target.value);}});
$('#tasks').addEventListener('dragstart',e=>{const card=e.target.closest('[data-task]');if(!card)return;dragged=card.dataset.task;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
$('#tasks').addEventListener('dragover',e=>{const col=e.target.closest('[data-status]');if(!col||!dragged)return;e.preventDefault();document.querySelectorAll('.drop-active').forEach(c=>c.classList.remove('drop-active'));col.classList.add('drop-active');});
$('#tasks').addEventListener('drop',e=>{const col=e.target.closest('[data-status]');if(!col||!dragged)return;e.preventDefault();const task=state.tasks.find(t=>t.id===dragged);if(task){updateTaskStatus(task,col.dataset.status);}dragged=null;});
$('#tasks').addEventListener('dragend',()=>{dragged=null;document.querySelectorAll('.drop-active,.dragging').forEach(c=>c.classList.remove('drop-active','dragging'));});

$('#range-start').value=today();$('#range-end').value=relativeDate(29);
for(const id of ['analysis-scope','range-start','range-end'])$('#'+id).onchange=render;
render();if(storageError)toast('無法讀取儲存資料，已載入示範內容');

// UTC day numbers keep calendar calculations independent of daylight saving changes.
function dayNumber(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:NaN;}
function schedule(t){const start=dayNumber(t.start),end=dayNumber(t.due);return Number.isFinite(start)&&Number.isFinite(end)&&start<=end?{start,end}:null;}
function knownHours(t){return t.hours!==''&&t.hours!=null&&Number.isFinite(Number(t.hours))&&Number(t.hours)>=0;}
const numberLabel=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:1}).format(n);
function renderAnalysis(tasks){
 const host=$('#tasks');host.className='analysis-panel';const start=dayNumber($('#range-start').value),end=dayNumber($('#range-end').value),days=end-start+1;
 const error=!Number.isFinite(start)||!Number.isFinite(end)?'請填寫完整的日期區間。':days<1?'區間迄日不可早於起日。':days>366?'請選擇 366 天以內的區間。':'';
 $('#range-error').textContent=error;if(error){host.innerHTML='<div class="empty">請調整日期區間以查看分析。</div>';return;}
 const missing=tasks.filter(t=>!schedule(t));const included=tasks.filter(t=>{const d=schedule(t);return d&&d.start<=end&&d.end>=start;});
 const projectName=t=>state.projects.find(p=>p.id===t.projectId)?.name||'未分類案件';
 const unscheduled=missing.length?`<div class="schedule-missing"><h3>待補排程 · ${missing.length} 項</h3><p>缺少起始日、截止日或日期順序不正確，尚未計入日期區間分析。點擊任務即可補齊。</p><div>${missing.map(t=>`<button class="secondary" data-task="${escape(t.id)}">${escape(t.title)} · ${escape(projectName(t))}</button>`).join('')}</div></div>`:'';
 if(view==='gantt'){
  const labels=Array.from({length:days},(_,i)=>{const date=new Date((start+i)*86400000).toISOString().slice(0,10);return `<span class="gantt-day ${date===today()?'is-today':''}" title="${date}">${date.slice(5).replace('-','/')}</span>`;}).join('');
  const ordered=[...included].sort((a,b)=>a.start.localeCompare(b.start)||a.due.localeCompare(b.due));const rows=ordered.map(t=>{const d=schedule(t),offset=Math.max(start,d.start)-start,length=Math.min(end,d.end)-Math.max(start,d.start)+1;return `<div class="gantt-row"><button class="gantt-label" data-task="${escape(t.id)}"><strong>${escape(t.title)}</strong><small>${escape(projectName(t))} · ${escape(t.assignee||'未指派')} · ${statuses[t.status]}</small>${dependencySummary(t)}</button><div class="gantt-track" style="width:${days*38}px"><button class="gantt-bar ${t.status}" style="left:${offset*38+2}px;width:${length*38-4}px" data-task="${escape(t.id)}" title="${escape(t.title)}：${escape(t.start)} 至 ${escape(t.due)} · ${statuses[t.status]}" aria-label="編輯 ${escape(t.title)}，${escape(t.start)} 至 ${escape(t.due)}">${escape(t.title)}</button></div></div>`;}).join('');
  const connections=ordered.flatMap((t,index)=>predecessors(t).flatMap(parent=>{const source=ordered.findIndex(item=>item.id===parent.id);if(source<0)return [];const x1=240+(Math.min(end,dayNumber(parent.due))-start+1)*38-2,x2=240+(Math.max(start,dayNumber(t.start))-start)*38+2,y1=44+source*100+33,y2=44+index*100+33,bend=Math.max(x1+12,x2-12);return [`<path d="M ${x1} ${y1} H ${bend} V ${y2} H ${x2}" marker-end="url(#dependency-arrow)"><title>${escape(parent.title)} → ${escape(t.title)}</title></path>`];})).join('');
  const arrows=connections?`<svg class="gantt-connections" width="${240+days*38}" height="${44+ordered.length*100}" aria-hidden="true"><defs><marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z"/></marker></defs>${connections}</svg>`:'';
  host.innerHTML=`<div class="analysis-heading"><div><h2>案件甘特圖</h2><p>${included.length} 項排程任務 · ${escape($('#range-start').value)} — ${escape($('#range-end').value)}</p></div><div class="gantt-legend"><span>待開始</span><span>進行中</span><span>已完成</span></div></div><p class="analysis-note">每日一格；長排程僅顯示與區間重疊的部分。點擊長條可編輯任務。箭頭由前置任務指向接續任務；僅連接目前顯示的任務，完整關係請見任務標籤。</p>${included.length?`<div class="gantt-scroll" tabindex="0" role="region" aria-label="案件甘特圖，可左右捲動"><div class="gantt" style="min-width:${240+days*38}px"><div class="gantt-row gantt-header"><div class="gantt-label">任務 / 案件 / 負責人</div><div class="gantt-days">${labels}</div></div>${rows}${arrows}</div></div>`:'<div class="empty">此區間沒有符合條件的排程任務，可新增任務或調整日期與篩選條件。</div>'}${unscheduled}`;
  return;
 }
 const groups=new Map();for(const t of included){const person=t.employeeId?`${(t.assignee||'').trim()} · ${t.employeeId}`:(t.assignee||'').trim()||'未指派';if(!groups.has(person))groups.set(person,{person,tasks:[],hours:0,unknown:0});const g=groups.get(person);g.tasks.push(t);if(t.status!=='done'){if(knownHours(t)){const d=schedule(t);g.hours+=Number(t.hours)*(Math.min(end,d.end)-Math.max(start,d.start)+1)/(d.end-d.start+1);}else g.unknown++;}}
 const people=[...groups.values()].sort((a,b)=>b.hours-a.hours||a.person.localeCompare(b.person,'zh-TW'));const total=people.reduce((n,g)=>n+g.hours,0),max=Math.max(1,...people.map(g=>g.hours));
 host.innerHTML=`<div class="analysis-heading"><div><h2>人力資源分析</h2><p>依負責人彙整區間內任務，掌握待辦分配與預估投入。</p></div><div class="resource-total"><strong>${numberLabel(total)}<small> h</small></strong><span>區間未完成預估工時</span></div></div><p class="analysis-note">工時依起訖日的日曆天數平均分攤至所選區間，已完成任務不計入待投入工時。未估工時不視為零；此分析未設定個人可用工時，因此不判定超載。</p><div class="table-scroll"><table class="task-list resource-table"><thead><tr><th>負責人 / 工時分配</th><th>待開始</th><th>進行中</th><th>已完成</th><th>最高同時未完成任務</th><th>未估工時</th></tr></thead><tbody>${people.map(g=>{const active=g.tasks.filter(t=>t.status!=='done');let peak=0;for(let day=start;day<=end;day++){peak=Math.max(peak,active.filter(t=>{const d=schedule(t);return d.start<=day&&d.end>=day;}).length);}return `<tr><td><div class="resource-person"><strong>${escape(g.person)}</strong><span>${numberLabel(g.hours)} h</span></div><div class="resource-meter"><i style="width:${g.hours/max*100}%"></i></div></td>${Object.keys(statuses).map(s=>`<td>${g.tasks.filter(t=>t.status===s).length}</td>`).join('')}<td>${peak}</td><td>${g.unknown?g.unknown+' 項':'—'}</td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">此區間沒有符合條件的排程任務。</td></tr>'}</tbody></table></div>${unscheduled}`;
}

let pendingImport=null;
const frequencies={off:'不提醒',daily:'每天',weekly:'每週',custom:'自訂間隔'};
function renderPeople(){
 $('#people-table').innerHTML=state.people.map(p=>`<tr><td>${escape(p.id)}</td><td>${escape(p.name)}</td><td>${escape(p.email)}</td></tr>`).join('')||'<tr><td colspan="3">尚無人員，請先匯入 Excel。</td></tr>';
 $('#import-history').textContent=state.lastImport?`上次手動更新：${new Date(state.lastImport.at).toLocaleString('zh-TW')} · 新增 ${state.lastImport.added}、更新 ${state.lastImport.updated}、不變 ${state.lastImport.unchanged}`:'';
}
$('#template-download').onclick=async()=>{try{const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('人員名冊');sheet.addRow(['工號','姓名','Email']);sheet.addRow(['00123','範例人員','sample@example.com']);sheet.getColumn(1).numFmt='@';sheet.columns.forEach(c=>c.width=28);const blob=new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='人員名冊範本.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch{toast('範本產生失敗，請重試');}};
$('#people-file').onchange=async e=>{
 const file=e.target.files[0];pendingImport=null;$('#apply-import').hidden=true;$('#import-preview').textContent='';if(!file)return;
 if(!/\.xlsx$/i.test(file.name)||file.size>2*1024*1024){$('#import-preview').textContent='請選擇 2 MB 以下的 .xlsx 檔案';e.target.value='';return;}
 e.target.disabled=true;
 try{
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const sheet=wb.worksheets[0];if(!sheet||sheet.rowCount>5001)throw Error('請提供第一張工作表，且資料不可超過 5,000 人');
  const rows=[];for(let n=1;n<=sheet.rowCount;n++){const cells=[];sheet.getRow(n).eachCell({includeEmpty:true},(cell,col)=>{cells[col-1]=cell.text;});rows.push(cells);}
  const plan=planImport(rows,state.people);
  if(plan.errors.length){$('#import-preview').textContent=plan.errors.slice(0,20).join('；');return;}
  pendingImport=plan.records;const summary=['新增','更新','不變'].map(a=>`${a} ${plan.records.filter(p=>p.action===a).length} 人`).join(' ／ ');
  $('#import-preview').innerHTML=`<h3>待確認：${summary}</h3><p>以下顯示前 50 筆。未列出的人員不會刪除。</p><div class="table-scroll"><table class="task-list"><thead><tr><th>變更</th><th>工號</th><th>姓名</th><th>Email</th></tr></thead><tbody>${plan.records.slice(0,50).map(p=>`<tr><td>${p.action}</td><td>${escape(p.id)}</td><td>${escape(p.name)}</td><td>${escape(p.email)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#apply-import').hidden=false;
 }catch(error){$('#import-preview').textContent=error.message?.startsWith('請提供')?error.message:'無法解析此 Excel，請確認檔案未損毀或加密';}finally{e.target.disabled=false;e.target.value='';}
};
$('#apply-import').onclick=()=>{if(!pendingImport)return;const previous=state.people,previousHistory=state.lastImport;const merged=new Map(state.people.map(p=>[p.id,p]));for(const {action,...person} of pendingImport)merged.set(person.id,person);state.people=[...merged.values()];state.lastImport={at:new Date().toISOString(),added:pendingImport.filter(p=>p.action==='新增').length,updated:pendingImport.filter(p=>p.action==='更新').length,unchanged:pendingImport.filter(p=>p.action==='不變').length};if(!save()){state.people=previous;state.lastImport=previousHistory;return;}pendingImport=null;$('#apply-import').hidden=true;$('#import-preview').textContent='更新已套用';renderPeople();render();toast('人員名冊已增量更新');};
function preparePeopleTask(task){
 const select=$('#task-person');select.innerHTML='<option value="">未選擇（可手填負責人）</option>'+state.people.map(p=>`<option value="${escape(p.id)}">${escape(p.name)} · ${escape(p.id)}</option>`).join('');select.value=task.employeeId||'';
 $('#reminder-fields').innerHTML=['todo','doing'].map(status=>{const rule=task.reminders?.[status]||{frequency:'off',days:1,time:'09:00'};return `<div class="rule-row"><strong>${statuses[status]}</strong><label>頻率<select name="reminder_${status}_frequency">${Object.entries(frequencies).map(([key,label])=>`<option value="${key}" ${rule.frequency===key?'selected':''}>${label}</option>`).join('')}</select></label><label>間隔天數<input name="reminder_${status}_days" type="number" min="1" max="365" value="${Number(rule.days)||1}"></label><label>提醒時間<input name="reminder_${status}_time" type="time" value="${escape(rule.time||'09:00')}" required></label></div>`;}).join('')+'<p class="fine">每週以 7 天為間隔；時間以 Asia/Taipei 記錄。已完成：停止提醒。</p>';
 updateRuleFields();updateRecipient();
}
function updateRuleFields(){for(const status of ['todo','doing']){const f=$('#task-form').elements;f[`reminder_${status}_days`].disabled=f[`reminder_${status}_frequency`].value!=='custom';f[`reminder_${status}_time`].disabled=f[`reminder_${status}_frequency`].value==='off';}}
function readReminders(){const f=$('#task-form').elements;return Object.fromEntries(['todo','doing'].map(s=>[s,{frequency:f[`reminder_${s}_frequency`].value,days:Number(f[`reminder_${s}_days`].value)||1,time:f[`reminder_${s}_time`].value||'09:00',timezone:'Asia/Taipei'}]));}
function updateRecipient(){const form=$('#task-form'),person=state.people.find(p=>p.id===form.elements.employeeId.value);form.elements.assignee.readOnly=!!person;if(person)form.elements.assignee.value=person.name;$('#task-recipient').textContent=person?`收件人：${person.name}（${person.id}） · ${person.email}`:'選擇名冊人員後，才能開啟對應的郵件草稿。';const link=$('#compose-mail');link.hidden=!person;if(!person){link.removeAttribute('href');return;}const title=form.elements.title.value.trim()||'未命名任務';const body=`${person.name} 您好，\n\n行動方案：${title}\n專案：${state.projects.find(p=>p.id===(editing?state.tasks.find(t=>t.id===editing)?.projectId:current))?.name||''}\n工號：${person.id}\n期限：${form.elements.due.value||'未設定'}\n狀態：${statuses[form.elements.status.value]}\n\n${form.elements.description.value}\n\n請確認工作安排。`;link.href=`mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent('行動方案：'+title)}&body=${encodeURIComponent(body)}`;}
$('#task-form').addEventListener('input',updateRecipient);$('#task-form').addEventListener('change',()=>{updateRuleFields();updateRecipient();});
