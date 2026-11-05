import { createHash } from 'node:crypto';

export const SITE = 'https://alpha.pokemmotools.org';
export function parseUtc(value) {
  if(typeof value!=='string') throw new Error('报点时间缺失');
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z?$/.exec(value);
  if(!m || +m[1]<2000) throw new Error('报点时间格式变化');
  const ms=Date.parse(value.endsWith('Z')?value:value+'Z');
  const d=new Date(ms);
  if(!Number.isFinite(ms)||d.getUTCFullYear()!==+m[1]||d.getUTCMonth()+1!==+m[2]||d.getUTCDate()!==+m[3]||d.getUTCHours()!==+m[4]||d.getUTCMinutes()!==+m[5]||d.getUTCSeconds()!==+m[6]) throw new Error('报点时间无效');
  return ms;
}
function field(value,label){
  if(typeof value!=='string'||!value.trim()||value.length>256||/[\x00-\x1f\x7f]/.test(value))throw new Error(`${label}缺失或无效`);
  return value.trim();
}
export function parseHistoryRow(kind,row,origin=SITE){
  if(!['alpha','swarm'].includes(kind)||!row||!Number.isSafeInteger(row.id)||row.id<1)throw new Error('报点编号或类型无效');
  const pokemon=field(row.pokemon,'宝可梦'),region=field(row.region,'地区'),location=field(row.location,'地点');
  const reportedAt=parseUtc(row.timestampIso);
  if(typeof row.alphaUrl!=='string'||row.alphaUrl.length>1200)throw new Error('报点链接无效');
  const url=new URL(row.alphaUrl,origin);
  if(url.origin!==new URL(origin).origin||url.pathname!==(kind==='alpha'?'/alpha-list':'/swarm-list')||url.username||url.password)throw new Error('报点链接来源不匹配');
  for(const [key,value]of Object.entries({pokemon,region,location}))if(url.searchParams.get(key)!==value)throw new Error('报点链接身份不匹配');
  const raw=url.searchParams.get('timestamp');
  if(!/^\d{10}$/.test(raw||''))throw new Error('报点链接缺少消失时间');
  const expiresAt=Number(raw)*1000;
  if(expiresAt<reportedAt||expiresAt-reportedAt>3*3600000)throw new Error('预计消失时间无效');
  url.hash='';
  return {key:`${kind}:${row.id}`,id:row.id,kind,pokemon,region,location,reportedAt,expiresAt,originalExpiresAt:expiresAt,url:url.href,status:'active',verified:kind==='alpha'};
}
export function applySwarmStatus(event,payload){
  if(event.kind!=='swarm'||!payload||payload.notification_id!==event.id||!['active','expired','removed','ended_early'].includes(payload.status))throw new Error('群怪状态无效或与记录不匹配');
  const seconds=payload.effective_despawn_timestamp;
  if(!Number.isSafeInteger(seconds)||seconds<1)throw new Error('群怪状态缺少有效消失时间');
  const expiresAt=seconds*1000;
  if(expiresAt<event.reportedAt-60000||expiresAt-event.reportedAt>3*3600000)throw new Error('群怪消失时间异常');
  const url=new URL(event.url);url.searchParams.set('timestamp',String(seconds));
  return {...event,expiresAt,url:url.href,status:payload.status,verified:true};
}
export function isActive(event,now=Date.now()){
  return event.verified&&event.status==='active'&&event.expiresAt>now&&event.reportedAt<=now+120000;
}
export function eventFingerprint(event){
  return createHash('sha256').update(JSON.stringify([event.kind,event.id,event.pokemon,event.region,event.location,event.reportedAt,event.expiresAt,event.status])).digest('hex').slice(0,24);
}
