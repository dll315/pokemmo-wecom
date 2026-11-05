import { resolve } from 'node:path';
import { Store } from './store.mjs';
import { WebsiteSource } from './source.mjs';
import { Translator } from './i18n.mjs';
import { Monitor } from './monitor.mjs';
import { createApp } from './server.mjs';
import { validateWebhook } from './wecom.mjs';
import { readFile } from 'node:fs/promises';
import { buildCatalog } from './public.mjs';
import { setLegacyWebhook } from './targets.mjs';
import { WebhookInbox } from './inbox.mjs';

const password=process.env.ADMIN_PASSWORD||'123456';
if(password.length<6){
  console.error('后台密码必须至少6位。');process.exitCode=1;
}else{
  const dataDir=resolve(process.env.DATA_DIR||'./runtime');const store=new Store(dataDir,{externalLock:process.env.POKEMMO_EXTERNAL_LOCK==='1'});
  try{
    if(process.env.WECOM_WEBHOOK){store.state.config=setLegacyWebhook(store.state.config,process.env.WECOM_WEBHOOK);store.save();}
    const translator=await Translator.load(dataDir),source=new WebsiteSource();
    const natdex=JSON.parse(await readFile(new URL('../data/pokemon-natdex.json',import.meta.url),'utf8'));
    const catalog=buildCatalog(JSON.parse(await readFile(new URL('../data/alpha-catalog.json',import.meta.url),'utf8')),translator,natdex);
    const monitor=new Monitor({store,source,translator,catalog});
    const inbox=new WebhookInbox({store,translator});
    for(const kind of ['alpha','swarm'])store.state.sources[kind]={mode:'webhook',ok:null,error:'',lastSuccessAt:0};store.save();
    const server=createApp({store,monitor,translator,inbox,password,catalog,natdex,publicOrigin:process.env.PUBLIC_ORIGIN||''});
    const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 必须是有效端口');
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,host,done);});
    console.log(`中文报点程序已启动：http://${host==='0.0.0.0'?'服务器IP':host}:${port}`);
    console.log('首页无需登录；后台入口 /admin。保存机器人地址后可开启推送。');
    monitor.start({webhookOnly:true});let shuttingDown=false;
    const shutdown=async()=>{
      if(shuttingDown)return;shuttingDown=true;console.log('正在安全停止监控……');
      const force=setTimeout(()=>process.exit(1),25000);force.unref();
      server.close();
      try{await monitor.stop();store.save();}catch(error){process.exitCode=1;console.error('停止时无法保存进度：',error.message);}finally{store.close();server.closeAllConnections();clearTimeout(force);}
    };
    monitor.onFatal=()=>{process.exitCode=1;void shutdown();};
    process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
    process.on('uncaughtException',error=>{console.error('程序异常，已停止：',error.message);void shutdown().then(()=>{process.exitCode=1;});});
    process.on('unhandledRejection',error=>{console.error('程序异常，已停止：',error?.message||'未知错误');void shutdown().then(()=>{process.exitCode=1;});});
  }catch(e){store.close();throw e;}
}
