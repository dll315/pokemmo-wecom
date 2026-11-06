export function parseReportTime(value){
 if(value===undefined||value===null||value==='')return{at:null,text:'源站未提供'};
 const raw=String(value).trim().replace(/\*\*/g,'');
 const discord=/^<t:(\d{10})(?::[tTdDfFR])?>$/.exec(raw);
 let at;
 if(discord||/^\d{10}(?:\.\d{1,3})?$/.test(raw))at=Number(discord?.[1]||raw)*1000;
 else if(/^\d{13}$/.test(raw))at=Number(raw);
 else{
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i.exec(raw);
  if(!m)return{at:null,text:raw.slice(0,100)+( /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)?'（时间格式待核实）':'（来源未注明时区）')};
  const day=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  if(day.getUTCFullYear()!==+m[1]||day.getUTCMonth()!==+m[2]-1||day.getUTCDate()!==+m[3]||+m[4]>23||+m[5]>59||+(m[6]||0)>59)return{at:null,text:raw+'（日期无效）'};
  at=Date.parse(raw);
 }
 if(!Number.isFinite(at)||at<Date.UTC(2000,0,1)||at>Date.UTC(2100,0,1))return{at:null,text:raw.slice(0,100)+'（时间格式待核实）'};
 return{at,text:new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）'};
}
export function reportTiming(pick,{linkEnd=''}={}){
 const start=pick('startAt','start_at','startedAt','spawnedAt','spawned_at','startTime','start_time','Start Time','Spawn Time','开始时间','起始时间','刷新时间');
 const reported=pick('reportedAt','reported_at','Report Time','报点时间');
 const end=pick('endAt','end_at','endTime','end_time','End Time','expiresAt','expires_at','despawnAt','despawn_time','despawn_timestamp','effective_despawn_timestamp','Despawn Time','结束时间','消失时间','预计结束时间');
 const s=parseReportTime(start||reported),e=parseReportTime(end||linkEnd);
 return{startAt:s.at,endAt:e.at,startText:s.text,endText:e.text,startSource:start?'源站开始时间':reported?'源站报点时间（实际刷新可能更早）':'源站未提供',endSource:end?'源站结束时间':linkEnd?'源站链接的预计结束时间':'源站未提供',invalidOrder:s.at!==null&&e.at!==null&&e.at<s.at};
}
export function receiptPolicy(kind,receivedAt,sourceTiming){
 const durationMinutes=kind==='alpha'?75:kind==='swarm'?15:null;
 if(kind==='pheno')return{startAt:receivedAt,startText:parseReportTime(receivedAt).text,startSource:'本站收到推送的时间',endAt:sourceTiming?.endAt??null,endText:sourceTiming?.endAt?sourceTiming.endText:'来源未给出结束时间',endSource:'奇遇使用来源明确的结束时间',basis:'pheno-source',invalidOrder:Number.isFinite(sourceTiming?.endAt)&&sourceTiming.endAt<receivedAt};
 if(durationMinutes===null)return{startAt:receivedAt,startText:parseReportTime(receivedAt).text,startSource:'本站收到推送的时间',endAt:null,endText:'类型待识别，暂不能计算',endSource:'等待识别头目或群集类型',basis:'receipt-policy',invalidOrder:false};
 const endAt=receivedAt+durationMinutes*60000;
 return{startAt:receivedAt,endAt,startText:parseReportTime(receivedAt).text,endText:parseReportTime(endAt).text,startSource:'本站收到推送的时间',endSource:`按${kind==='alpha'?'头目':'群集'}固定持续${durationMinutes}分钟计算`,basis:'receipt-policy',durationMinutes,invalidOrder:false};
}
