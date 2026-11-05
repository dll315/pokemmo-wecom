import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../src/store.mjs';import {Monitor} from '../src/monitor.mjs';import {Translator} from '../src/i18n.mjs';import {WebhookInbox} from '../src/inbox.mjs';import {upsertTarget} from '../src/targets.mjs';
test('QQ多群共用Key限流、重启保留渠道配置，查询回执不会重新发消息或泄露Key',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qq-queue-'));let store=new Store(dir);const translator=await Translator.load(),url='https://qmsg.zendee.cn/v3/send/testsecretkey';let now=Date.now(),calls=0,queries=0;
 try{
  store.state.config=upsertTarget(store.state.config,{name:'QQ群一',url,type:'qmsg',groupId:'123456'});store.state.config=upsertTarget(store.state.config,{name:'QQ群二',url,type:'qmsg',groupId:'123457'});store.state.config.enabled=true;const inbox=new WebhookInbox({store,translator,now:()=>now});
  const monitor=new Monitor({store,translator,source:{},now:()=>now,send:async(u,p,{target})=>{calls++;assert.equal(target.type,'qmsg');return {outcome:'uncertain',providerId:42};},queryReceipt:async(u,id)=>{queries++;assert.equal(id,42);return{outcome:'success',providerId:id};}});
  inbox.receive({kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8'});await monitor.deliverOne();await monitor.deliverOne();assert.equal(calls,1);assert.equal(store.state.outbox[1].status,'pending');
  now+=3500;await monitor.deliverOne();assert.equal(calls,2);const task=store.state.outbox[0];await monitor.checkReceipt(task.id);assert.equal(task.status,'sent');assert.equal(calls,2);assert.equal(queries,1);await assert.rejects(()=>monitor.checkReceipt(task.id));assert.equal(calls,2);
  const view=JSON.stringify(store.publicState());assert.ok(!view.includes('testsecretkey'));store.log('error',url);assert.ok(!store.state.logs[0].message.includes('testsecretkey'));
  store.close();store=new Store(dir);assert.equal(store.state.config.targets[0].type,'qmsg');assert.equal(store.state.config.targets[0].groupId,'123456');assert.equal(store.state.outbox[0].status,'sent');
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
