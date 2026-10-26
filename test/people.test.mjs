import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planImport,resolvePerson,activeReminder} from '../public/people.js';
const headers=['工號','姓名','Email'];
test('incremental import preserves text IDs and identifies new, changed and unchanged employees',()=>{
 const old=[{id:'001',name:'同名',email:'old@example.com'},{id:'002',name:'同名',email:'second@example.com'},{id:'003',name:'未列出',email:'keep@example.com'}];
 const plan=planImport([headers,['001','更新姓名','new@example.com'],['002','同名','second@example.com'],['004','新增','four@example.com']],old);
 assert.deepEqual(plan.errors,[]);assert.deepEqual(plan.records.map(p=>p.action),['更新','不變','新增']);assert.equal(plan.records[0].id,'001');assert.equal(old.length,3);
 assert.equal(resolvePerson({employeeId:'002'},old).email,'second@example.com');
});
test('reject missing headers, invalid email and duplicate ID',()=>{
 assert.ok(planImport([['姓名']],[]).errors.length);
 assert.ok(planImport([headers,['001','人員','bad email']],[]).errors.length);
 assert.ok(planImport([headers,['001','甲','a@example.com'],['001','乙','b@example.com']],[]).errors.length);
});
test('same-name employees are distinct; reminders follow status and stop on completion',()=>{
 assert.equal(planImport([headers,['1','同名','a@example.com'],['2','同名','b@example.com']],[]).records.length,2);
 const task={status:'todo',reminders:{todo:{frequency:'daily'},doing:{frequency:'off'}}};
 assert.equal(activeReminder(task).frequency,'daily');task.status='doing';assert.equal(activeReminder(task),null);task.status='done';assert.equal(activeReminder(task),null);
});
