import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import definition from '../module.js';import {WorkStore} from '../core/store.js';
const save=(s,collection,data,id)=>{const n=s.transact({operation:'save',collection,data,id,revision:s.read().revision});return id||n.data[collection].at(-1).id;};
const audit=s=>s.db.prepare('SELECT * FROM audit ORDER BY rowid').all();
function rejected(s,action){const before=s.read(),events=audit(s);assert.throws(action,/Сначала/);assert.deepEqual(s.read(),before);assert.deepEqual(audit(s),events);}
function fixture(s){const c=save(s,'contacts',{name:'SYNTHETIC contact',email:'history@example.org',company:'SYNTHETIC company',status:'active'}),live=save(s,'contacts',{name:'SYNTHETIC live contact',email:'live@example.org',company:'SYNTHETIC company',status:'active'}),fields={contact:c,task:'SYNTHETIC task',due:'2099-12-31',status:'open'},a=save(s,'actions',fields);rejected(s,()=>s.transact({operation:'archive',collection:'contacts',id:c,revision:s.read().revision}));save(s,'actions',{...fields,status:'done'},a);s.transact({operation:'archive',collection:'contacts',id:c,revision:s.read().revision});return {c,live,a,fields};}

test('completed history with archived contact remains editable while new/reopened open actions stay rejected',()=>{
 const s=new WorkStore(definition);try{const f=fixture(s),originalContact=s.read().data.contacts[0];
 rejected(s,()=>save(s,'actions',{...f.fields,task:'SYNTHETIC forbidden new open'}));
 rejected(s,()=>save(s,'actions',f.fields,f.a));
 save(s,'actions',{...f.fields,task:'SYNTHETIC corrected completed task',due:'2099-12-30',status:'done'},f.a);
 assert.deepEqual(s.read().data.contacts[0],originalContact);assert.equal(s.read().data.actions[0].contact,f.c);assert.equal(s.read().data.actions[0].status,'done');
 save(s,'actions',{contact:f.live,task:'SYNTHETIC new active task',due:'2099-12-31',status:'open'});
 s.transact({operation:'archive',collection:'actions',id:f.a,revision:s.read().revision});assert.equal(s.read().data.actions[0].contact,f.c);assert.equal(s.read().data.actions[0].status,'done');
 }finally{s.close();}
});

test('real file restart and validated restore preserve completed action/contact history and reopening guard',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dataline-history-')),path=join(dir,'workspace.sqlite');let s=new WorkStore(definition,path);const restored=new WorkStore(definition);
 try{const f=fixture(s),before=s.read(),events=audit(s),copy=s.export();s.close();s=new WorkStore(definition,path);assert.deepEqual(s.read(),before);assert.deepEqual(audit(s),events);restored.restore(copy);assert.deepEqual(restored.read().data,before.data);assert.deepEqual(restored.read().computed,before.computed);
 rejected(restored,()=>save(restored,'actions',f.fields,f.a));
 save(restored,'actions',{...f.fields,task:'SYNTHETIC revised after restore',status:'done'},f.a);
 assert.equal(restored.read().data.actions[0].contact,f.c);assert.deepEqual(restored.read().data.contacts,before.data.contacts);
 save(restored,'actions',{contact:f.live,task:'SYNTHETIC valid active task',due:'2099-12-31',status:'open'});
 }finally{s.close();restored.close();rmSync(dir,{recursive:true,force:true});}
});
