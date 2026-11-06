import {receiptPolicy} from './report-time.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {configuredTargets} from './targets.mjs';
import {formatIncoming} from './incoming-format.mjs';
import {subscriptionView,saveSubscription} from './subscriptions.mjs';
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
export class WebhookInbox{
 constructor({store,translator,now=()=>Date.now()}){Object.assign(this,{store,translator,now});const s=store.state;s.sources.pheno||={mode:'webhook'};for(const t of s.subscriptions||[])t.phenos??=true;for(const t of s.config.targets||[])t.phenos??=true;s.receiveToken||=randomBytes(24).toString('hex');s.receipts||=[];for(const task of s.outbox)if(task.status==='pending'&&!task.incoming&&!task.test){task.status='skipped';task.error='已切换官网回调模式，旧轮询任务已停用';}
 for(const r of s.receipts)if(r.formatVersion!==9&&r.raw){try{const m=formatIncoming(r.raw,translator,{receivedAt:r.at});const oldMap=r.preview?.match(/\[查看位置地图\]\((https?:\/\/[^)]+)\)/)?.[1];if(oldMap&&m.details?.mapSourceUrl)m.payload.markdown.content=m.payload.markdown.content.replace(m.details.mapSourceUrl,oldMap);Object.assign(r,{classification:m.classification,parseError:m.kind==='unknown'?m.classification.reason:'',profile:m.profile,swarmInfo:m.swarmInfo,title:m.title,timing:m.timing,reportedStatus:m.reportedStatus,kind:m.kind,pokemon:m.pokemon,region:m.region,location:m.location,details:m.details,preview:m.payload.markdown.content,formatVersion:9});for(const t of s.outbox)if(t.incoming&&t.status==='pending'&&t.key==='incoming:'+r.key){t.payload=m.payload;Object.assign(t.event,{notificationKind:m.kind,pokemon:m.pokemon,region:m.region,location:m.location});if(m.kind==='unknown'){t.status='skipped';t.error='类型未识别，保留原始消息，停止转发';}t.event.expiresAt=m.timing?.endAt||r.at+15*60000;}}catch(error){r.kind='unknown';r.timing=receiptPolicy('unknown',r.at);r.title=(this.translator.region(r.region)||'地区待确认')+' 类型待识别 '+(this.translator.pokemon(r.pokemon)||'名称待确认');r.parseError='旧消息解析失败：'+error.message;r.classification={kind:'unknown',reason:r.parseError,evidence:[]};r.preview=r.title+'\n开始时间：'+r.timing.startText+'\n'+r.parseError;r.formatVersion=9;for(const t of s.outbox)if(t.incoming&&t.status==='pending'&&t.key==='incoming:'+r.key){t.status='skipped';t.error=r.parseError;}}}
 if(!Array.isArray(s.subscriptions))s.subscriptions=[{id:'default',token:s.receiveToken,name:'默认订阅',enabled:true,alphas:true,swarms:true,phenos:true,createdAt:now()}];
 store.save();}
 get path(){const s=this.store.state.subscriptions.find(s=>s.enabled);return s?'/receive/'+s.token:null;}
 match(path){return this.store.state.subscriptions.find(s=>path==='/receive/'+s.token);}
 saveSubscription(input){const list=this.store.state.subscriptions,s=saveSubscription(list,input,this.now()),index=list.findIndex(t=>t.id===s.id);if(index<0)list.push(s);else list[index]=s;this.store.save();return subscriptionView(s);}
 deleteSubscription(id){const list=this.store.state.subscriptions,index=list.findIndex(s=>s.id===id);if(index<0)throw Error('订阅地址不存在');list.splice(index,1);this.store.save();}
 receive(body,{origin='',subscriptionId}={}){
  const s=this.store.state,now=this.now(),key=createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
  const subscription=subscriptionId?s.subscriptions.find(t=>t.id===subscriptionId):s.subscriptions[0];
  if(!subscription)throw Object.assign(Error('订阅地址不存在'),{status:404});
  if(!subscription.enabled)throw Object.assign(Error('订阅地址已停用'),{status:403});
  let msg;try{msg=formatIncoming(body,this.translator,{receivedAt:now});}catch(error){if(!body||!Object.keys(body).length)throw error;msg=formatIncoming({content:'未识别结构，原始数据已保留在后台'},this.translator,{receivedAt:now});msg.classification={kind:'unknown',label:'报点',reason:'解析失败：'+error.message,evidence:[]};}
  subscription.lastReceivedAt=now;subscription.receivedCount=(subscription.receivedCount||0)+1;
  if(msg.kind==='alpha'&&!subscription.alphas||msg.kind==='swarm'&&!subscription.swarms||msg.kind==='pheno'&&subscription.phenos===false||msg.kind==='unknown'&&!subscription.alphas&&!subscription.swarms){this.store.save();return{ok:true,filtered:true};}
  if(s.receipts.some(r=>r.key===key&&now-r.at<86400000)){this.store.save();return{ok:true,duplicate:true};}
  if(msg.details?.mapPath&&origin){try{const u=new URL(origin);if(['http:','https:'].includes(u.protocol))msg.payload.markdown.content=msg.payload.markdown.content.replace(msg.details.mapSourceUrl,u.origin+msg.details.mapPath);}catch{}}
  if(s.outbox.filter(t=>t.status==='pending').length>1000)throw new Error('等待发送的消息过多，请先处理队列');
  const receipt={key,at:now,parseError:msg.kind==='unknown'?'类型未识别，未转发；原始数据已保留':'',subscriptionId:subscription.id,subscriptionName:subscription.name,kind:msg.kind,pokemon:msg.pokemon,region:msg.region,location:msg.location,classification:msg.classification,profile:msg.profile,swarmInfo:msg.swarmInfo,title:msg.title,timing:msg.timing,reportedStatus:msg.reportedStatus,formatVersion:9,details:msg.details||null,preview:msg.payload.markdown.content,raw:body,queued:0};
  // Forwarding stops at the end of the configured receipt-based duration.
  const event={key:'incoming:'+key,kind:'test',source:'webhook',notificationKind:msg.kind,pokemon:msg.pokemon||'官网通知',region:msg.region,location:msg.location,reportedAt:now,expiresAt:msg.timing?.endAt||now+15*60000,verified:true,status:'active'};
  for(const t of configuredTargets(s.config)){
   if(msg.kind==='unknown')continue;
   if(!t.enabled||(msg.kind==='alpha'&&(!s.config.alphas||!t.alphas))||(msg.kind==='swarm'&&(!s.config.swarms||!t.swarms))||(msg.kind==='pheno'&&(s.config.phenos===false||t.phenos===false))||(s.config.regions.length&&!s.config.regions.includes(msg.region)))continue;
   s.outbox.push({id:`incoming:${key}:${t.id}`,key:event.key,targetId:t.id,targetName:t.name,incoming:true,payload:msg.payload,event,fingerprint:key,status:'pending',createdAt:now,nextAttemptAt:0,attempts:0,error:''});receipt.queued++;
  }
  s.receipts.unshift(receipt);s.receipts=s.receipts.filter(r=>now-r.at<86400000).slice(0,500);
  for(const kind of (msg.kind==='unknown'?[]:[msg.kind]))Object.assign(s.sources[kind],{ok:true,lastSuccessAt:now,error:'',mode:'webhook'});
  this.store.prune(now);this.store.log('info',`已接收官网通知：${this.translator.pokemon(msg.pokemon)||'原文通知'}，${receipt.queued}个推送目标`);this.store.save();
  return{ok:true,queued:receipt.queued};
 }
 view(){return{mode:'webhook',path:this.path,subscriptions:this.store.state.subscriptions.map(subscriptionView),receipts:this.store.state.receipts.slice(0,30)};}
}
