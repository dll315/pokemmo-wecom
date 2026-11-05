import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Monitor } from '../src/monitor.mjs';
import { Translator } from '../src/i18n.mjs';
import { parseHistoryRow } from '../src/events.mjs';
const NOW=Date.parse('2026-10-12T07:40:00Z');
const event=parseHistoryRow('alpha',{id:4927,pokemon:'Jynx',region:'Unova',location:'Route 8',timestampIso:'2026-10-12T07:36:15',alphaUrl:'/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1791795075'});
async function setup(fn){
  const dir=await mkdtemp(join(tmpdir(),'pokemmo-monitor-'));const store=new Store(dir);Object.assign(store.state.config,{enabled:true,webhookUrl:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test'});
  try{await fn(store,dir);}finally{store.close();await rm(dir,{recursive:true,force:true});}
}
function monitor(store,send,extra={}){return new Monitor({store,source:{swarmStatus:async e=>({status:'active',notification_id:e.id,effective_despawn_timestamp:e.expiresAt/1000})},translator:new Translator(),send,now:()=>NOW,...extra});}
test('首次只发送活跃报点，多次观察和重启均不重复发送',async()=>setup(async(store,dir)=>{
  let calls=0;let m=monitor(store,async()=>{calls++;return{outcome:'success'};});
  await m.observe([event,{...event,key:'alpha:1',id:1,expiresAt:NOW-1}]);await m.deliverOne();assert.equal(calls,1);
  await m.observe([event]);await m.deliverOne();assert.equal(calls,1);store.close();
  const restored=new Store(dir);try{m=monitor(restored,async()=>{calls++;return{outcome:'success'};},{now:()=>NOW+5000});await m.observe([event]);await m.deliverOne();assert.equal(calls,1);assert.equal(restored.state.outbox.length,1);}finally{restored.close();}
}));
test('发送前落盘，业务失败不算发送成功，手动重试才重发',async()=>setup(async store=>{
  let calls=0,current=NOW;const m=monitor(store,async()=>{calls++;assert.equal(store.state.outbox[0].status,'sending');return{outcome:'failed',error:'业务失败'};},{now:()=>current});
  await m.observe([event]);await m.deliverOne();await m.deliverOne();assert.equal(calls,1);assert.equal(store.state.outbox[0].status,'failed');
  m.resolve(store.state.outbox[0].id,'retry');current+=3500;await m.deliverOne();assert.equal(calls,2);
}));
test('结果不明时不自动重发；记录仍显示待确认',async()=>setup(async store=>{
  let calls=0;const m=monitor(store,async()=>{calls++;return{outcome:'uncertain',error:'timeout'};});
  await m.observe([event]);await m.deliverOne();await m.deliverOne();assert.equal(calls,1);assert.equal(store.state.outbox[0].status,'uncertain');
}));
test('等待中失效的报点跳过，暂停后不会发出旧队列',async()=>setup(async store=>{
  let current=NOW,calls=0;const m=monitor(store,async()=>{calls++;return{outcome:'success'};},{now:()=>current});
  await m.observe([event]);store.state.config.enabled=false;await m.deliverOne();assert.equal(calls,0);
  store.state.config.enabled=true;current=event.expiresAt;await m.deliverOne();assert.equal(calls,0);assert.equal(store.state.outbox[0].status,'skipped');
}));
test('网站数据变更生成一次更正，而重复更正不会重复推送',async()=>setup(async store=>{
  let calls=0,current=NOW;const m=monitor(store,async()=>{calls++;return{outcome:'success'};},{now:()=>current});await m.observe([event]);await m.deliverOne();current+=3500;
  const changed={...event,location:'Changed',url:event.url.replace('Route+8','Changed')};
  await m.observe([changed]);await m.deliverOne();await m.observe([changed]);await m.deliverOne();assert.equal(calls,2);assert.equal(store.state.outbox[1].correction,true);
}));
test('群怪已撤回不能发新报点，发送前必须再次核对',async()=>setup(async store=>{
  let status='active',calls=0;
  const m=monitor(store,async()=>{calls++;return{outcome:'success'};},{source:{swarmStatus:async e=>({status,notification_id:e.id,effective_despawn_timestamp:e.expiresAt/1000})}});
  const e={...event,key:'swarm:1',id:1,kind:'swarm',verified:false};
  await m.observe([e]);status='removed';await m.deliverOne();assert.equal(calls,0);assert.equal(store.state.outbox[0].status,'skipped');
}));
test('临时失败延迟重试，同时符合机器人发送频率',async()=>setup(async store=>{
  let current=NOW,calls=0;const m=monitor(store,async()=>{calls++;return calls===1?{outcome:'retry',retryAfter:60000}:{outcome:'success'};},{now:()=>current});
  await m.observe([event]);await m.deliverOne();await m.deliverOne();assert.equal(calls,1);current+=60000;await m.deliverOne();assert.equal(calls,2);assert.equal(store.state.outbox[0].status,'sent');
}));
test('暂停时仍可主动发送明确标识的测试消息，失败结果保留',async()=>setup(async store=>{
  store.state.config.enabled=false;let body;
  const m=monitor(store,async(url,payload)=>{body=payload;return{outcome:'uncertain',error:'连接中断'};});
  const result=await m.sendTest();assert.equal(result.outcome,'uncertain');assert.equal(body.msgtype,'text');assert.match(body.text.content,/测试消息/);assert.equal(store.state.outbox[0].status,'uncertain');
}));
test('正在扫描时停止程序，会等待读取退出再允许关闭存储',async()=>setup(async store=>{
  let complete;const wait=new Promise(r=>complete=r);
  const m=monitor(store,async()=>({outcome:'success'}),{source:{history:async()=>{await wait;return[event];},close(){complete();}}});
  const scanning=m.scan('alpha');await m.stop();await scanning;
  assert.equal(store.state.outbox.length,0);
}));
test('群怪发送前查询期间出现更正，不发送已被替代的旧任务',async()=>setup(async store=>{
  let calls=0,current=NOW,queries=0,release,started;
  const ready=new Promise(r=>started=r),deferred=new Promise(r=>release=r);
  const payloads=[];
  const source={swarmStatus:async e=>{queries++;if(queries===2){started();await deferred;}return{status:'active',notification_id:e.id,effective_despawn_timestamp:e.expiresAt/1000};}};
  const m=monitor(store,async(url,payload)=>{calls++;payloads.push(payload.markdown.content);return{outcome:'success'};},{source,now:()=>current});
  const e={...event,kind:'swarm',key:'swarm:1',id:1,verified:false};await m.observe([e]);
  const sending=m.deliverOne();await ready;await m.observe([{...e,location:'Changed'}]);release();await sending;
  current+=3500;await m.deliverOne();assert.equal(calls,1);assert.match(payloads[0],/Changed/);
}));
test('发送前状态核对改变消失时间后，不再发送同一实际版本',async()=>setup(async store=>{
  let queries=0,calls=0,current=NOW;
  const source={swarmStatus:async e=>({status:'active',notification_id:e.id,effective_despawn_timestamp:++queries===1?e.originalExpiresAt/1000:(e.originalExpiresAt-600000)/1000})};
  const m=monitor(store,async()=>{calls++;return{outcome:'success'};},{source,now:()=>current});
  const e={...event,kind:'swarm',key:'swarm:1',id:1,verified:false};await m.observe([e]);await m.deliverOne();current+=3500;await m.observe([e]);await m.deliverOne();assert.equal(calls,1);
}));
test('一条群怪状态未知不能阻止同批其他已核实群怪入队',async()=>setup(async store=>{
  const source={swarmStatus:async e=>e.id===1?{status:'unknown',notification_id:null}:{status:'active',notification_id:e.id,effective_despawn_timestamp:e.expiresAt/1000}};
  const m=monitor(store,async()=>({outcome:'success'}),{source});
  const e={...event,kind:'swarm',key:'swarm:1',id:1,verified:false};await m.observe([e,{...e,key:'swarm:2',id:2}]);assert.equal(store.state.outbox.length,1);assert.equal(store.state.outbox[0].event.id,2);assert.ok(store.state.logs.some(e=>e.level==='warn'));
}));
test('群怪核对回到已有待确认版本时，不能绕过用户确认再次发送',async()=>setup(async store=>{
  let expiry=event.expiresAt,calls=0,current=NOW;
  const source={swarmStatus:async e=>({status:'active',notification_id:e.id,effective_despawn_timestamp:expiry/1000})};
  const m=monitor(store,async()=>{calls++;return{outcome:'uncertain',error:'timeout'};},{source,now:()=>current});
  const e={...event,kind:'swarm',key:'swarm:1',id:1,verified:false};await m.observe([e]);await m.deliverOne();
  expiry-=600000;await m.observe([e]);expiry=event.expiresAt;current+=3500;await m.deliverOne();
  assert.equal(calls,1);assert.equal(new Set(store.state.outbox.map(t=>t.id)).size,store.state.outbox.length);
}));
test('某类型关闭时跳过的有效任务，在重新开启后仍可发送',async()=>setup(async store=>{
  let calls=0;const m=monitor(store,async()=>{calls++;return{outcome:'success'};});await m.observe([event]);store.state.config.alphas=false;await m.deliverOne();assert.equal(calls,0);
  store.state.config.alphas=true;await m.observe([event]);await m.deliverOne();assert.equal(calls,1);assert.equal(store.state.outbox.length,1);
}));
test('致命错误通知进程退出处理器，同时停止新的发送',async t=>setup(async store=>{
  t.mock.method(console,'error',()=>{});
  let called=0;const m=monitor(store,async()=>({outcome:'success'}),{onFatal:()=>called++});m.fatal(new Error('simulated disk failure'));assert.equal(called,1);assert.equal(m.stopping,true);
}));
test('24小时历史扫描不能把已核实的提前结束状态覆盖为未核实',async()=>setup(async store=>{
  let current=NOW;const original={...event,kind:'swarm',key:'swarm:1',id:1,verified:false};
  const m=monitor(store,async()=>({outcome:'success'}),{now:()=>current,source:{swarmStatus:async e=>({status:'ended_early',notification_id:e.id,effective_despawn_timestamp:NOW/1000})}});
  await m.observe([original]);current=event.originalExpiresAt+1000;await m.observe([original]);
  assert.equal(store.state.records['swarm:1'].event.verified,true);assert.equal(store.state.records['swarm:1'].event.status,'ended_early');assert.equal(store.state.records['swarm:1'].event.expiresAt,NOW);
}));
test('24小时扫描不会反复复活过旧更正，阻塞新报点发送',async()=>setup(async store=>{
  let calls=0;const m=monitor(store,async()=>{calls++;return{outcome:'success'};});
  const old={...event,key:'swarm:old',id:2,kind:'swarm',reportedAt:NOW-5*3600000,expiresAt:NOW-4*3600000,originalExpiresAt:NOW-4*3600000,status:'ended_early',verified:true};
  store.state.records[old.key]={event:old,fingerprint:'old',lastSentFingerprint:'old',observedAt:NOW};
  await m.observe([old,event]);assert.equal(store.state.outbox.length,1);assert.equal(store.state.outbox[0].key,event.key);await m.deliverOne();assert.equal(calls,1);
}));
