import {randomBytes,createHash} from 'node:crypto';
import {configuredTargets} from './targets.mjs';
import {formatIncoming} from './incoming-format.mjs';
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
export class WebhookInbox{
 constructor({store,translator,now=()=>Date.now()}){Object.assign(this,{store,translator,now});const s=store.state;s.receiveToken||=randomBytes(24).toString('hex');s.receipts||=[];for(const task of s.outbox)if(task.status==='pending'&&!task.incoming&&!task.test){task.status='skipped';task.error='已切换官网回调模式，旧轮询任务已停用';}
 for(const r of s.receipts)if(r.formatVersion!==2&&r.raw){try{const m=formatIncoming(r.raw,translator,{receivedAt:r.at});const oldMap=r.preview?.match(/\[查看位置地图\]\((https?:\/\/[^)]+)\)/)?.[1];if(oldMap&&m.details?.mapSourceUrl)m.payload.markdown.content=m.payload.markdown.content.replace(m.details.mapSourceUrl,oldMap);Object.assign(r,{title:m.title,timing:m.timing,reportedStatus:m.reportedStatus,kind:m.kind,pokemon:m.pokemon,region:m.region,location:m.location,details:m.details,preview:m.payload.markdown.content,formatVersion:2});for(const t of s.outbox)if(t.incoming&&t.status==='pending'&&t.key==='incoming:'+r.key)t.payload=m.payload;}catch{r.formatVersion=2;}}
 store.save();}
 get path(){return '/receive/'+this.store.state.receiveToken;}
 receive(body,{origin=''}={}){
  const s=this.store.state,now=this.now(),key=createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
  if(s.receipts.some(r=>r.key===key&&now-r.at<86400000))return{ok:true,duplicate:true};
  let msg;try{msg=formatIncoming(body,this.translator,{receivedAt:now});}catch(error){if(!body||!Object.keys(body).length)throw error;msg=formatIncoming({content:'未识别结构，保留源站消息：\n'+JSON.stringify(body)},this.translator,{receivedAt:now});}
  if(msg.details?.mapPath&&origin){try{const u=new URL(origin);if(['http:','https:'].includes(u.protocol))msg.payload.markdown.content=msg.payload.markdown.content.replace(msg.details.mapSourceUrl,u.origin+msg.details.mapPath);}catch{}}
  if(s.outbox.filter(t=>t.status==='pending').length>1000)throw new Error('等待发送的消息过多，请先处理队列');
  const receipt={key,at:now,kind:msg.kind,pokemon:msg.pokemon,region:msg.region,location:msg.location,title:msg.title,timing:msg.timing,reportedStatus:msg.reportedStatus,formatVersion:2,details:msg.details||null,preview:msg.payload.markdown.content,raw:body,queued:0};
  // No guessed spawn duration: this expiry is solely a local forwarding deadline.
  const event={key:'incoming:'+key,kind:'test',source:'webhook',notificationKind:msg.kind,pokemon:msg.pokemon||'官网通知',region:msg.region,location:msg.location,reportedAt:now,expiresAt:now+15*60000,verified:true,status:'active'};
  for(const t of configuredTargets(s.config)){
   if(msg.kind==='unknown'&&!(s.config.alphas&&t.alphas||s.config.swarms&&t.swarms))continue;
   if(!t.enabled||(msg.kind==='alpha'&&(!s.config.alphas||!t.alphas))||(msg.kind==='swarm'&&(!s.config.swarms||!t.swarms))||(s.config.regions.length&&!s.config.regions.includes(msg.region)))continue;
   s.outbox.push({id:`incoming:${key}:${t.id}`,key:event.key,targetId:t.id,targetName:t.name,incoming:true,payload:msg.payload,event,fingerprint:key,status:'pending',createdAt:now,nextAttemptAt:0,attempts:0,error:''});receipt.queued++;
  }
  s.receipts.unshift(receipt);s.receipts=s.receipts.filter(r=>now-r.at<86400000).slice(0,500);
  for(const kind of (msg.kind==='unknown'?[]:[msg.kind]))Object.assign(s.sources[kind],{ok:true,lastSuccessAt:now,error:'',mode:'webhook'});
  this.store.prune(now);this.store.log('info',`已接收官网通知：${this.translator.pokemon(msg.pokemon)||'原文通知'}，${receipt.queued}个推送目标`);this.store.save();
  return{ok:true,queued:receipt.queued};
 }
 view(){return{mode:'webhook',path:this.path,receipts:this.store.state.receipts.slice(0,30)};}
}
