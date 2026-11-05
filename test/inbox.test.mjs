import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Monitor} from '../src/monitor.mjs';
import {Translator} from '../src/i18n.mjs';
import {WebhookInbox} from '../src/inbox.mjs';
import {createApp} from '../src/server.mjs';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'pokemmo-inbox-'));const store=new Store(dir);store.state.config={...store.state.config,enabled:true,webhookUrl:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mock'};const tr=await Translator.load();const sent=[];const monitor=new Monitor({store,source:{history(){throw Error('禁止轮询');},swarmStatus(){throw Error('禁止访问源站');}},translator:tr,send:async(u,p)=>{sent.push(p);return{outcome:'success'};}});const inbox=new WebhookInbox({store,translator:tr});const server=createApp({store,monitor,translator:tr,inbox,password:'test-password'});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn({store,inbox,monitor,sent,base:`http://127.0.0.1:${server.address().port}`});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}}
test('官网回调持久化入队、中文发送，不访问历史或状态接口，重复回调不重复发送',()=>fixture(async({inbox,monitor,sent,store,base})=>{
 const body={kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',content:'Alpha Jynx'};
 const path=inbox.path;
 const request=()=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request()).status,200);await monitor.deliverOne();assert.equal(sent.length,1);assert.match(sent[0].markdown.content,/迷唇姐/);assert.match(sent[0].markdown.content,/招式/);
 assert.equal((await request()).status,200);await monitor.deliverOne();assert.equal(sent.length,1);assert.equal(store.state.receipts.length,1);
}));
test('暂停期间不发送，启用后无需手动运行即可处理入队消息',()=>fixture(async({store,inbox,monitor,sent})=>{
 store.state.config.enabled=false;inbox.receive({content:'Swarm Pikachu'});await monitor.deliverOne();assert.equal(sent.length,0);store.state.config.enabled=true;await monitor.deliverOne();assert.equal(sent.length,1);
}));
test('接收地址重启后不变、接收记录保存、不在公开接口泄露地址或原始正文',()=>fixture(async({store,inbox,base})=>{
 inbox.receive({content:'原始正文保密 Alpha Jynx'});const second=new WebhookInbox({store,translator:new Translator()});assert.equal(second.path,inbox.path);
 const text=await(await fetch(base+'/api/public')).text();assert.ok(!text.includes(inbox.path));assert.ok(!text.includes('原始正文保密'));
 assert.equal((await fetch(base+'/receive/invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
}));
test('未知消息保留中文原文；空对象拒绝，地区过滤和目标开关生效',()=>fixture(async({store,inbox,monitor,sent})=>{
 assert.throws(()=>inbox.receive({}),/无法识别/);
 inbox.receive({content:'这是一条不含固定字段的通知'});await monitor.deliverOne();assert.match(sent[0].markdown.content,/这是一条/);
 store.state.config.regions=['Kanto'];inbox.receive({kind:'alpha',pokemon:'Jynx',region:'Unova',content:'另一次'});assert.equal(store.state.outbox.length,1);
}));
test('后台常驻工作线程无需手动点击即可发送回调，启动时不访问源站',()=>fixture(async({inbox,monitor,sent})=>{
 monitor.start({webhookOnly:true});try{inbox.receive({content:'Alpha Jynx 自动发送测试'});const end=Date.now()+4000;while(!sent.length&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.equal(sent.length,1);}finally{await monitor.stop();}
}));
test('从旧版升级后停用遗留轮询任务，避免发送线程再次访问被拒绝的接口',()=>fixture(async({store,monitor})=>{
 const now=Date.now();store.state.outbox.push({id:'legacy',key:'swarm:1',targetId:'default',fingerprint:'legacy',event:{key:'swarm:1',id:1,kind:'swarm',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:now,expiresAt:now+600000,originalExpiresAt:now+600000,verified:true,status:'active'},status:'pending',createdAt:now,nextAttemptAt:0,attempts:0});
 new WebhookInbox({store,translator:new Translator()});assert.equal(store.state.outbox[0].status,'skipped');await monitor.deliverOne();
}));
