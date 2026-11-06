import {sendTarget,channelRateKey,checkQmsgReceipt} from './channels.mjs';
import { eventFingerprint, applySwarmStatus, isActive } from './events.mjs';
import { formatNotification, sendWebhook, findAlphaDetails } from './wecom.mjs';
import { configuredTargets } from './targets.mjs';
import { randomUUID } from 'node:crypto';
import { beijingTime } from './i18n.mjs';

export class Monitor {
  constructor({store,source,translator,send=sendTarget,queryReceipt=checkQmsgReceipt,now=()=>Date.now(),onFatal,catalog=[]}){
    Object.assign(this,{store,source,translator,send,queryReceipt,now,onFatal,catalog});this.inFlightTargets=new Set();this.activeScans=new Set();this.stopping=false;this.scanTimers={};this.worker=null;this.receiptQueries=new Set();
  }
  get delivering(){return this.inFlightTargets.size>0;}
  target(id='default'){return configuredTargets(this.store.state.config).find(t=>t.id===id);}
  selected(event,target=this.target()){const c=this.store.state.config;if(event.source==='webhook')return c.enabled&&target?.enabled&&(event.notificationKind==='alpha'?c.alphas&&target.alphas:event.notificationKind==='swarm'?c.swarms&&target.swarms:false)&&(!c.regions.length||c.regions.includes(event.region));if(event.kind==='test')return !!target?.url;return c.enabled&&target?.enabled&&(event.kind==='alpha'?c.alphas&&target.alphas:c.swarms&&target.swarms)&&(!c.regions.length||c.regions.includes(event.region));}
  sent(record,id){return record?.sentTargets?.[id]?.fingerprint||(id==='default'?record?.lastSentFingerprint:null);}
  discarded(record,id){return record?.discardedTargets?.[id]||(id==='default'?record?.lastDiscardedFingerprint:null);}
  readyAt(id){return Math.max(this.store.state.targetNextAt?.[channelRateKey(this.target(id))]||0,this.store.state.targetNextAt?.[id]||(id==='default'?this.store.state.nextSendAt:0));}
  taskId(key,fingerprint,id){return id==='default'?`${key}:${fingerprint}`:`${id}:${key}:${fingerprint}`;}
  async observe(events){
    const now=this.now();const checked=[];let rejected=0;
    for(let e of events){
      if(e.reportedAt>now+120000)throw new Error('网站报点时间超前，请检查服务器时钟');
      if(e.kind==='swarm'&&!e.verified&&e.originalExpiresAt>now){
        try{e=applySwarmStatus(e,await this.source.swarmStatus(e));}
        catch(error){if(error.retryAfterMs)throw error;rejected++;this.store.log('warn',`跳过未核实群怪 ${this.translator.pokemon(e.pokemon)}：${error.message}`);continue;}
      }
      if(e.kind==='swarm'&&!e.verified&&e.originalExpiresAt<=now){
        const previous=this.store.state.records[e.key]?.event;
        if(previous?.verified&&['pokemon','region','location','reportedAt','originalExpiresAt'].every(key=>previous[key]===e[key]))e={...e,verified:true,expiresAt:previous.expiresAt,url:previous.url,status:previous.status==='active'?'expired':previous.status};
      }
      checked.push(e);
    }
    if(this.stopping)return;
    for(const event of checked){
      const state=this.store.state;const existing=state.records[event.key];const fingerprint=eventFingerprint(event);
      state.records[event.key]={...existing,event,fingerprint,observedAt:now};
      const fresh=isActive(event,now)&&event.expiresAt-now>=state.config.minRemainingSeconds*1000;
      for(const target of configuredTargets(state.config)){
      const sent=this.sent(existing,target.id),correction=!!sent&&sent!==fingerprint;
      if(sent===fingerprint)continue;
      const canCorrect=correction&&event.verified&&(fresh||(['removed','ended_early'].includes(event.status)&&now-event.reportedAt<=3*3600000));
      if(!this.selected(event,target)||(!fresh&&!canCorrect)||this.discarded(existing,target.id)===fingerprint)continue;
      const taskId=this.taskId(event.key,fingerprint,target.id);
      const prior=state.outbox.find(t=>t.id===taskId);
      if(prior){if(prior.status==='skipped'){Object.assign(prior,{status:'pending',event,correction,nextAttemptAt:0,error:'此报点仍然有效，已恢复等待发送'});}continue;}
      // A newer revision makes an older, unsent task obsolete.
      for(const t of state.outbox)if(t.key===event.key&&(t.targetId||'default')===target.id&&t.status==='pending'){t.status='skipped';t.error='网站已更新报点，旧版本已跳过';}
      state.outbox.push({id:taskId,key:event.key,targetId:target.id,targetName:target.name,fingerprint,event,correction,status:'pending',createdAt:now,attempts:0,nextAttemptAt:0,error:''});
      this.store.log('info',`${target.name}：${correction?'更正':'报点'}已入队：${this.translator.pokemon(event.pokemon)}`);
      }
    }
    this.store.prune(now);this.store.save();
    return {rejected};
  }
  async deliverOne(preferredId){
    const state=this.store.state,now=this.now();
    if(this.stopping||this.inFlightTargets.size>=4)return;
    const task=state.outbox.find(t=>t.status==='pending'&&t.nextAttemptAt<=now&&!this.inFlightTargets.has(t.targetId||'default')&&this.readyAt(t.targetId||'default')<=now&&(!preferredId||t.id===preferredId)&&(state.config.enabled||t.test));if(!task)return;
    const targetId=task.targetId||'default';
    this.inFlightTargets.add(targetId);
    try{
      if(!this.selected(task.event,this.target(targetId))){task.status='skipped';task.error='推送链接已删除或此类型、地区已关闭';this.store.save();return;}
      if(task.event.kind==='swarm'){
        try{task.event=applySwarmStatus(task.event,await this.source.swarmStatus(task.event));}
        catch(e){task.error=`发送前核对群怪失败：${e.message}`;task.nextAttemptAt=now+Math.max(30000,e.retryAfterMs||0);this.store.log('warn',task.error);this.store.save();return;}
      }
      if(task.status!=='pending')return;
      const latest=state.records[task.key];
      if(!task.test&&!task.incoming&&latest?.fingerprint!==task.fingerprint&&latest?.fingerprint!==eventFingerprint(task.event)){task.status='skipped';task.error='网站报点已更新，旧任务已跳过';this.store.save();return;}
      if(!task.test&&!task.incoming){
        const verifiedFingerprint=eventFingerprint(task.event),verifiedId=this.taskId(task.key,verifiedFingerprint,targetId);
        const collision=state.outbox.find(t=>t!==task&&t.id===verifiedId);
        if(collision){
          task.status='skipped';task.error='该核实版本已有任务；遵守原任务的送达或待确认状态';
          if(collision.status==='skipped'){collision.status='pending';collision.event=task.event;collision.nextAttemptAt=now;collision.error='网站再次提供此有效版本';}
          this.store.save();return;
        }
        task.fingerprint=verifiedFingerprint;task.id=verifiedId;
        const sent=this.sent(latest,targetId);task.correction=!!sent&&sent!==task.fingerprint;
        if(sent===task.fingerprint){task.status='skipped';task.error='此链接已成功发送同一报点版本';this.store.save();return;}
        if(latest){latest.event=task.event;latest.fingerprint=task.fingerprint;}
      }
      const terminalCorrection=task.correction&&['removed','ended_early'].includes(task.event.status);
      if(!terminalCorrection&&(!isActive(task.event,this.now())||task.event.expiresAt-this.now()<state.config.minRemainingSeconds*1000)){
        task.status='skipped';task.error='报点已失效或剩余时间过短';this.store.save();return;
      }
      if(terminalCorrection&&now-task.event.reportedAt>3*3600000){task.status='skipped';task.error='更正记录过旧';this.store.save();return;}
      // Recheck after the awaited source request: the user may have paused.
      const target=this.target(targetId);if(!this.selected(task.event,target)||this.stopping)return;
      const payload=task.incoming?task.payload:task.test?{msgtype:'text',text:{content:`【测试消息】${target.name} · PokeMMO 中文报点连接测试\n发送时间：${beijingTime(this.now())}（北京时间）\n这不是实际头目或群怪报点。`}}:formatNotification(task.event,this.translator,this.now(),task.correction,findAlphaDetails(task.event,this.catalog));
      task.status='sending';task.targetName=target.name;task.attempts++;task.attemptedAt=this.now();state.targetNextAt[targetId]=this.now()+3500;if(targetId==='default')state.nextSendAt=state.targetNextAt[targetId];if(target.type==='qmsg')state.targetNextAt[channelRateKey(target)]=state.targetNextAt[targetId];this.store.save();
      const result=await this.send(target.url,payload,{target});
      if(result.providerId)task.providerId=result.providerId;
      task.error=result.error||'';
      if(result.outcome==='success'){
        task.status='sent';task.sentAt=this.now();
        const record=state.records[task.key];if(record){record.sentTargets||={};record.sentTargets[targetId]={fingerprint:eventFingerprint(task.event),at:task.sentAt};if(targetId==='default'){record.lastSentFingerprint=eventFingerprint(task.event);record.lastSentAt=task.sentAt;}}
        this.store.log('info',`${target.name}：已推送${task.correction?'更正':'报点'} ${this.translator.pokemon(task.event.pokemon)}`);
      }else if(result.outcome==='retry'){
        task.status='pending';task.nextAttemptAt=this.now()+Math.max(60000,result.retryAfter||0);state.targetNextAt[targetId]=Math.max(state.targetNextAt[targetId],task.nextAttemptAt);if(targetId==='default')state.nextSendAt=state.targetNextAt[targetId];
        if(target.type==='qmsg')state.targetNextAt[channelRateKey(target)]=state.targetNextAt[targetId];
        this.store.log('warn',task.error||'机器人暂时拒绝请求，稍后重试');
      }else{
        task.status=result.outcome==='failed'?'failed':'uncertain';this.store.log('error',task.error||'发送结果待确认');
      }
      this.store.save();
    }catch(e){
      if(task.status==='sending'){task.status='uncertain';task.error='发送流程中断，送达结果待确认';}else{task.status='failed';task.error=e.message;}
      this.store.log('error',task.error);this.store.save();
    }finally{this.inFlightTargets.delete(targetId);}
  }
  resolve(id,action){
    if(this.receiptQueries.has(id))throw new Error('正在查询QQ回执，请等待结果后操作');
    const task=this.store.state.outbox.find(t=>t.id===id);
    if(!task||!['failed','uncertain'].includes(task.status)||!['retry','dismiss'].includes(action))throw new Error('该任务不能执行此操作');
    if(action==='retry'){delete task.providerId;task.status='pending';task.nextAttemptAt=this.now();task.error='已由用户确认重试';}
    else{task.status='dismissed';task.error='用户已确认忽略';const record=this.store.state.records[task.key];if(record){record.discardedTargets||={};record.discardedTargets[task.targetId||'default']=task.fingerprint;if(!task.targetId||task.targetId==='default')record.lastDiscardedFingerprint=task.fingerprint;}}
    this.store.save();
  }
  async checkReceipt(id){
    const task=this.store.state.outbox.find(t=>t.id===id),target=this.target(task?.targetId);
    if(!task||task.status!=='uncertain'||!Number.isSafeInteger(task.providerId)||target?.type!=='qmsg')throw Error('该任务没有可查询的QQ回执');
    if(this.receiptQueries.has(id))throw Error('正在查询，请稍后');
    this.receiptQueries.add(id);
    try{const result=await this.queryReceipt(target.url,task.providerId);
      if(task.status!=='uncertain')return{outcome:'unchanged'};
      if(result.outcome==='success'){task.status='sent';task.sentAt=this.now();const record=this.store.state.records[task.key];if(record){record.sentTargets||={};record.sentTargets[target.id]={fingerprint:task.fingerprint,at:task.sentAt};}}
      else if(result.outcome==='failed')task.status='failed';
      task.error=result.error||'';this.store.save();return{outcome:result.outcome,error:task.error};
    }finally{this.receiptQueries.delete(id);}
  }
  async sendTest(targetId){
    const state=this.store.state;
    const target=targetId?this.target(targetId):configuredTargets(state.config)[0];if(!target)throw new Error('请先添加有效的推送链接');
    if(this.inFlightTargets.has(target.id)||this.inFlightTargets.size>=4||this.now()<this.readyAt(target.id))throw new Error('该链接正在发送或限流等待中，请稍后再试');
    const id=`test:${randomUUID()}`,now=this.now();
    const task={id,key:id,targetId:target.id,targetName:target.name,test:true,fingerprint:id,event:{kind:'test',key:id,pokemon:'测试消息',region:'',location:'',reportedAt:now,expiresAt:now+300000,status:'active',verified:true},status:'pending',createdAt:now,attempts:0,nextAttemptAt:0,error:''};
    state.outbox.push(task);this.store.save();await this.deliverOne(id);
    return{outcome:task.status==='sent'?'success':task.status==='uncertain'?'uncertain':task.status==='pending'?'retry':'failed',error:task.error};
  }
  async scan(kind){
    if(this.stopping||this.activeScans.has(kind))return;
    this.activeScans.add(kind);
    const health=this.store.state.sources[kind];health.lastAttemptAt=this.now();
    try{
      const events=await this.source.history(kind,this.now()-24*3600000);
      if(this.stopping)return;
      const result=await this.observe(events);
      Object.assign(health,{ok:!result?.rejected,lastSuccessAt:this.now(),error:result?.rejected?`${result.rejected} 条群怪状态未能核实，已跳过；其他记录正常处理`:'',consecutiveFailures:0,recentCount:events.length});
      this.store.save();this.schedule(kind,this.store.state.config.pollSeconds*1000);
    }catch(e){
      if(this.stopping)return;
      Object.assign(health,{ok:false,error:e.message,consecutiveFailures:(health.consecutiveFailures||0)+1});
      this.store.log('error',`${kind==='alpha'?'头目':'群怪'}数据读取失败：${e.message}`);this.store.save();
      this.schedule(kind,Math.max(e.retryAfterMs||0,Math.min(600000,this.store.state.config.pollSeconds*1000*2**Math.min(health.consecutiveFailures,4))));
    }finally{this.activeScans.delete(kind);}
  }
  schedule(kind,delay){if(this.stopping)return;clearTimeout(this.scanTimers[kind]);this.scanTimers[kind]=setTimeout(()=>void this.scan(kind).catch(e=>this.fatal(e)),delay);}
  fatal(error){this.stopping=true;console.error('持久化或监控流程异常，已停止发送：',error.message);this.onFatal?.(error);}
  start({webhookOnly=false}={}){if(!webhookOnly){this.schedule('alpha',0);this.schedule('swarm',1500);}this.worker=setInterval(()=>{for(let i=0;i<4;i++)void this.deliverOne().catch(e=>this.fatal(e));},1000);}
  async stop(){this.stopping=true;for(const t of Object.values(this.scanTimers))clearTimeout(t);clearInterval(this.worker);this.source.close?.();while(this.delivering||this.activeScans.size)await new Promise(r=>setTimeout(r,50));}
}
