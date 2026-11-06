import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sendWebhook,validateWebhook} from './wecom.mjs';
export function validateQmsgUrl(value){let u;try{u=new URL(value);}catch{throw Error('请填写完整Qmsg推送地址');}if(u.protocol!=='https:'||u.hostname!=='qmsg.zendee.cn'||u.port||u.username||u.password||u.search||u.hash||!/^\/v3\/(?:j?send)\/[a-zA-Z0-9_-]{8,256}$/.test(u.pathname))throw Error('QQ渠道需要Qmsg的HTTPS v3/send或v3/jsend地址');u.pathname=u.pathname.replace('/v3/send/','/v3/jsend/');return u.href;}
export function validateChannelTarget(t){if((t.type||'wecom')==='wecom'){validateWebhook(t.url);return;}if(t.type!=='qmsg')throw Error('不支持此推送渠道');validateQmsgUrl(t.url);if(t.groupId&&!/^[1-9]\d{4,15}$/.test(t.groupId))throw Error('QQ群号格式无效');}
export function qmsgText(payload){let text=payload.markdown?.content||payload.text?.content||'';text=text.split('**原始报点')[0].replace(/^\[.*?\]\(.*?\)\s*$/gm,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+|www\.\S+/gi,'').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'').replace(/\*\*|^##?\s*|^>\s*/gm,'').replace(/\n{3,}/g,'\n\n').trim();const note='\n位置图请在网站查看（QQ渠道不发送链接）。';if(text.length>1700)text=Array.from(text.slice(0,1680)).join('')+'\n内容较长，末尾已省略。';return text+note;}
async function request(url,options={}){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)return{http:r.status};const text=await r.text();if(text.length>16384)throw Error('响应过大');return JSON.parse(text);}
export async function checkQmsgReceipt(url,providerId){try{const u=new URL(url);u.pathname=u.pathname.replace('/v3/jsend/','/v3/msg/status/');u.searchParams.set('msgId',String(providerId));const r=await request(u);if(r.success!==true)return{outcome:'uncertain',providerId,error:'Qmsg回执查询未成功，勿直接重发'};if(r.data===1)return{outcome:'success',providerId};if(r.data===-1||r.data===2)return{outcome:'failed',providerId,error:r.data===2?'Qmsg标记为内容不合规，请检查消息和服务规则':'Qmsg回执显示发送失败'};return{outcome:'uncertain',providerId,error:'Qmsg已受理，QQ尚未返回成功回执；可查询回执，勿直接重发'};}catch{return{outcome:'uncertain',providerId,error:'Qmsg回执暂无法查询；请检查QQ是否收到，勿直接重发'};}}
export async function sendQmsg(url,payload,groupId='',{pollAttempts=3}={}){try{const r=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg:qmsgText(payload),...(groupId?{group:groupId}:{})})});if(r.http===429)return{outcome:'retry',retryAfter:60000,error:'Qmsg限流，稍后重试'};if(r.success!==true)return{outcome:r.http>=500?'uncertain':'failed',error:'Qmsg未受理消息，请检查绑定、额度或服务状态'};if(!Number.isSafeInteger(r.data)||r.data<1)return{outcome:'uncertain',error:'Qmsg未返回有效消息编号，请核实QQ是否收到'};let receipt;for(let i=0;i<pollAttempts;i++){if(i)await new Promise(resolve=>setTimeout(resolve,800));receipt=await checkQmsgReceipt(url,r.data);if(receipt.outcome!=='uncertain')return receipt;}return receipt;}catch{return{outcome:'uncertain',error:'Qmsg连接中断或超时，送达待确认，勿直接重发'};}}
export function channelRateKey(target){return target?.type==='qmsg'?'qmsg:'+createHash('sha256').update(target.url).digest('hex').slice(0,24):target?.id;}
export async function sendTarget(url,payload,{target,sendImages=true,mediaSent=false,onMediaSent=()=>{},send=sendWebhook,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(target?.type==='qmsg')return sendQmsg(url,payload,target.groupId||'');
 const {_sprite,...message}=payload;
 if(sendImages&&_sprite&&!mediaSent&&/^\/sprites\/[1-9]\d{0,3}\.png$/.test(_sprite)){
  let bytes;try{bytes=readFileSync(new URL('../web'+_sprite,import.meta.url));}catch{return{outcome:'failed',error:'精灵图片文件缺失，请检查镜像；尚未发送'};}
  const result=await send(url,{msgtype:'image',image:{base64:bytes.toString('base64'),md5:createHash('md5').update(bytes).digest('hex')}});
  if(result.outcome!=='success')return{...result,error:'精灵图片：'+(result.error||'送达未确认')};
  await onMediaSent();await pause(3500);
 }
 return send(url,message);
}
