import { SITE, parseHistoryRow } from './events.mjs';

export class SourceError extends Error {
  constructor(message,retryAfterMs=0){super(message);this.retryAfterMs=retryAfterMs;}
}
async function limitedText(response,limit=2*1024*1024){
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>limit){await response.body.cancel().catch(()=>{});throw new SourceError('网站响应过大，已停止解析');}chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks).toString('utf8');
}
export class WebsiteSource {
  constructor({origin=SITE,pageSize=100,timeoutMs=20000,maxPages=15,now=()=>Date.now()}={}){
    this.origin=origin;this.pageSize=pageSize;this.timeoutMs=timeoutMs;this.maxPages=maxPages;this.sessions={};this.controller=new AbortController();this.now=now;
  }
  async request(path,headers={}){
    let response;
    try{response=await fetch(new URL(path,this.origin),{headers:{'User-Agent':'PokeMMO-WeCom-ZH/1.0','Accept':'application/json, text/html',...headers},redirect:'error',signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(this.timeoutMs)])});}catch{throw new SourceError('无法连接报点网站，请检查网络或稍后重试');}
    if(response.status===429){
      const value=response.headers.get('retry-after');
      const wait=/^\d+$/.test(value||'')?Number(value)*1000:Math.max(0,Date.parse(value)-Date.now());
      await response.body?.cancel();throw new SourceError('报点网站请求限流，已自动退避',Math.min(3600000,Math.max(60000,wait||60000)));
    }
    if(!response.ok){await response.body?.cancel();throw new SourceError(`报点网站 HTTP ${response.status}；不会绕过访问限制`);}
    return response;
  }
  async session(kind,force=false){
    const previous=this.sessions[kind];if(!force&&previous&&Date.now()-previous.at<240000)return previous;
    const path=kind==='alpha'?'/history':'/swarm-history';
    const response=await this.request(path,{Cookie:'tz=UTC'});
    const cookie=(response.headers.getSetCookie?.()||[]).map(s=>s.split(';')[0]).filter(s=>!s.startsWith('tz=')).join('; ');
    const html=await limitedText(response);
    let token;
    for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
      const attributes=Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
      if(attributes.name==='history-api-token')token=attributes.content;
    }
    if(!token||token.length>256)throw new SourceError('公开历史页面未提供有效会话；网站结构或访问权限可能变化');
    return this.sessions[kind]={token,cookie:`tz=UTC${cookie?'; '+cookie:''}`,at:Date.now(),path};
  }
  async history(kind,sinceMs){
    for(let attempt=0;attempt<2;attempt++){
      try{
        const session=await this.session(kind,attempt>0);const events=[];const seen=new Set();
        const start=Math.max(sinceMs,this.now()-48*3600000),dayMs=86400000;
        const days=[];for(let day=Math.floor(start/dayMs)*dayMs;day<=this.now();day+=dayMs)days.push(new Date(day));
        for(const day of days){let complete=false;
        for(let page=1;page<=this.maxPages;page++){
          const params=new URLSearchParams({page:String(page),pageSize:String(this.pageSize),includeInsights:'0',year:String(day.getUTCFullYear()),month:String(day.getUTCMonth()+1),day:String(day.getUTCDate())});
          const response=await this.request(`${kind==='alpha'?'/api/history-data':'/api/swarm-history-data'}?${params}`,{'X-History-Token':session.token,Cookie:session.cookie,Referer:new URL(session.path,this.origin).href});
          let data;try{data=JSON.parse(await limitedText(response));}catch(e){if(e instanceof SourceError)throw e;throw new SourceError('网站历史数据无法解析');}
          if(!Array.isArray(data.historyData)||!Number.isSafeInteger(data.totalRows)||data.totalRows<0||!Number.isSafeInteger(data.totalPages)||data.totalPages<1||data.page!==page||!Number.isSafeInteger(data.pageSize)||data.pageSize<1||data.historyData.length>data.pageSize)throw new SourceError('网站历史数据结构变化，已停止本次扫描');
          if(data.historyData.length===0&&data.totalRows>0)throw new SourceError('网站历史数据为空但记录总数非零');
          for(const row of data.historyData){
            let event;try{event=parseHistoryRow(kind,row,this.origin);}catch(e){throw new SourceError(`网站历史记录无法验证：${e.message}`);}
            if(event.reportedAt>=sinceMs&&!seen.has(event.key)){seen.add(event.key);events.push(event);}
          }
          if(page>=data.totalPages||data.totalRows===0){complete=true;break;}
        }
        if(!complete)throw new SourceError('单日报点超过扫描上限；本次结果未提交，请检查网站数据');
        }
        return events.sort((a,b)=>b.reportedAt-a.reportedAt||b.id-a.id);
      }catch(e){if(e.retryAfterMs||attempt===1||!this.sessions[kind])throw e;delete this.sessions[kind];}
    }
  }
  async swarmStatus(event){
    const params=new URLSearchParams({name:event.pokemon,region:event.region,location:event.location,despawn_timestamp:String(event.originalExpiresAt/1000)});
    const response=await this.request(`/api/swarm-call-status?${params}`);
    try{return JSON.parse(await limitedText(response,65536));}catch{throw new SourceError('群怪状态响应无效');}
  }
  close(){this.controller.abort();}
}
