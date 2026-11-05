import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';import {WebhookInbox} from '../src/inbox.mjs';import {Translator} from '../src/i18n.mjs';import {createApp} from '../src/server.mjs';
test('订阅保留旧地址；禁用、类型过滤、跨地址去重、轮换和删除均持久化且不公开',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'subscriptions-'));let store=new Store(dir);const translator=await Translator.load();let inbox=new WebhookInbox({store,translator});const old=inbox.path;const server=createApp({store,translator,inbox,monitor:{stopping:false}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/subscriptions',{name:'未登录'})).status,401);
  const login=await post('/api/login',{password:'123456'}),cookie=login.headers.get('set-cookie').split(';')[0];
  const request=await post('/api/subscriptions',{name:'明雷订阅',alphas:false,swarms:true},cookie);assert.equal(request.status,200);const sub=await request.json();assert.notEqual(sub.path,old);assert.match(sub.path,/^\/receive\/[a-f0-9]{48}$/);
  const alpha={kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8'};assert.equal((await(await post(sub.path,alpha)).json()).filtered,true);assert.equal(store.state.receipts.length,0);
  await post(old,alpha);assert.equal(store.state.receipts.length,1);
  const swarm={kind:'swarm',pokemon:'Pikachu',region:'Kanto',location:'Route 1'};await post(sub.path,swarm);assert.equal((await(await post(old,swarm)).json()).duplicate,true);assert.equal(store.state.receipts.length,2);
  await post('/api/subscriptions',{id:sub.id,enabled:false},cookie);assert.equal((await post(sub.path,swarm)).status,403);
  const rotated=await(await post('/api/subscriptions',{id:sub.id,enabled:true,rotate:true},cookie)).json();assert.notEqual(rotated.path,sub.path);assert.equal((await post(sub.path,swarm)).status,404);
  assert.equal((await post('/api/subscriptions',{name:'非法',enabled:'yes'},cookie)).status,400);
  const pub=await(await fetch(base+'/api/public')).text();assert.ok(!pub.includes(old));assert.ok(!pub.includes(rotated.path));
  await post('/api/subscriptions/delete',{id:sub.id},cookie);assert.equal((await post(rotated.path,swarm)).status,404);
  store.close();store=new Store(dir);inbox=new WebhookInbox({store,translator});assert.equal(inbox.path,old);assert.equal(inbox.view().subscriptions.length,1);
  inbox.deleteSubscription('default');store.close();store=new Store(dir);inbox=new WebhookInbox({store,translator});assert.equal(inbox.path,null);assert.equal(inbox.view().subscriptions.length,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}
});
