import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreContext,versionAtTime,taipeiPoint} from '../public/team-history.js';

const versions=[
 {id:14,revision:4,kind:'restore',restored_from:11,created_at:'2026-10-29T02:20:00.123456Z'},
 {id:13,revision:3,kind:'edit',created_at:'2026-10-29T02:10:45.123456Z'},
 {id:12,revision:2,kind:'edit',created_at:'2026-10-29T02:10:20.123456Z'},
 {id:11,revision:1,kind:'create',created_at:'2026-10-29T02:00:00.123456Z'}
];
test('undo targets the state immediately before a restore, not its older source',()=>{
 const context=restoreContext({revision:4},versions);
 assert.equal(context.previous.id,13);
 assert.equal(context.source.id,11);
 assert.equal(restoreContext({revision:3},versions).previous,null);
 // Undoing a restore is itself an audited restore; it can also be undone.
 const next=[{id:15,revision:5,kind:'restore',restored_from:13},...versions];
 assert.equal(restoreContext({revision:'5'},next).previous.id,14);
 assert.equal(restoreContext({revision:5},next).source.id,13);
 assert.equal(restoreContext({revision:4},versions.slice(0,1)).previous,undefined);
});
test('Taipei seconds distinguish revisions saved within the same minute',()=>{
 assert.equal(taipeiPoint('2026-10-29T10:10:46'),'2026-10-29T02:10:46.000Z');
 assert.equal(versionAtTime(versions,taipeiPoint('2026-10-29T10:10:46')).revision,3);
 assert.equal(versionAtTime(versions,taipeiPoint('2026-10-29T10:10:21')).revision,2);
 assert.equal(versionAtTime(versions,taipeiPoint('2026-10-29T10:10')).revision,1);
 assert.equal(versionAtTime(versions,'2000-01-01T00:00:00Z'),null);
 assert.throws(()=>taipeiPoint('not-a-date'),/時間格式無效/);
});
