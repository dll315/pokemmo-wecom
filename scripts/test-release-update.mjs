// Actual Docker + local HTTP release fixture: validates standalone update without Git/source.
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const suffix=Date.now().toString(36),name='pokemmo-release-test-'+suffix,volume=name+'-data',base='http://127.0.0.1:18790',mirror='http://127.0.0.1:18791';
const dir=mkdtempSync(join(tmpdir(),'pokemmo-release-')),client=mkdtempSync(join(tmpdir(),'pokemmo-client-'));
const publicMode=process.argv.includes('--public');
const imageFile='pokemmo-wecom-linux-amd64.tar.gz';const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:90000}).trim();
let server;
async function api(path,body,cookie){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Connection:'close',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,200,path);return{data:await r.json(),cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};}
async function ready(url){for(let i=0;i<80;i++){try{if((await fetch(url,{headers:{Connection:'close'}})).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('服务启动超时');}
function checksum(){writeFileSync(join(dir,'SHA256SUMS'),[imageFile,'manage-docker.sh'].map(f=>createHash('sha256').update(readFileSync(join(dir,f))).digest('hex')+'  '+f).join('\n')+'\n');}
function update(){return execFileSync('sh',[join(client,'update.sh')],{cwd:client,env:{...process.env,CONTAINER_NAME:name,...(publicMode?{}:{POKEMMO_RELEASE_BASE_URL:mirror})},encoding:'utf8',timeout:240000});}
try{
 writeFileSync(join(client,'update.sh'),readFileSync('update.sh'));
 if(!publicMode){execFileSync('docker',['save','-o',join(dir,imageFile),'pokemmo-wecom:latest'],{timeout:90000});writeFileSync(join(dir,'manage-docker.sh'),readFileSync('scripts/manage-docker.sh'));checksum();server=spawn(process.execPath,['--input-type=module','-e',"import http from 'node:http';import fs from 'node:fs';import path from 'node:path';http.createServer((req,res)=>{const f=path.join(process.argv[1],path.basename(req.url));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}fs.createReadStream(f).pipe(res);}).listen(18791,'127.0.0.1');",dir],{stdio:'ignore'});await ready(mirror+'/SHA256SUMS');}
 docker(['run','-d','--name',name,'--restart','unless-stopped','-p','127.0.0.1:18790:8787','-v',volume+':/data','pokemmo-wecom:latest']);await ready(base+'/healthz');
 let auth=await api('/api/login',{password:'123456'});const path=(await api('/api/inbox',undefined,auth.cookie)).data.path;
 const target=(await api('/api/targets',{name:'镜像更新测试',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mirror-test-not-real'},auth.cookie)).data;
 console.log(update());auth=await api('/api/login',{password:'123456'});assert.equal((await api('/api/inbox',undefined,auth.cookie)).data.path,path);assert.ok((await api('/api/state',undefined,auth.cookie)).data.config.targets.some(t=>t.id===target.id));
 if(!publicMode){const started=docker(['inspect','--format','{{.State.StartedAt}}',name]);writeFileSync(join(dir,'SHA256SUMS'),'0'.repeat(64)+'  '+imageFile+'\n'+'0'.repeat(64)+'  manage-docker.sh\n');assert.throws(()=>update());assert.equal(docker(['inspect','--format','{{.State.StartedAt}}',name]),started);assert.equal((await api('/api/login',{password:'123456'})).data.ok,true);}
 console.log('Standalone release updater verified: docker run install, no Git or source checkout, checksum, downloaded manager, retained port/data/path/targets/default123456, checksum failure leaves running service untouched.');
}finally{server?.kill();try{docker(['rm','-f',name]);}catch{}try{docker(['volume','rm',volume]);}catch{}rmSync(dir,{recursive:true,force:true});rmSync(client,{recursive:true,force:true});}
