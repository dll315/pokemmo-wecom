export function shortTime(at){return Number.isFinite(at)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at):null;}
export function formatPush(payload,timing={}){
 if(typeof payload.markdown?.content!=='string')return payload;
 let content=payload.markdown.content;
 for(const [name,at]of [['开始时间',timing.startAt],['结束时间',timing.endAt]])if(shortTime(at))content=content.replace(new RegExp('^\\*\\*'+name+'：\\*\\*[^\\n]*','m'),'**'+name+'：** '+shortTime(at));
 content=content.replace(/^\*\*闪光等级[^\n]*(?:\n|$)/gm,'')
 .replace(/^\*\*万圣节捕捉方法：\*\* ([^\n]+)$/gm,(_,method)=>'**万圣节捕捉方法**\n'+method.split('＋').map(s=>'• '+s).join('\n'))
 .replace(/^\*\*捕获概率（([^）]+)）：\*\* (.+?) ([\d.]+%)；HP (.+?)；状态：([^\n]+)$/gm,(_,strategy,ball,chance,hp,status)=>'**捕捉方案｜'+strategy+'**\n• 精灵球：'+ball+'\n• 捕获概率：'+chance+'\n• 血量：'+hp+'\n• 状态：'+status);
 const lines=content.split('\n'),out=[];
 for(let i=0;i<lines.length;i++){const line=lines[i];if(i===1&&out.at(-1)!=='')out.push('');if((/^\*\*(?:位置说明|所在地图|万圣节捕捉方法|捕捉方案)/.test(line)||/^\[查看/.test(line))&&out.length&&out.at(-1)!=='')out.push('');out.push(line);if(/^\*\*(?:位置说明|所在地图)：/.test(line))out.push('');}
 content=out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
 if(Buffer.byteLength(content)>4096){const chars=Array.from(content),suffix='\n…（末尾已省略）';let n=Buffer.byteLength(content);while(n+Buffer.byteLength(suffix)>4096)n-=Buffer.byteLength(chars.pop());content=chars.join('')+suffix;}
 return{...payload,markdown:{...payload.markdown,content}};
}
