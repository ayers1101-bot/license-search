// parentId models hierarchy; array position models sibling order. Legacy tasks are roots.
export const MAX_SUBTASK_DEPTH=3;
const scope=t=>t.projectId??'';
const parent=t=>t.parentId||null;
export function taskDepth(tasks,task){
 const seen=new Set([task.id]);let depth=0,node=task;
 while(parent(node)){
  const next=tasks.find(t=>t.id===parent(node));
  if(!next||scope(next)!==scope(task))throw Error('上層任務必須存在於同一專案');
  if(seen.has(next.id))throw Error('任務不可移到自己或自己的子任務之下');
  seen.add(next.id);node=next;depth++;
 }
 return depth;
}
export function validateHierarchy(tasks){
 const seen=new Set();
 for(const task of tasks){if(!task.id||seen.has(task.id))throw Error('任務識別碼不可空白或重複');seen.add(task.id);if(taskDepth(tasks,task)>MAX_SUBTASK_DEPTH)throw Error('最多支援主任務向下三層子任務');}
 return tasks;
}
export function withTreeTask(tasks,task){return validateHierarchy(tasks.some(t=>t.id===task.id)?tasks.map(t=>t.id===task.id?task:t):[...tasks,task]);}
export function descendants(tasks,id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const t of tasks)if(ids.has(t.parentId)&&!ids.has(t.id)){ids.add(t.id);changed=true;}}return ids;}
export function deleteBranch(tasks,id){const ids=descendants(tasks,id);return tasks.filter(t=>!ids.has(t.id)).map(t=>({...t,predecessors:(t.predecessors||[]).filter(p=>!ids.has(p))}));}
export function treeRows(tasks){const rows=[],seen=new Set();function visit(task,depth){if(seen.has(task.id))return;seen.add(task.id);rows.push({task,depth});for(const child of tasks.filter(t=>parent(t)===task.id&&scope(t)===scope(task)))visit(child,depth+1);}for(const t of tasks.filter(t=>!parent(t)))visit(t,0);for(const t of tasks)if(!seen.has(t.id))visit(t,0);return rows;}
export function moveSibling(tasks,id,targetId,after=false){
 validateHierarchy(tasks);const task=tasks.find(t=>t.id===id),target=tasks.find(t=>t.id===targetId);
 if(!task||!target||scope(task)!==scope(target)||parent(task)!==parent(target))throw Error('只能調整同一上層任務中的順序；變更層級請編輯上層任務');
 if(id===targetId)return tasks;
 const siblings=tasks.filter(t=>scope(t)===scope(task)&&parent(t)===parent(task));const reordered=siblings.filter(t=>t.id!==id);reordered.splice(reordered.findIndex(t=>t.id===targetId)+(after?1:0),0,task);let i=0;
 return tasks.map(t=>scope(t)===scope(task)&&parent(t)===parent(task)?reordered[i++]:t);
}
export function parentChoices(tasks,task){return tasks.filter(candidate=>{if(candidate.id===task.id||scope(candidate)!==scope(task))return false;try{withTreeTask(tasks,{...task,parentId:candidate.id});return true;}catch{return false;}});}
const treeEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parentSelect(tasks,task){return `<label>上層任務<select name="parentId"><option value="">無（主任務）</option>${parentChoices(tasks,task).map(t=>`<option value="${treeEscape(t.id)}" ${t.id===task.parentId?'selected':''}>${treeEscape('　'.repeat(taskDepth(tasks,t))+t.title)}</option>`).join('')}</select></label><p class="fine">主任務可向下建立三層子任務；變更上層會連同其子任務移動。</p>`;}
export function renderTaskTree(tasks,{editable=true,visibleIds=null}={}){
 let warning='';try{validateHierarchy(tasks);}catch(e){warning=e.message;}
 const included=visibleIds?new Set(visibleIds):null;
 if(included)for(const id of [...included]){let t=tasks.find(t=>t.id===id),seen=new Set();while(t?.parentId&&!seen.has(t.id)){seen.add(t.id);included.add(t.parentId);t=tasks.find(p=>p.id===t.parentId);}}
 const rows=treeRows(tasks).filter(({task})=>!included||included.has(task.id));
 return `<div class="task-tree"><p class="fine">主任務 → 第一層 → 第二層 → 第三層。拖曳 ⠿ 可調整同層順序；也可用上下按鈕。各層狀態獨立。</p>${warning?`<p role="alert">${treeEscape(warning)}</p>`:''}${rows.map(({task:t,depth})=>{const peers=tasks.filter(p=>scope(p)===scope(t)&&parent(p)===parent(t)),i=peers.findIndex(p=>p.id===t.id);return `<div class="tree-row" data-tree-id="${treeEscape(t.id)}" style="--depth:${Math.min(depth,3)}"><div class="tree-line">${editable&&!warning?`<span class="tree-drag" role="button" tabindex="0" draggable="true" data-tree-drag="${treeEscape(t.id)}" aria-label="拖曳排序：${treeEscape(t.title)}" title="拖曳同層排序，或使用鍵盤上下鍵">⠿</span>`:''}<div class="tree-title"><small>${depth?`第 ${depth} 層子任務`:'主任務'} · ${{todo:'待開始',doing:'進行中',done:'已完成'}[t.status]||'未設定'}</small>${editable?`<button data-tree-edit="${treeEscape(t.id)}">${treeEscape(t.title)}</button>`:`<strong>${treeEscape(t.title)}</strong>`}<span>${treeEscape(t.assignee||'未指派')} · ${treeEscape(t.due||'未設期限')}</span></div>${editable?`<div class="tree-controls"><button data-tree-edit="${treeEscape(t.id)}" aria-label="編輯：${treeEscape(t.title)}">編輯</button>${depth<MAX_SUBTASK_DEPTH&&!warning?`<button data-tree-add="${treeEscape(t.id)}" aria-label="新增子任務：${treeEscape(t.title)}">＋ 子任務</button>`:''}${!warning?`<button data-tree-step="${treeEscape(t.id)}" data-delta="-1" ${i===0?'disabled':''} aria-label="上移：${treeEscape(t.title)}">↑</button><button data-tree-step="${treeEscape(t.id)}" data-delta="1" ${i===peers.length-1?'disabled':''} aria-label="下移：${treeEscape(t.title)}">↓</button>`:''}</div>`:''}</div></div>`;}).join('')||'<p class="empty">沒有符合條件的任務。</p>'}</div>`;
}
export function bindTaskTree(host,{getTasks,onMove,onEdit,onAdd,onError,canEdit=()=>true}){
 let dragged=null;
 function finish(){dragged=null;host.querySelectorAll('.tree-drop-before,.tree-drop-after').forEach(el=>el.classList.remove('tree-drop-before','tree-drop-after'));}
 function step(id,delta){try{const tasks=getTasks(),t=tasks.find(t=>t.id===id);if(!t)return;const peers=tasks.filter(p=>scope(p)===scope(t)&&parent(p)===parent(t)),target=peers[peers.findIndex(p=>p.id===id)+delta];if(target)onMove(id,target.id,delta>0);}catch(e){onError(e);}}
 host.addEventListener('click',e=>{const b=e.target.closest('[data-tree-edit],[data-tree-add],[data-tree-step]');if(!b)return;e.stopPropagation();if(b.dataset.treeEdit)onEdit(b.dataset.treeEdit);else if(canEdit()&&b.dataset.treeAdd)onAdd(b.dataset.treeAdd);else if(canEdit()&&b.dataset.treeStep)step(b.dataset.treeStep,Number(b.dataset.delta));});
 host.addEventListener('keydown',e=>{const handle=e.target.closest('[data-tree-drag]');if(handle&&canEdit()&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();step(handle.dataset.treeDrag,e.key==='ArrowUp'?-1:1);}});
 host.addEventListener('dragstart',e=>{const b=e.target.closest('[data-tree-drag]');if(!b||!canEdit())return;dragged=b.dataset.treeDrag;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';e.stopPropagation();});
 host.addEventListener('dragover',e=>{if(!dragged)return;const row=e.target.closest('[data-tree-id]');if(!row)return;e.preventDefault();e.stopPropagation();host.querySelectorAll('.tree-drop-before,.tree-drop-after').forEach(el=>el.classList.remove('tree-drop-before','tree-drop-after'));row.classList.add(e.clientY>row.getBoundingClientRect().top+row.offsetHeight/2?'tree-drop-after':'tree-drop-before');});
 host.addEventListener('drop',e=>{if(!dragged)return;e.preventDefault();e.stopPropagation();const id=dragged,row=e.target.closest('[data-tree-id]');const after=row&&e.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;finish();if(row&&canEdit())onMove(id,row.dataset.treeId,after);});
 host.addEventListener('dragend',finish);
}
