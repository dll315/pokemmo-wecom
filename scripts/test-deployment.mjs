// Runs on a disposable Linux CI runner. All Docker resources use unique test names.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const suffix=Date.now().toString(36),name='pokemmo-deploy-test-'+suffix,volume=name+'-data',port='18788',base='http://127.0.0.1:'+port;
const env={...process.env,CONTAINER_NAME:name,DATA_VOLUME:volume,PORT:port,BIND_IP:'127.0.0.1',POKEMMO_IMAGE:'pokemmo-wecom:latest'};
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:90000}).trim();
async function wait(){for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz',{headers:{Connection:'close'}})).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('旧服务恢复超时');}
function shell(file,extra={}){return execFileSync('sh',[file,...(file==='update-source.sh'?['--local']:[])],{env:{...env,...extra},encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});}
async function api(path,body,cookie){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Connection:'close',...(body===undefined?{}:{'Content-Type':'application/json',Origin:base}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,200,path);return{data:await r.json(),cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};}
const badImage=name+'-bad',dir=mkdtempSync(join(tmpdir(),'pokemmo-bad-image-'));
try{
 console.log(shell('deploy.sh',{POKEMMO_IMAGE:''}));
 let auth=await api('/api/login',{password:'123456'});const before=(await api('/api/inbox',undefined,auth.cookie)).data.path;
 const target=(await api('/api/targets',{name:'保留配置测试',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=deployment-test-not-real'},auth.cookie)).data;
 console.log(shell('update-source.sh'));
 auth=await api('/api/login',{password:'123456'});assert.equal((await api('/api/inbox',undefined,auth.cookie)).data.path,before);assert.ok((await api('/api/state',undefined,auth.cookie)).data.config.targets.some(t=>t.id===target.id));
 assert.throws(()=>shell('deploy.sh'),/Command failed/,'重复部署不能覆盖现有容器');
 assert.throws(()=>shell('update-source.sh',{POKEMMO_IMAGE:'pokemmo-image-that-does-not-exist:'+suffix}));assert.equal((await fetch(base+'/healthz',{headers:{Connection:'close'}})).status,200,'预检查失败不能停止旧服务');
 docker(['exec',name,'node','-e',"require('fs').writeFileSync('/data/rollback-probe','test')"]);
 writeFileSync(join(dir,'Dockerfile'),"FROM pokemmo-wecom:latest\nUSER root\nRUN sed -i '1i import fsRollback from \"node:fs\"; if(fsRollback.existsSync(\"/data/rollback-probe\"))process.exit(42);' /app/src/main.mjs\nUSER node\n");
 docker(['build','-t',badImage,dir]);assert.throws(()=>shell('update-source.sh',{POKEMMO_IMAGE:badImage}));
 await wait();auth=await api('/api/login',{password:'123456'});assert.equal((await api('/api/inbox',undefined,auth.cookie)).data.path,before);assert.equal(docker(['inspect','--format','{{.Config.Image}}',name]),env.POKEMMO_IMAGE,'新容器失败必须恢复旧容器');
 console.log('Deployment verified: default123456, install, update, preserved data/path/targets, duplicate refusal, failed-preflight availability, failed-upgrade automatic rollback.');
}finally{try{docker(['rm','-f',name]);}catch{}try{docker(['volume','rm',volume]);}catch{}try{docker(['image','rm',badImage]);}catch{}rmSync(dir,{recursive:true,force:true});}
