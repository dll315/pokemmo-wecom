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
  const home=await fetch(base);assert.ok((await home.text()).includes('当前与最近报点'));
  const pub=(await api('/api/public')).data;assert.ok(pub.summary.catalogSpecies>0);assert.ok(pub.summary.catalogEntries>=pub.summary.catalogSpecies);
  assert.equal((await fetch(base+'/api/state')).status,401);
  let auth=await api('/api/login',{password:'123456'});
  const target=(await api('/api/targets',{name:'容器持久化检查',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=container-smoke-not-a-real-key'},auth.cookie)).data;
  const inbox=(await api('/api/inbox',undefined,auth.cookie)).data;
  assert.match(inbox.path,/^\/receive\/[a-f0-9]{48}$/);
  const accepted=await api(inbox.path,{kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',content:'【容器回调测试】Alpha Jynx'});
  assert.equal(accepted.data.queued,1);
  assert.equal((await api('/api/inbox',undefined,auth.cookie)).data.receipts.length,1);
  // Never enable sending or call the test-message API in this smoke check.
  docker(['run','-d','--name',other,'-v',volume+':/data',image]);await pause(2000);
  assert.equal(docker(['inspect','--format','{{.State.Status}}',other]),'exited','same data volume must be locked');
  docker(['rm','-f',other]);
  // Force-stop and recreate: the kernel lock must release without manual cleanup.
  docker(['rm','-f',name]);start();await ready();auth=await api('/api/login',{password:'123456'});
  const state=(await api('/api/state',undefined,auth.cookie)).data;
  assert.ok(state.config.targets.some(t=>t.id===target.id));assert.equal(state.config.enabled,false);
  const restoredInbox=(await api('/api/inbox',undefined,auth.cookie)).data;assert.equal(restoredInbox.path,inbox.path);assert.equal(restoredInbox.receipts.length,1);
  await api('/api/targets/delete',{id:target.id},auth.cookie);
  console.log('Container verified: startup, public page, backend auth, target API, writable /data, cross-container lock, crash/recreate persistence.');
}catch(e){try{console.error(docker(['logs','--tail','80',name]));}catch{}throw e;}
finally{for(const n of [name,other])try{docker(['rm','-f',n]);}catch{}try{docker(['volume','rm',volume]);}catch{}}
