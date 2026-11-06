import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import { Translator } from '../src/i18n.mjs';

async function application(fn,password='a-long-test-password'){
  const dir=await mkdtemp(join(tmpdir(),'pokemmo-web-'));const store=new Store(dir);const monitor={resolve(){},stopping:false};
  const server=createApp({store,monitor,translator:new Translator({pokemon:{Jynx:'迷唇姐'},location:{'Route 8':'8号道路'}}),password});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await fn(base,store);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}
}
async function login(base){const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:'a-long-test-password'})});assert.equal(r.status,200);return r.headers.getSetCookie()[0].split(';')[0];}
test('未登录不能查看配置和报点；正确密码获得安全会话 cookie',async()=>application(async base=>{
  assert.equal((await fetch(base+'/api/state')).status,401);
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:'a-long-test-password'})});
  assert.equal(r.status,200);assert.match(r.headers.getSetCookie()[0],/HttpOnly/);assert.match(r.headers.getSetCookie()[0],/SameSite=Strict/);
}));
test('首页和访客接口无需登录，后台配置和发送仍需要密码',async()=>application(async(base,store)=>{
  store.state.config.webhookUrl='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=PRIVATE';
  const publicResponse=await fetch(base+'/api/public');assert.equal(publicResponse.status,200);assert.equal((await publicResponse.text()).includes('PRIVATE'),false);
  assert.equal((await fetch(base+'/api/public/catalog')).status,200);
  assert.equal((await fetch(base+'/admin')).status,200);
  for(const path of ['/api/config','/api/test','/api/resolve'])assert.equal((await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'})).status,401);
}));
test('用户指定的初始密码123456可以登录后台',async()=>application(async base=>{
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{"password":"123456"}'});assert.equal(r.status,200);
},'123456'));
test('配置保存后只返回已配置标记，不返回密钥；空密码字段不能覆盖旧地址',async()=>application(async(base,store)=>{
  const cookie=await login(base);const headers={Cookie:cookie,'Content-Type':'application/json',Origin:base};
  const r=await fetch(base+'/api/config',{method:'POST',headers,body:JSON.stringify({webhookUrl:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret-value',enabled:true,alphas:true,swarms:true,pollSeconds:30,minRemainingSeconds:20,regions:[]})});
  assert.equal(r.status,200);const state=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).text();assert.equal(state.includes('secret-value'),false);assert.equal(store.state.config.enabled,true);
  await fetch(base+'/api/config',{method:'POST',headers,body:JSON.stringify({webhookUrl:''})});assert.ok(store.state.config.webhookUrl.includes('secret-value'));
}));
test('拒绝跨站配置修改、非法机器人地址与过快轮询',async()=>application(async(base,store)=>{
  const cookie=await login(base);
  assert.equal((await fetch(base+'/api/config',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://evil.invalid'},body:'{"enabled":true}'})).status,403);
  for(const data of [{webhookUrl:'http://127.0.0.1:1'},{pollSeconds:1}])assert.equal((await fetch(base+'/api/config',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:base},body:JSON.stringify(data)})).status,400);
  assert.equal(store.state.config.enabled,false);
}));
test('登录失败次数过多时限流',async()=>application(async base=>{
  let last;for(let i=0;i<7;i++)last=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{"password":"wrong"}'});
  assert.equal(last.status,429);
}));
test('中文预览不发送到外部群，能返回真实报点格式',async()=>application(async(base,store)=>{
  store.state.records.x={event:{key:'alpha:1',id:1,kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:Date.now(),expiresAt:Date.now()+4500000,url:'https://alpha.pokemmotools.org/alpha-list?pokemon=Jynx',status:'active',verified:true}};
  const cookie=await login(base);const r=await fetch(base+'/api/preview?key=alpha%3A1',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.match((await r.json()).markdown.content,/头目/);
  const state=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.events[0].pokemonZh,'迷唇姐');assert.equal(state.events[0].locationZh,'8号道路');
}));
test('后台推送链接可以增删改启停，接口和公开页面都不泄露密钥',async()=>application(async(base,store)=>{
  assert.equal((await fetch(base+'/api/targets',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const cookie=await login(base),headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};
  const added=await fetch(base+'/api/targets',{method:'POST',headers,body:JSON.stringify({name:'一群',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=target-secret',enabled:true,alphas:true,swarms:false})});assert.equal(added.status,200);const target=await added.json();assert.equal(target.name,'一群');assert.equal(JSON.stringify(target).includes('target-secret'),false);
  const edited=await fetch(base+'/api/targets',{method:'POST',headers,body:JSON.stringify({id:target.id,name:'主群',url:'',enabled:false})});assert.equal(edited.status,200);assert.equal(store.state.config.targets[0].enabled,false);assert.match(store.state.config.targets[0].url,/target-secret/);
  const state=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).text();assert.equal(state.includes('target-secret'),false);
  const pub=await(await fetch(base+'/api/public')).text();assert.equal(pub.includes('主群'),false);
  const removed=await fetch(base+'/api/targets/delete',{method:'POST',headers,body:JSON.stringify({id:target.id})});assert.equal(removed.status,200);assert.equal(store.state.config.targets.length,0);
}));
test('旧配置接口拒绝重复目标时，不能污染配置或导致后续保存失败',async()=>application(async(base,store)=>{
  const cookie=await login(base),headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};const address='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=duplicate-test';
  await fetch(base+'/api/targets',{method:'POST',headers,body:JSON.stringify({name:'已有群',url:address})});
  const response=await fetch(base+'/api/config',{method:'POST',headers,body:JSON.stringify({webhookUrl:address})});assert.equal(response.status,400);assert.equal(store.state.config.targets.length,1);assert.doesNotThrow(()=>store.save());
}));

test('图片开关默认关闭，API严格校验且重启后保留',async()=>application(async(base,store)=>{assert.equal(store.state.config.sendImages,false);const cookie=await login(base);const post=value=>fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,cookie},body:JSON.stringify({sendImages:value})});assert.equal((await post(true)).status,200);assert.equal((await post('true')).status,400);assert.equal(store.state.config.sendImages,true);store.close();const reopened=new Store(store.directory);try{assert.equal(reopened.state.config.sendImages,true);}finally{reopened.close();}}));

test('万圣节模式默认关闭，API拒绝非法值并持久化保存',async()=>application(async(base,store)=>{assert.equal(store.state.config.halloweenMode,false);const cookie=await login(base);const post=value=>fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,cookie},body:JSON.stringify({halloweenMode:value})});assert.equal((await post(true)).status,200);assert.equal((await post('yes')).status,400);assert.equal(store.state.config.halloweenMode,true);store.close();const reopened=new Store(store.directory);try{assert.equal(reopened.state.config.halloweenMode,true);}finally{reopened.close();}}));
