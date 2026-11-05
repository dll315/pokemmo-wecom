import { beijingTime } from './i18n.mjs';

export function validateWebhook(value){
  let url;try{url=new URL(value);}catch{throw new Error('请填写完整的企业微信群机器人 Webhook 地址');}
  if(url.protocol!=='https:'||url.hostname!=='qyapi.weixin.qq.com'||url.port||url.pathname!=='/cgi-bin/webhook/send'||url.username||url.password||url.hash||!url.searchParams.get('key')||[...url.searchParams.keys()].some(k=>k!=='key')||url.searchParams.getAll('key').length!==1)throw new Error('地址必须是企业微信官方群机器人 HTTPS 发送地址');
  return url.href;
}
function safe(value){return String(value).slice(0,128).replace(/[<>]/g,c=>c==='<'?'＜':'＞').replace(/[\\*_[\]`]/g,'\\$&');}
export function findAlphaDetails(event,catalog=[]){
  const normalize=value=>String(value||'').trim().toLowerCase();
  return catalog.find(d=>normalize(d.pokemon)===normalize(event.pokemon)&&normalize(d.region)===normalize(event.region)&&normalize(d.location)===normalize(event.location))||null;
}
export function formatNotification(event,tr,now=Date.now(),correction=false,details=null){
  const kind=event.kind==='alpha'?'头目':'群怪（大量出现）';
  const status={removed:'网站已撤回这条报点，请勿据此前往。',ended_early:'网站标记为提前结束，请勿据此前往。',expired:'网站标记为已结束。'}[event.status];
  const seconds=Math.max(0,Math.floor((event.expiresAt-now)/1000));
  const remaining=`${Math.floor(seconds/60)}分${seconds%60}秒`;
  if(event.kind==='swarm'){
    const lines=[`## ${correction?'报点更正 · ':''}群怪报点`,`**名称：** ${safe(tr.pokemon(event.pokemon))}`,`**位置：** ${safe(tr.region(event.region))} · ${safe(tr.location(event.location))}`];
    if(status)lines.push(`**状态：** ${status}`);
    return{msgtype:'markdown',markdown:{content:lines.join('\n')}};
  }
  const lines=[`## ${correction?'报点更正 · ':''}${kind}提醒`,
    `**宝可梦：** ${safe(tr.pokemon(event.pokemon))}`,
    `**地区：** ${safe(tr.region(event.region))}`,
    `**具体位置：** ${safe(details?.specificLocationZh||tr.location(event.location))}`];
  if(details){
    lines.push(`**特性：** ${safe(details.abilityZh)}`,`**招式：** ${details.movesZh.map(safe).join('、')||'暂无资料'}`,`**通行技能：** ${details.hmsZh.map(safe).join('、')||'无需额外秘传技能'}`);
    if(details.locationNotes)lines.push(`**前往条件：** ${safe(details.locationNotes)}`);
  }else lines.push('**特性与招式：** 源站暂无对应地点资料，请查看原站核实。');
  lines.push(`**报点时间：** ${beijingTime(event.reportedAt)}`);
  if(status)lines.push(`**状态：** ${status}`);
  else lines.push(`**预计消失：** ${beijingTime(event.expiresAt)}`,`**发送时约剩余：** ${remaining}`);
  lines.push('> 时间均为北京时间；社区报点及剩余时间为估计，请以游戏地图为准。',`[查看对应报点](${event.url})`,'来源：Alphapedia');
  if(details?.notes?.length){
    const notes=details.notes.map(safe).join('；');let remaining=notes;
    while(remaining&&Buffer.byteLength(lines.join('\n')+'\n**捕捉备注：** '+remaining+'…')>4096)remaining=Array.from(remaining).slice(0,-1).join('');
    if(remaining)lines.splice(lines.length-3,0,`**捕捉备注：** ${remaining}${remaining.length<notes.length?'…':''}`);
  }
  const payload={msgtype:'markdown',markdown:{content:lines.join('\n')}};
  if(Buffer.byteLength(payload.markdown.content,'utf8')>4096)throw new Error('通知超过企业微信长度限制');
  return payload;
}
export async function sendWebhook(url,payload,{timeoutMs=12000,signal}={}){
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(payload),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
    if(response.status===429)return{outcome:'retry',error:'企业微信请求限流',retryAfter:60000};
    if(!response.ok)return{outcome:response.status>=500?'uncertain':'failed',error:`企业微信 HTTP ${response.status}`};
    const text=await response.text();if(text.length>16384)return{outcome:'uncertain',error:'企业微信响应过大，送达结果待确认'};
    let result;try{result=JSON.parse(text);}catch{return{outcome:'uncertain',error:'企业微信响应无法解析，送达结果待确认'};}
    if(result.errcode===0)return{outcome:'success'};
    if(typeof result.errcode!=='number')return{outcome:'uncertain',error:'企业微信未返回明确成功结果'};
    if([-1,45009].includes(result.errcode))return{outcome:'retry',error:`企业微信临时错误 ${result.errcode}`,retryAfter:60000};
    return{outcome:'failed',error:`企业微信业务错误 ${result.errcode}，请检查机器人配置`};
  }catch{return{outcome:'uncertain',error:'连接中断或超时，机器人可能已收到；请确认后再重试'};}
}
