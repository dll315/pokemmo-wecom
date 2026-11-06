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
 inbox.receive({content:'这是一条不含固定字段的通知'});await monitor.deliverOne();assert.equal(sent.length,0);assert.match(store.state.receipts[0].preview,/这是一条/);
 store.state.config.regions=['Kanto'];inbox.receive({kind:'alpha',pokemon:'Jynx',region:'Unova',content:'另一次'});assert.equal(store.state.outbox.length,0);
}));
test('后台常驻工作线程无需手动点击即可发送回调，启动时不访问源站',()=>fixture(async({inbox,monitor,sent})=>{
 monitor.start({webhookOnly:true});try{inbox.receive({content:'Alpha Jynx 自动发送测试'});const end=Date.now()+4000;while(!sent.length&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.equal(sent.length,1);}finally{await monitor.stop();}
}));
test('从旧版升级后停用遗留轮询任务，避免发送线程再次访问被拒绝的接口',()=>fixture(async({store,monitor})=>{
 const now=Date.now();store.state.outbox.push({id:'legacy',key:'swarm:1',targetId:'default',fingerprint:'legacy',event:{key:'swarm:1',id:1,kind:'swarm',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:now,expiresAt:now+600000,originalExpiresAt:now+600000,verified:true,status:'active'},status:'pending',createdAt:now,nextAttemptAt:0,attempts:0});
 new WebhookInbox({store,translator:new Translator()});assert.equal(store.state.outbox[0].status,'skipped');await monitor.deliverOne();
}));
test('关闭头目和明雷类型后未知类型消息也不得绕过用户选项发送',()=>fixture(async({store,inbox})=>{
 store.state.config.alphas=false;store.state.config.swarms=false;const r=inbox.receive({content:'官网通知，无可识别的类型'});assert.equal(r.queued,0);
}));
test('推送中的位置图链接指向本站静态图片，图片可直接读取且未知路径返回404',()=>fixture(async({store,inbox,base})=>{
 const response=await fetch(base+inbox.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'alpha',pokemon:'Lairon',region:'Hoenn',location:'Granite Cave'})});assert.equal(response.status,200);
 const receipt=store.state.receipts[0];assert.ok(receipt.preview.includes(base+receipt.details.mapPath));const image=await fetch(base+receipt.details.mapPath);assert.equal(image.status,200);assert.match(image.headers.get('Content-Type'),/^image\//);assert.ok((await image.arrayBuffer()).byteLength>1000);
 assert.equal((await fetch(base+'/maps/does-not-exist.png')).status,404);
}));
test('升级旧回调记录时补齐标题与起止字段，更新未发送格式且不重复入队',()=>fixture(async({store,inbox,monitor,sent})=>{
 inbox.receive({kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',startAt:'2026-11-05T10:00:00Z',endAt:'2026-11-05T11:15:00Z'});const r=store.state.receipts[0];delete r.title;delete r.timing;delete r.formatVersion;r.preview='旧格式';store.state.outbox[0].payload={msgtype:'markdown',markdown:{content:'旧格式'}};
 new WebhookInbox({store,translator:await Translator.load()});assert.equal(r.title,'合众 头目 迷唇姐');assert.equal(r.timing.startAt,r.at);assert.equal(store.state.outbox.length,1);assert.equal(sent.length,0);await monitor.deliverOne();assert.equal(sent.length,1);assert.equal(sent[0].markdown.content.split('\n')[0],'合众 头目 迷唇姐');
}));

test('三类报点均入队并发送，奇遇开关独立生效且不借用群集时长',()=>fixture(async({store,inbox,monitor,sent})=>{let clock=Date.now();inbox.now=()=>clock;monitor.now=()=>clock;const bodies=[{type:'message',event_type:'alpha_spawn',pokemon:'Ekans',region:'Johto'},{event_type:'swarm_spawn',pokemon:'Pikachu',region:'Kanto'},{notification_type:'phenomenon',region:'Unova',location:'Route 5',endAt:new Date(clock+600000).toISOString()}];for(const body of bodies)inbox.receive(body);assert.deepEqual(store.state.receipts.map(r=>r.kind),['pheno','swarm','alpha']);assert.equal(store.state.receipts[0].timing.endAt,clock+600000);for(let i=0;i<3;i++){await monitor.deliverOne();clock+=4000;}assert.equal(sent.length,3);assert.match(sent[2].markdown.content,/奇遇/);store.state.config.phenos=false;const result=inbox.receive({notification_type:'pheno',region:'Unova',location:'Route 6'});assert.equal(result.queued,0);assert.equal(store.state.receipts[0].timing.endAt,null);store.state.config.phenos=true;const sub=store.state.subscriptions[0];sub.phenos=false;assert.equal(inbox.receive({type:'pheno',region:'Unova',location:'Route 7'}).filtered,true);sub.phenos=true;store.state.config.targets[0]&&(store.state.config.targets[0].phenos=false);store.save();}));

test('旧记录原始结构损坏时仍保留接收时间，停止转发并显示解析原因',()=>fixture(async({store,inbox})=>{inbox.receive({kind:'alpha',pokemon:'Jynx',region:'Unova'});const r=store.state.receipts[0];r.raw={embeds:[null]};r.formatVersion=0;r.timing.startAt=null;new WebhookInbox({store,translator:await Translator.load()});assert.equal(r.kind,'unknown');assert.equal(r.timing.startAt,r.at);assert.match(r.parseError,/解析失败/);assert.equal(store.state.outbox[0].status,'skipped');}));
