import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const image=process.argv[2]||'pokemmo-wecom:smoke';
const suffix=Date.now().toString(36),name='pokemmo-smoke-'+suffix,other=name+'-second',volume=name+'-data';
const base='http://127.0.0.1:18787';
function docker(args){return execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000}).trim();}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await pause(1000);}throw new Error('Container did not become ready');}
async function api(path,body,cookie){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:base}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200,path);return {data:await r.json(),cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};}
function start(){docker(['run','-d','--name',name,'-p','127.0.0.1:18787:8787','-v',volume+':/data',image]);}
try{
  start();await ready();
  const home=await fetch(base);assert.ok((await home.text()).includes('当前与近期报点'));
  const pub=(await api('/api/public')).data;assert.ok(pub.summary.catalogSpecies>0);assert.ok(pub.summary.catalogEntries>=pub.summary.catalogSpecies);
  assert.equal((await fetch(base+'/api/state')).status,401);
  let auth=await api('/api/login',{password:'123456'});
  const target=(await api('/api/targets',{name:'容器持久化检查',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=container-smoke-not-a-real-key'},auth.cookie)).data;
  const inbox=(await api('/api/inbox',undefined,auth.cookie)).data;
  assert.match(inbox.path,/^\/receive\/[a-f0-9]{48}$/);
  const accepted=await api(inbox.path,{kind:'alpha',pokemon:'Lairon',region:'Hoenn',location:'Granite Cave',startAt:new Date().toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),content:'【容器回调测试】Alpha Lairon'});
  assert.equal(accepted.data.queued,1);
  assert.equal((await api('/api/inbox',undefined,auth.cookie)).data.receipts.length,1);
  const received=(await api('/api/inbox',undefined,auth.cookie)).data.receipts[0];assert.match(received.preview,/铁尾/);assert.match(received.preview,/闪光/);assert.ok(received.preview.includes(base+received.details.mapPath));const map=await fetch(base+received.details.mapPath);assert.equal(map.status,200);assert.match(map.headers.get('content-type'),/^image\//);
  assert.equal(received.preview.split('\n')[0],'丰缘 头目 可多拉');assert.ok(received.timing.startAt);assert.ok(received.timing.endAt);assert.equal((await fetch(base+'/reports.js')).status,200);
  assert.ok(received.profile.sprite);assert.equal((await fetch(base+received.profile.sprite)).status,200);assert.ok(received.profile.movesZh.length);assert.equal(received.timing.startAt,received.at);assert.equal(received.timing.endAt-received.at,75*60000);
  const subscription=(await api('/api/subscriptions',{name:'容器订阅',alphas:false,swarms:true},auth.cookie)).data;
  const qq=(await api('/api/targets',{name:'QQ配置保存检查',type:'qmsg',url:'https://qmsg.zendee.cn/v3/send/container-mock-key',groupId:'123456',enabled:false},auth.cookie)).data;
  assert.equal(qq.type,'qmsg');assert.equal(qq.groupId,'123456');
  const swarm=(await api(subscription.path,{kind:'swarm',pokemon:'Pikachu',region:'Kanto',location:'Route 1'})).data;assert.equal(swarm.queued,1);
  const incoming=(await api('/api/inbox',undefined,auth.cookie)).data.receipts[0];assert.equal(incoming.timing.endAt-incoming.at,15*60000);
  assert.equal((await api('/api/subscriptions',{id:subscription.id,enabled:false},auth.cookie)).data.enabled,false);
  const pheno=(await api(inbox.path,{type:'message',event_type:'pheno',region:'Unova',location:'Route 5',endAt:new Date(Date.now()+600000).toISOString()})).data;assert.equal(pheno.queued,1);const phenoReceipt=(await api('/api/inbox',undefined,auth.cookie)).data.receipts[0];assert.equal(phenoReceipt.kind,'pheno');assert.equal(phenoReceipt.timing.startAt,phenoReceipt.at);assert.equal(phenoReceipt.classification.reason,'源站明确类型字段');
  // Never enable sending or call the test-message API in this smoke check.
  docker(['run','-d','--name',other,'-v',volume+':/data',image]);await pause(2000);
  assert.equal(docker(['inspect','--format','{{.State.Status}}',other]),'exited','same data volume must be locked');
  docker(['rm','-f',other]);
  // Force-stop and recreate: the kernel lock must release without manual cleanup.
  docker(['rm','-f',name]);start();await ready();auth=await api('/api/login',{password:'123456'});
  const state=(await api('/api/state',undefined,auth.cookie)).data;
  assert.ok(state.config.targets.some(t=>t.id===target.id));assert.equal(state.config.enabled,false);
  const restoredInbox=(await api('/api/inbox',undefined,auth.cookie)).data;assert.equal(restoredInbox.path,inbox.path);assert.equal(restoredInbox.receipts.length,3);assert.equal(restoredInbox.subscriptions.find(s=>s.id===subscription.id).enabled,false);assert.equal(state.config.targets.find(t=>t.id===qq.id).type,'qmsg');assert.equal(restoredInbox.receipts.find(r=>r.kind==='alpha').timing.startAt,received.at);
  await api('/api/targets/delete',{id:target.id},auth.cookie);
  console.log('Container verified: startup, public page, backend auth, target API, writable /data, cross-container lock, crash/recreate persistence.');
}catch(e){try{console.error(docker(['logs','--tail','80',name]));}catch{}throw e;}
finally{for(const n of [name,other])try{docker(['rm','-f',n]);}catch{}try{docker(['volume','rm',volume]);}catch{}}
