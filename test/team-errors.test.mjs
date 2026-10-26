import {test} from 'node:test';
import assert from 'node:assert/strict';
import {teamErrorMessage} from '../public/team-errors.js';
test('email limits explain delivery failure without irrelevant conflict instructions',()=>{
 const err=Object.assign(Error('email rate limit exceeded'),{status:429,code:'over_email_send_rate_limit'});
 const text=teamErrorMessage(err);assert.match(text,/驗證信/);assert.match(text,/SMTP/);assert.doesNotMatch(text,/關閉編輯視窗|重新載入最新版本/);
 assert.match(teamErrorMessage(Error('email rate limit exceeded')),/停止重複/);
});
test('only conflicts include data reload advice; auth and validation errors stay specific',()=>{
 assert.match(teamErrorMessage(Error('版本衝突，請重新載入')),/未儲存內容/);
 assert.doesNotMatch(teamErrorMessage(Error('截止日不可早於起始日')),/版本衝突/);
 assert.match(teamErrorMessage(Object.assign(Error('x'),{code:'email_not_confirmed'})),/尚未完成驗證/);
 assert.match(teamErrorMessage(Object.assign(Error('x'),{code:'invalid_credentials'})),/Email 或密碼/);
 assert.match(teamErrorMessage(Object.assign(Error('x'),{status:429})),/操作過於頻繁/);
});
