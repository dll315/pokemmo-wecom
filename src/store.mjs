import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { validateWebhook } from './wecom.mjs';
import { configuredTargets, targetView } from './targets.mjs';
import {validateChannelTarget} from './channels.mjs';

export const defaults={enabled:false,webhookUrl:'',targets:[],alphas:true,swarms:true,phenos:true,pollSeconds:30,minRemainingSeconds:20,regions:[]};
function newState(){return{version:1,config:{...defaults,regions:[],targets:[]},records:{},outbox:[],sources:{alpha:{},swarm:{}},logs:[],nextSendAt:0,targetNextAt:{}};}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function validEvent(e){return object(e)&&typeof e.key==='string'&&['alpha','swarm','test'].includes(e.kind)&&typeof e.pokemon==='string'&&typeof e.region==='string'&&typeof e.location==='string'&&Number.isFinite(e.reportedAt)&&Number.isFinite(e.expiresAt)&&typeof e.verified==='boolean'&&['active','expired','removed','ended_early'].includes(e.status);}
function validState(s){
  if(!object(s)||s.version!==1||!object(s.config)||!object(s.records)||!Array.isArray(s.outbox)||!object(s.sources?.alpha)||!object(s.sources?.swarm)||!Array.isArray(s.logs)||!Number.isFinite(s.nextSendAt)||s.nextSendAt<0)return false;
  const c=s.config;if(c.phenos!==undefined&&typeof c.phenos!=='boolean')return false;
  if(s.subscriptions!==undefined){if(!Array.isArray(s.subscriptions)||s.subscriptions.length>20)return false;const ids=new Set(),tokens=new Set();for(const t of s.subscriptions){if(!object(t)||typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name||typeof t.token!=='string'||!/^([a-f0-9]{48})$/.test(t.token)||!['enabled','alphas','swarms'].every(k=>typeof t[k]==='boolean')||ids.has(t.id)||tokens.has(t.token))return false;ids.add(t.id);tokens.add(t.token);}}
  if(!['enabled','alphas','swarms'].every(k=>typeof c[k]==='boolean')||typeof c.webhookUrl!=='string'||!Number.isInteger(c.pollSeconds)||c.pollSeconds<15||c.pollSeconds>3600||!Number.isInteger(c.minRemainingSeconds)||c.minRemainingSeconds<0||c.minRemainingSeconds>300||!Array.isArray(c.regions)||c.regions.some(r=>!['Kanto','Johto','Hoenn','Sinnoh','Unova'].includes(r)))return false;
  try{if(c.webhookUrl)validateWebhook(c.webhookUrl);}catch{return false;}
  if(c.targets!==undefined){if(!Array.isArray(c.targets)||c.targets.length>20)return false;const ids=new Set(),urls=new Set();for(const t of c.targets){if(!object(t)||typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name||!['enabled','alphas','swarms'].every(k=>typeof t[k]==='boolean'))return false;try{validateChannelTarget(t);}catch{return false;}if(ids.has(t.id)||urls.has(t.url+'|'+(t.groupId||'')))return false;ids.add(t.id);urls.add(t.url+'|'+(t.groupId||''));}}
  for(const t of [...(c.targets||[]),...(s.subscriptions||[])])if(t.phenos!==undefined&&typeof t.phenos!=='boolean')return false;
  if(s.targetNextAt!==undefined&&(!object(s.targetNextAt)||Object.values(s.targetNextAt).some(n=>!Number.isFinite(n)||n<0)))return false;
  if(Object.entries(s.records).some(([key,r])=>!object(r)||!validEvent(r.event)||r.event.key!==key||typeof r.fingerprint!=='string'))return false;
  if(s.outbox.some(t=>!object(t)||typeof t.id!=='string'||typeof t.key!=='string'||!validEvent(t.event)||typeof t.fingerprint!=='string'||!['pending','sending','sent','failed','uncertain','skipped','dismissed'].includes(t.status)||!Number.isSafeInteger(t.attempts)||t.attempts<0||!Number.isFinite(t.createdAt)||!Number.isFinite(t.nextAttemptAt)))return false;
  return true;
}
function processStart(pid){try{return fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[19];}catch{return null;}}
function atomicWrite(path,content){
  const tmp=path+'.tmp';const fd=fs.openSync(tmp,'w',0o600);
  try{fs.writeFileSync(fd,content,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,path);
  try{const fd=fs.openSync(resolve(path,'..'),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch{/* Some platforms cannot fsync directories. */}
}
export function redact(text){return String(text).replace(/https:\/\/qmsg\.zendee\.cn[^\s\"'<>]*/gi,'[QQ推送地址]').replace(/([?&]key=)[^\s&"'<>]+/gi,'$1[已隐藏]').replace(/https:\/\/qyapi\.weixin\.qq\.com[^\s"'<>]*/gi,'[企业微信机器人地址]');}
export class Store {
  constructor(directory,{externalLock=false}={}){
    this.directory=resolve(directory);fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    this.lockPath=join(this.directory,'instance.lock');this.owner={pid:process.pid,host:hostname(),start:processStart(process.pid),token:randomUUID()};this.closed=false;this.externalLock=externalLock;
    if(!externalLock)this.acquire();
    try{
      const main=join(this.directory,'state.json'),backup=join(this.directory,'state.backup.json');let recovered=false;
      if(fs.existsSync(main)||fs.existsSync(backup)){
        for(const path of [main,backup]){try{const s=JSON.parse(fs.readFileSync(path,'utf8'));if(validState(s)){this.state=s;recovered=path===backup;break;}}catch{}}
        if(!this.state)throw new Error('状态文件与备份均损坏，已停止；请恢复备份，不要清空去重数据');
      }else this.state=newState();
      this.state.config={...defaults,...this.state.config};this.state.config.targets=configuredTargets(this.state.config).map(t=>({...t}));this.state.targetNextAt||={};
      if(recovered){this.state.config.enabled=false;for(const task of this.state.outbox)if(['pending','sending'].includes(task.status)){task.status='uncertain';task.error='备份恢复可能回滚发送状态，请先在群内确认';}}
      for(const task of this.state.outbox)if(task.status==='sending'){task.status='uncertain';task.error='上次发送过程中程序停止，送达结果待确认';}
      if(recovered)this.log('warn','状态文件损坏，已从备份恢复；请核对最近的发送记录');
      this.save();
    }catch(e){this.close();throw e;}
  }
  acquire(){
    try{fs.writeFileSync(this.lockPath,JSON.stringify(this.owner),{flag:'wx',mode:0o600});return;}catch(e){if(e.code!=='EEXIST')throw e;}
    let owner;try{owner=JSON.parse(fs.readFileSync(this.lockPath,'utf8'));}catch{throw new Error('实例锁损坏，请确认没有其他实例运行后检查 instance.lock');}
    let alive=owner.host!==hostname();
    if(!alive){try{process.kill(owner.pid,0);alive=!owner.start||owner.start===processStart(owner.pid);}catch(e){alive=e.code!=='ESRCH';}}
    if(alive)throw new Error('同一数据目录已有实例运行，不能重复启动');
    fs.unlinkSync(this.lockPath);fs.writeFileSync(this.lockPath,JSON.stringify(this.owner),{flag:'wx',mode:0o600});
  }
  save(){
    if(this.closed)throw new Error('数据存储已关闭');
    if(!validState(this.state))throw new Error('内存状态不完整，拒绝覆盖持久化记录');
    const main=join(this.directory,'state.json'),backup=join(this.directory,'state.backup.json');
    if(fs.existsSync(main)){try{const raw=fs.readFileSync(main,'utf8');if(validState(JSON.parse(raw)))atomicWrite(backup,raw);}catch(e){if(e.code)throw e;}}
    atomicWrite(main,JSON.stringify(this.state,null,2));
  }
  prune(now=Date.now()){
    const cutoff=now-7*86400000;
    this.state.outbox=this.state.outbox.filter(t=>t.createdAt>=cutoff||['pending','sending','failed','uncertain'].includes(t.status));
    const retained=new Set(this.state.outbox.map(t=>t.key));
    for(const [key,record]of Object.entries(this.state.records))if((record.observedAt||record.event.reportedAt)<cutoff&&!retained.has(key))delete this.state.records[key];
  }
  log(level,message){this.state.logs.unshift({at:Date.now(),level,message:redact(message)});this.state.logs=this.state.logs.slice(0,150);}
  publicState(){
    const {webhookUrl,...config}=this.state.config;
    const attention=t=>['failed','uncertain'].includes(t.status);
    const tasks=[...this.state.outbox.filter(attention).reverse(),...this.state.outbox.filter(t=>!attention(t)).reverse()].slice(0,100);
    const events=Object.values(this.state.records).sort((a,b)=>b.event.reportedAt-a.event.reportedAt).map(r=>r.event),alpha=events.find(e=>e.kind==='alpha');
    return{config:{...config,targets:configuredTargets(this.state.config).map(targetView),webhookConfigured:configuredTargets(this.state.config).length>0},sources:this.state.sources,logs:this.state.logs,
      tasks:tasks.map(({event,...task})=>({...task,event})),
      events:[...(alpha?[alpha]:[]),...events.filter(e=>e!==alpha)].slice(0,30),
      counts:{sent:this.state.outbox.filter(t=>t.status==='sent').length,pending:this.state.outbox.filter(t=>t.status==='pending').length,attention:this.state.outbox.filter(t=>['failed','uncertain'].includes(t.status)).length}};
  }
  close(){
    if(this.closed)return;this.closed=true;if(this.externalLock)return;
    try{if(JSON.parse(fs.readFileSync(this.lockPath,'utf8')).token===this.owner.token)fs.unlinkSync(this.lockPath);}catch{}
  }
}
