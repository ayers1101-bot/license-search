import {planningAnalysis,predecessorIds as planningPredecessorIds,getPredecessors,getSuccessors,dependencyProblem,isReady,describeDependencies} from './planning.js';
import {taskDepth, withTreeTask, parentSelect, renderTaskTree, bindTaskTree, moveSibling, descendants, deleteBranch} from './task-tree.js';
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
function predecessorIds(task){return planningPredecessorIds(task);}
function predecessors(task){return getPredecessors(task,state.tasks);}
function successors(task){return getSuccessors(task,state.tasks);}
function readyToStart(task){return isReady(task,state.tasks);}
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
function dependencyError(task){return dependencyProblem(task,state.tasks);}
function dependencySummary(task){return describeDependencies(task,state.tasks);}
function renderDependencyEditor(task){
 $('#dependency-error').textContent='';const selected=predecessorIds(task);
 const candidates=state.tasks.filter(t=>t.projectId===task.projectId&&t.id!==task.id);
 $('#predecessor-options').innerHTML=candidates.map(t=>`<label class="dependency-option"><input type="checkbox" name="predecessors" value="${escape(t.id)}" ${selected.includes(t.id)?'checked':''}><span>${escape(t.title)}<small>${statuses[t.status]} · 截止 ${escape(t.due||'未設定')}</small></span></label>`).join('')||'<p class="dependency-help">此案件尚無其他任務，新增任務後即可設定相依。</p>';
 const next=successors(task);$('#successor-list').innerHTML=next.length?`<p class="dependency-help">接續此任務：${next.map(t=>escape(t.title)).join('、')}。請編輯接續任務以調整關係。</p>`:'';
}
function card(t){return `<article class="card" draggable="true" tabindex="0" role="button" aria-label="編輯任務：${escape(t.title)}" data-task="${escape(t.id)}"><span class="priority ${t.priority}">${priorities[t.priority]}</span><h3>${escape(t.title)}</h3>${activeReminder(t)?'<small class="reminder-badge">◷ 提醒設定草稿</small>':''}<p>${escape(t.description||'尚未新增說明')}</p><div class="card-schedule">${escape(t.start||'未設起始日')} → ${escape(t.due||'未設截止日')}</div>${dependencySummary(t)}<div class="card-bottom"><span class="person"><span class="avatar">${escape((t.assignee||'未').slice(0,1))}</span><span class="person-name">${escape(t.assignee||'未指派')}</span></span><span class="due ${t.status!=='done'&&t.due&&t.due<today()?'overdue':''}">◷ ${t.due?escape(t.due.slice(5).replace('-','/')):'未設期限'}</span></div></article>`;}
function renderTasks(){const analysis=['resources','gantt'].includes(view);$('#analysis-controls').hidden=!analysis;$('.board-intro').hidden=analysis;const tasks=filtered();if(view==='tree'){$('#tasks').className='';$('#tasks').innerHTML=renderTaskTree(projectTasks(),{visibleIds:tasks.map(t=>t.id)});return;}if(analysis){renderAnalysis(tasks);return;}$('#tasks').className=view==='board'?'board':'';if(view==='board'){$('#tasks').innerHTML=Object.entries(statuses).map(([key,label])=>{const list=tasks.filter(t=>t.status===key);return `<div class="column ${key}" data-status="${key}"><div class="column-heading"><span><i class="status-dot"></i>${label}<b class="count">${list.length}</b></span><button data-new="${key}" aria-label="新增${label}任務">＋</button></div>${list.map(card).join('')||'<div class="empty">目前沒有任務</div>'}<button class="add-card" data-new="${key}">＋ 新增任務</button></div>`;}).join('');}else{$('#tasks').innerHTML=`<table class="task-list"><thead><tr><th>任務名稱</th><th>負責人</th><th>起始日</th><th>截止日</th><th>工時</th><th>優先</th><th>狀態</th></tr></thead><tbody>${tasks.map(t=>`<tr><td class="task-name"><button data-task="${escape(t.id)}">${escape(t.title)}</button>${dependencySummary(t)}</td><td>${escape(t.assignee||'未指派')}</td><td>${escape(t.start||'未設定')}</td><td>${escape(t.due||'未設定')}</td><td>${t.hours===''||t.hours==null?'未估算':escape(t.hours)+' h'}</td><td><span class="priority ${t.priority}">${priorities[t.priority]}</span></td><td><select data-status-task="${escape(t.id)}" aria-label="${escape(t.title)}的狀態">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${k===t.status?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="7" class="empty">沒有符合條件的任務</td></tr>'}</tbody></table>`;}}
function showProject(){ $('#project-view').hidden=false;$('#mail-view').hidden=true;$('#projects-nav').classList.add('active');$('#mail-nav').classList.remove('active');render();}
function openTask(id=null,status='todo',parentId=null){editing=id;const form=$('#task-form');form.reset();form.elements.due.setCustomValidity('');const task=id?state.tasks.find(t=>t.id===id):{id:'__new_task__',status,priority:'medium',projectId:current,parentId};if(!task)return;$('#task-hierarchy').innerHTML=parentSelect(state.tasks,task);renderDependencyEditor(task);for(const name of ['title','description','assignee','start','due','hours','status','priority'])form.elements[name].value=task[name]??'';preparePeopleTask(task);$('#dialog-title').textContent=id?'編輯任務':'新增任務';$('#delete-task').hidden=!id;$('#task-dialog').showModal();}
$('#project-list').addEventListener('click',e=>{const button=e.target.closest('[data-project]');if(!button)return;current=button.dataset.project;$('#search').value='';$('#assignee-filter').value='';showProject();});
$('#handoff-list').addEventListener('click',e=>{const button=e.target.closest('[data-start-next]');if(button)startNextTask(button.dataset.startNext);});
$('#projects-nav').onclick=showProject;
$('#mail-nav').onclick=()=>{$('#project-view').hidden=true;$('#mail-view').hidden=false;$('#projects-nav').classList.remove('active');$('#mail-nav').classList.add('active');$('#breadcrumb').textContent='人員與通知';renderPeople();};
$('#add-task').onclick=()=>openTask();$('#add-project').onclick=()=>{$('#project-form').reset();$('#project-dialog').showModal();};
$('#task-form').onsubmit=e=>{e.preventDefault();const formData=new FormData(e.target);const data=Object.fromEntries(formData);data.predecessors=formData.getAll('predecessors');data.title=data.title.trim();data.assignee=data.assignee.trim();if(data.start&&data.due&&data.start>data.due){e.target.elements.due.setCustomValidity('截止日期不可早於起始日');e.target.elements.due.reportValidity();return;}data.hours=data.hours===''?'':Number(data.hours);if(!data.title){e.target.elements.title.setCustomValidity('請輸入任務名稱');e.target.elements.title.reportValidity();return;}const person=state.people.find(p=>p.id===data.employeeId);if(person)data.assignee=person.name;const reminders=readReminders();for(const key of Object.keys(data))if(key.startsWith('reminder_'))delete data[key];const task={...data,reminders,id:editing||crypto.randomUUID(),projectId:editing?state.tasks.find(t=>t.id===editing).projectId:current};const relationError=dependencyError(task);$('#dependency-error').textContent=relationError;if(relationError)return;const previousStatus=editing?state.tasks.find(t=>t.id===editing).status:null;task.parentId=task.parentId||null;try{state.tasks=withTreeTask(state.tasks,task);}catch(error){$('#dependency-error').textContent=error.message;return;}const notice=completionNotice(task,previousStatus),saved=save();$('#task-dialog').close();render();if(saved)toast('任務已儲存'+notice);};
for(const name of ['start','due'])$('#task-form').elements[name].oninput=()=>$('#task-form').elements.due.setCustomValidity('');
$('#task-form').elements.title.oninput=e=>e.target.setCustomValidity('');
$('#delete-task').onclick=()=>{if(!editing)return;const removed=descendants(state.tasks,editing);const linked=state.tasks.filter(t=>predecessorIds(t).some(id=>removed.has(id))&&!removed.has(t.id)).length;if(!confirm(`確定刪除這個任務？${removed.size>1?`包含 ${removed.size-1} 項子任務將一起刪除。`:''}${linked?`另有 ${linked} 項接續任務，其前置連結也會移除。`:''}此操作無法復原。`))return;state.tasks=deleteBranch(state.tasks,editing);const saved=save();$('#task-dialog').close();render();if(saved)toast('任務已刪除');};
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

function renderAnalysis(tasks){
 const result=planningAnalysis({tasks,allTasks:state.tasks,projects:state.projects,view,startDate:$('#range-start').value,endDate:$('#range-end').value,todayDate:today()});
 $('#tasks').className='analysis-panel';$('#tasks').innerHTML=result.html;$('#range-error').textContent=result.error;
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

bindTaskTree($('#tasks'),{
 getTasks:()=>state.tasks,
 onEdit:id=>openTask(id),
 onAdd:id=>openTask(null,'todo',id),
 onMove:(id,target,after)=>{try{if(id===target)return;const previous=state.tasks;state.tasks=moveSibling(state.tasks,id,target,after);if(!save()){state.tasks=previous;return;}render();toast('任務順序已儲存');}catch(e){toast(e.message);}},
 onError:e=>toast(e.message)
});
