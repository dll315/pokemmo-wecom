import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredTargets, upsertTarget, deleteTarget, setLegacyWebhook } from '../src/targets.mjs';
import { Store } from '../src/store.mjs';
import { Monitor } from '../src/monitor.mjs';
import { Translator } from '../src/i18n.mjs';
const now=Date.parse('2026-10-12T07:40:00Z');
const event={key:'alpha:1',id:1,kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:now-60000,expiresAt:now+4500000,originalExpiresAt:now+4500000,url:'https://alpha.pokemmotools.org/alpha-list?pokemon=Jynx',verified:true,status:'active'};
const url=name=>'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key='+name;
test('增删改目标，空地址保留原链接，拒绝重复链接和非法地址',()=>{
  let c={webhookUrl:'',targets:[]};c=upsertTarget(c,{name:'一群',url:url('a')});const id=c.targets[0].id;
  c=upsertTarget(c,{id,name:'新名称',url:'',enabled:false});assert.equal(c.targets[0].url,url('a'));assert.equal(c.targets[0].enabled,false);
  assert.throws(()=>upsertTarget(c,{name:'重复',url:url('a')}));assert.throws(()=>upsertTarget(c,{name:'非法',url:'http://127.0.0.1'}));
  c=deleteTarget(c,id);assert.equal(configuredTargets(c).length,0);
});
async function setup(fn){const dir=await mkdtemp(join(tmpdir(),'pokemmo-targets-'));const store=new Store(dir);store.state.config.enabled=true;store.state.config=upsertTarget(store.state.config,{name:'一群',url:url('a')});store.state.config=upsertTarget(store.state.config,{name:'二群',url:url('b')});try{await fn(store,dir);}finally{store.close();await rm(dir,{recursive:true,force:true});}}
test('多群独立发送；一个结果不明不阻止其他群成功，也不盲目重发',async()=>setup(async store=>{
  const sent=[];const m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async(u)=>{sent.push(u);return{outcome:u===url('a')?'uncertain':'success'};}});
  await m.observe([event]);await m.deliverOne();await m.deliverOne();await m.observe([event]);await m.deliverOne();
  assert.deepEqual(sent,[url('a'),url('b')]);assert.deepEqual(store.state.outbox.map(t=>t.status),['uncertain','sent']);
}));
test('多群重启保留各自去重状态，新加群不会补发其他群的旧成功任务',async()=>setup(async(store,dir)=>{
  let calls=0;let m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async()=>{calls++;return{outcome:'success'};}});await m.observe([event]);await m.deliverOne();await m.deliverOne();store.close();
  const restored=new Store(dir);try{m=new Monitor({store:restored,source:{},translator:new Translator(),now:()=>now+5000,send:async()=>{calls++;return{outcome:'success'};}});await m.observe([event]);await m.deliverOne();assert.equal(calls,2);restored.state.config=upsertTarget(restored.state.config,{name:'三群',url:url('c')});await m.observe([event]);await m.deliverOne();assert.equal(calls,3);}finally{restored.close();}
}));
test('删除或关闭目标后，队列不再向该地址发送',async()=>setup(async store=>{
  const sent=[];const m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async u=>{sent.push(u);return{outcome:'success'};}});await m.observe([event]);const id=store.state.config.targets[0].id;store.state.config=deleteTarget(store.state.config,id);await m.deliverOne();await m.deliverOne();assert.deepEqual(sent,[url('b')]);
}));
test('单链接旧配置和旧成功记录迁移后不会重新推送',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pokemmo-legacy-'));const store=new Store(dir);Object.assign(store.state.config,{enabled:true,webhookUrl:url('legacy')});const m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async()=>({outcome:'success'})});
  try{await m.observe([event]);await m.deliverOne();store.save();store.close();const r=new Store(dir);try{let calls=0;const next=new Monitor({store:r,source:{},translator:new Translator(),now:()=>now+5000,send:async()=>{calls++;return{outcome:'success'};}});await next.observe([event]);await next.deliverOne();assert.equal(calls,0);}finally{r.close();}}finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('某个链接连接等待时，其他链接仍能独立发送',async()=>setup(async store=>{
  let release;const waiting=new Promise(r=>release=r),sent=[];
  const m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async u=>{if(u===url('a'))await waiting;sent.push(u);return{outcome:'success'};}});
  await m.observe([event]);const first=m.deliverOne();try{await m.deliverOne();assert.deepEqual(sent,[url('b')]);}finally{release();await first;}
}));
test('两个群同时核实相同的新消失时间，不能互相取消有效任务',async()=>setup(async store=>{
  let checks=0,release;const barrier=new Promise(r=>release=r);const sent=[];
  const source={swarmStatus:async e=>{if(++checks===1)return{status:'active',notification_id:e.id,effective_despawn_timestamp:e.originalExpiresAt/1000};if(checks===3)release();await barrier;return{status:'active',notification_id:e.id,effective_despawn_timestamp:(now+25000)/1000};}};
  const m=new Monitor({store,source,translator:new Translator(),now:()=>now,send:async u=>{sent.push(u);return{outcome:'success'};}});
  await m.observe([{...event,kind:'swarm',key:'swarm:1',verified:false}]);await Promise.all([m.deliverOne(),m.deliverOne()]);assert.deepEqual(new Set(sent),new Set([url('a'),url('b')]));
}));
test('地址替换时分配新目标身份，旧地址送达不算新地址已收到',async()=>setup(async store=>{
  store.state.config=deleteTarget(store.state.config,store.state.config.targets[1].id);let release;const wait=new Promise(r=>release=r),sent=[];
  const m=new Monitor({store,source:{},translator:new Translator(),now:()=>now,send:async u=>{sent.push(u);if(u===url('a'))await wait;return{outcome:'success'};}});
  await m.observe([event]);const first=m.deliverOne();const oldId=store.state.config.targets[0].id;store.state.config=upsertTarget(store.state.config,{id:oldId,url:url('new')});release();await first;await m.observe([event]);await m.deliverOne();assert.deepEqual(sent,[url('a'),url('new')]);assert.notEqual(store.state.config.targets[0].id,oldId);
}));
test('环境和旧接口的单链接覆盖同步目标，地址变更不复用旧去重身份',()=>{
  const config={webhookUrl:url('old'),targets:[]};const changed=setLegacyWebhook(config,url('new'));assert.equal(configuredTargets(changed)[0].url,url('new'));assert.notEqual(configuredTargets(changed)[0].id,'default');
  assert.equal(setLegacyWebhook(changed,url('new')).targets[0].id,changed.targets[0].id);
});
