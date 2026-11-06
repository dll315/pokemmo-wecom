import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { validateWebhook, formatNotification, findAlphaDetails } from './wecom.mjs';
import { createPublicView } from './public.mjs';
import { configuredTargets, upsertTarget, deleteTarget, targetView, setLegacyWebhook } from './targets.mjs';
import {mapAsset} from './maps.mjs';

function hash(value){return createHash('sha256').update(String(value)).digest();}
async function readJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Object.assign(new Error('请使用 JSON 请求'),{status:415});
  let bytes=0;const parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw Object.assign(new Error('请求内容过大'),{status:413});parts.push(chunk);}
  try{const d=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error();return d;}catch{throw Object.assign(new Error('请求格式无效'),{status:400});}
}
function configuration(previous,body){
  let next={...previous};
  for(const key of ['enabled','alphas','swarms','phenos','sendImages','halloweenMode'])if(key in body){if(typeof body[key]!=='boolean')throw new Error('推送开关必须为布尔值');next[key]=body[key];}
  if('webhookUrl'in body){if(typeof body.webhookUrl!=='string')throw new Error('机器人地址无效');if(body.webhookUrl.trim())next=setLegacyWebhook(next,body.webhookUrl.trim());}
  if(body.clearWebhook===true){const legacyUrl=next.webhookUrl;next.webhookUrl='';next.targets=(next.targets||[]).filter(t=>t.id!=='default'&&t.url!==legacyUrl);next.enabled=false;}
  for(const [key,min,max]of [['pollSeconds',15,3600],['minRemainingSeconds',0,300]])if(key in body){if(!Number.isInteger(body[key])||body[key]<min||body[key]>max)throw new Error(key==='pollSeconds'?'检查间隔须为15至3600秒':'最低剩余时间须为0至300秒');next[key]=body[key];}
  if('regions'in body){if(!Array.isArray(body.regions)||body.regions.some(r=>!['Kanto','Johto','Hoenn','Sinnoh','Unova'].includes(r)))throw new Error('地区选项无效');next.regions=[...new Set(body.regions)];}
  if(next.enabled&&!configuredTargets(next).length)throw new Error('请先添加推送链接，再开启推送');
  return next;
}
export function createApp({store,monitor,translator,inbox,password='123456',publicOrigin='',catalog=[],natdex={}}){
  if(typeof password!=='string'||password.length<6)throw new Error('后台密码必须至少6位');
  const expectedPassword=hash(password),sessions=new Map(),failures=new Map();
  function authenticated(req){const token=/(?:^|;\s*)pokemmo_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];return token&&sessions.has(token)&&sessions.get(token)>Date.now();}
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    function json(status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
    try{
      const url=new URL(req.url,'http://local');
      const subscription=inbox?.match(url.pathname);
      if(req.method==='POST'&&subscription){const result=inbox.receive(await readJson(req),{subscriptionId:subscription.id,origin:publicOrigin||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`});json(200,result);return;}
      if(req.method==='GET'&&/^\/sprites\/[1-9]\d{0,3}\.png$/.test(url.pathname)){try{const bytes=await readFile(new URL('../web'+url.pathname,import.meta.url));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'});res.end(bytes);}catch{json(404,{error:'精灵图片不存在'});}return;}
      if(req.method==='GET'&&url.pathname.startsWith('/maps/')){const asset=mapAsset(url.pathname);if(!asset){json(404,{error:'位置图片不存在'});return;}const bytes=await readFile(new URL('../web'+asset.path,import.meta.url));res.writeHead(200,{'Content-Type':asset.mime,'Cache-Control':'public, max-age=86400'});res.end(bytes);return;}
      if(req.method==='GET'&&url.pathname==='/healthz'){json(monitor.stopping?503:200,{status:monitor.stopping?'stopped':'running'});return;}
      const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/admin':['admin.html','text/html; charset=utf-8'],'/admin/':['admin.html','text/html; charset=utf-8'],'/public.js':['public.js','text/javascript; charset=utf-8'],'/public.css':['public.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/admin.css':['admin.css','text/css; charset=utf-8']};
      staticFiles['/reports.js']=['reports.js','text/javascript; charset=utf-8'];
      if(req.method==='GET'&&staticFiles[url.pathname]){const[file,type]=staticFiles[url.pathname];res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL(`../web/${file}`,import.meta.url)));return;}
      if(!url.pathname.startsWith('/api/')){json(404,{error:'页面不存在'});return;}
      if(req.method==='GET'&&url.pathname==='/api/public'){json(200,createPublicView(store.state,translator,catalog,natdex));return;}
      if(req.method==='GET'&&url.pathname==='/api/public/catalog'){json(200,{entries:catalog});return;}
      if(req.method==='POST'){
        const origin=publicOrigin||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;
        if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){json(403,{error:'不允许跨站操作'});return;}
      }
      if(req.method==='POST'&&url.pathname==='/api/login'){
        const ip=req.socket.remoteAddress,failed=failures.get(ip);
        if(failed?.blockedUntil>Date.now()){json(429,{error:'密码错误次数过多，请10分钟后重试'});return;}
        const body=await readJson(req);
        if(typeof body.password!=='string'||body.password.length>1024||!timingSafeEqual(hash(body.password),expectedPassword)){
          const n=(failed?.at>Date.now()-600000?failed.count:0)+1;failures.set(ip,{count:n,at:Date.now(),blockedUntil:n>=5?Date.now()+600000:0});json(401,{error:'管理密码不正确'});return;
        }
        failures.delete(ip);for(const [key,expiry]of sessions)if(expiry<=Date.now())sessions.delete(key);
        if(sessions.size>100)sessions.delete(sessions.keys().next().value);
        const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+12*3600000);
        res.setHeader('Set-Cookie',`pokemmo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${publicOrigin.startsWith('https:')?'; Secure':''}`);json(200,{ok:true});return;
      }
      if(!authenticated(req)){json(401,{error:'请先登录管理页面'});return;}
      if(req.method==='GET'&&url.pathname==='/api/inbox'&&inbox){json(200,inbox.view());return;}
      if(req.method==='POST'&&url.pathname==='/api/subscriptions'&&inbox){json(200,inbox.saveSubscription(await readJson(req)));return;}
      if(req.method==='POST'&&url.pathname==='/api/subscriptions/delete'&&inbox){inbox.deleteSubscription((await readJson(req)).id);json(200,{ok:true});return;}
      if(req.method==='POST'&&url.pathname==='/api/receipt'){const result=await monitor.checkReceipt((await readJson(req)).id);json(200,result);return;}
      if(req.method==='GET'&&url.pathname==='/api/state'){
        const view=store.publicState(),translate=e=>({...e,pokemonZh:translator.pokemon(e.pokemon),locationZh:translator.location(e.location)});
        view.events=view.events.map(translate);view.tasks=view.tasks.map(t=>({...t,event:translate(t.event)}));
        json(200,{...view,stopped:monitor.stopping,inbox:inbox?.view()});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/logout'){
        const token=/(?:^|;\s*)pokemmo_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];sessions.delete(token);res.setHeader('Set-Cookie','pokemmo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/config'){
        const next=configuration(store.state.config,await readJson(req));store.state.config=next;store.log('info',`配置已保存，推送${next.enabled?'已开启':'已暂停'}`);store.save();json(200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/targets'){
        const body=await readJson(req),index=body.id?configuredTargets(store.state.config).findIndex(t=>t.id===body.id):-1,config=upsertTarget(store.state.config,body);store.state.config=config;const target=index>=0?config.targets[index]:config.targets.at(-1);store.log('info',`推送链接已保存：${target.name}`);store.save();json(200,targetView(target));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/targets/delete'){
        const body=await readJson(req);store.state.config=deleteTarget(store.state.config,body.id);
        for(const task of store.state.outbox)if((task.targetId||'default')===body.id&&task.status==='pending'){task.status='skipped';task.error='推送链接已删除';}
        store.log('info','推送链接已删除');store.save();json(200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/targets/test'){
        const body=await readJson(req);if(!configuredTargets(store.state.config).some(t=>t.id===body.id))throw new Error('推送链接不存在');
        const result=await monitor.sendTest(body.id);json(result.outcome==='success'?200:400,{...result,error:result.error||'没有明确成功结果，请查看发送记录'});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/preview'){
        const event=Object.values(store.state.records).find(r=>r.event.key===url.searchParams.get('key'))?.event;
        if(!event){json(404,{error:'尚无此条报点'});return;}json(200,formatNotification(event,translator,Date.now(),false,findAlphaDetails(event,catalog)));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/resolve'){
        const body=await readJson(req);monitor.resolve(body.id,body.action);json(200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/test'){
        await readJson(req);const result=await monitor.sendTest();json(result.outcome==='success'?200:400,{...result,error:result.error||'机器人没有返回成功结果，请查看发送记录'});return;
      }
      json(404,{error:'接口不存在'});
    }catch(e){json(e.status||400,{error:e.message});}
  });
}
