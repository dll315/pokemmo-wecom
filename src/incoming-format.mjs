import {readFileSync} from 'node:fs';
import {buildCatalog} from './public.mjs';
import {findAlphaDetails} from './wecom.mjs';
import {reportTiming,parseReportTime,receiptPolicy} from './report-time.mjs';
const SOURCE_CATALOG=JSON.parse(readFileSync(new URL('../data/alpha-catalog.json',import.meta.url),'utf8'));
export function formatIncoming(input,translator,{receivedAt=Date.now()}={}){
const DICTIONARIES={...translator.maps,catalog:SOURCE_CATALOG};
// DICTIONARIES 在生成工作流时内嵌，不需要联网翻译或 AI API。
const incoming={body:input};
let body=incoming.body??incoming;
if(typeof body==='string'){try{body=JSON.parse(body);}catch{body={content:body};}}
if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('无法识别报点：需要 JSON 对象或文本');
const obj=body.data&&typeof body.data==='object'?{...body,...body.data}:body;
const clean=v=>String(v??'').replace(/<@[^>]*>/g,'').replace(/[<>]/g,'').trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const fields={};
for(const [key,value]of Object.entries(obj))fields[norm(key)]=value;
for(const embed of body.embeds??[])for(const f of embed.fields??[])fields[norm(f.name)]=f.value;
const pick=(...keys)=>{for(const key of keys){const v=obj[key]??fields[norm(key)];if(v!==undefined&&v!==null&&v!=='')return v;}return '';};
const raw=[body.content,body.message,body.text,...(body.embeds??[]).flatMap(e=>[e.title,e.description,...(e.fields??[]).map(f=>`${f.name}: ${f.value}`)])].filter(v=>typeof v==='string'&&v.trim()).join('\n');
const originalLink=pick('url','alphaUrl','swarmUrl','link')||(body.embeds??[]).find(e=>e.url)?.url||raw.match(/https:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm)-list\?[^\s<>)]*/i)?.[0];
// n8n Code 沙箱不保证提供 URL / URLSearchParams；只解析可信源站链接。
const query=Object.create(null);
const params={get:key=>query[key]??null};
let sourceLink='https://alpha.pokemmotools.org/';
if(typeof originalLink==='string'&&!/[\s\\<>()[\]`]/.test(originalLink)){
  const relative=/^\/(?!\/)/.test(originalLink);
  const absolute=/^https:\/\/alpha\.pokemmotools\.org(?:\/|\?|#|$)/i.test(originalLink);
  if(relative||absolute){
    sourceLink=relative?'https://alpha.pokemmotools.org'+originalLink:originalLink;
    const qs=sourceLink.split('#')[0].split('?').slice(1).join('?');
    for(const pair of qs.split('&')){
      if(!pair)continue;
      const eq=pair.indexOf('=');
      try{const key=decodeURIComponent((eq<0?pair:pair.slice(0,eq)).replace(/\+/g,' '));const value=decodeURIComponent((eq<0?'':pair.slice(eq+1)).replace(/\+/g,' '));if(query[key]===undefined)query[key]=value;}catch{}
    }
  }
}
function canonical(category,value){
  const plain=clean(value).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').trim();
  if(!plain)return '';
  const matches=Object.entries(DICTIONARIES[category]||{}).filter(([en,zh])=>norm(en)===norm(plain)||norm(zh)===norm(plain));
  // 多个词条同译名时不猜测，以免错误补充其他地点资料。
  return matches.length===1?matches[0][0]:plain;
}
const pokemon=canonical('pokemon',pick('pokemon','pokemonName','Pokemon Name','species','Pokémon','宝可梦','宝可梦名称','精灵','精灵名称')||params.get('pokemon'));
const region=canonical('region',pick('region','地区')||params.get('region'));
const location=canonical('location',pick('location','位置','地点','具体位置')||params.get('location'));
const explicit=clean(pick('kind','type','eventType'));
const hint=raw.replace(/https?:\/\/\S+/gi,'')+' '+sourceLink.replace(/^https:\/\/alpha\.pokemmotools\.org/i,'').replace(/swarm-list/g,'swarm').replace(/alpha-list/g,'alpha');
const kind=/^(?:alpha|头目)$/i.test(explicit)?'头目':/^(?:swarm|明雷|大量出现)$/i.test(explicit)?'明雷（大量出现）':/\balpha\b|头目/i.test(hint)?'头目':/\bswarm\b|明雷|大量出现/i.test(hint)?'明雷（大量出现）':'报点';
function tr(category,v){return DICTIONARIES[category]?.[v]||v||'未提供';}
function translated(v){let out=String(v);for(const cat of ['pokemon','region','location','ability','move']){
  const dict=DICTIONARIES[cat]||{};
  for(const key of Object.keys(dict).sort((a,b)=>b.length-a.length)){
    const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    out=out.replace(new RegExp('(?<![A-Za-z])'+escaped+'(?![A-Za-z])','gi'),()=>dict[key]);
  }
}return out;}
function time(v){return parseReportTime(v).text;}

if(!pokemon&&!raw)throw new Error('无法识别报点：请检查 Alphapedia Test 返回的消息结构');
const title=`${region?tr('region',region):'地区待确认'} ${kind==='头目'?'头目':kind.startsWith('明雷')?'明雷':'通知'} ${pokemon?tr('pokemon',pokemon):'名称待确认'}`;
const matchingLink=[['pokemon',pokemon],['region',region],['location',location]].every(([key,value])=>params.get(key)&&canonical(key,params.get(key))===value);
const sourceTiming=reportTiming(pick,{linkEnd:matchingLink&&/^https:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm)-list(?:\?|$)/i.test(sourceLink)?params.get('timestamp'):''});
const timing=receiptPolicy(kind==='头目'?'alpha':kind.startsWith('明雷')?'swarm':'unknown',receivedAt,sourceTiming);
const lines=[title,`**开始时间：** ${timing.startText}`,`**结束时间：** ${timing.endText}`,`**时间依据：** ${timing.startSource}；${timing.endSource}`,`**宝可梦：** ${tr('pokemon',pokemon)}`,`**地区：** ${tr('region',region)}`,`**位置：** ${tr('location',location)}`];
if(sourceTiming.invalidOrder)lines.splice(3,0,'**源站时间异常：** 结束早于开始；当前倒计时按本站接收推送时间和固定时长计算。');
const details=kind==='头目'?findAlphaDetails({pokemon,region,location},buildCatalog(SOURCE_CATALOG,translator)):null;
const catalog=DICTIONARIES.catalog?.[region]?.[location]||[];
const detail=catalog.find(row=>norm(row.name)===norm(pokemon))?.data;
if(detail&&kind==='头目'){
  lines.push(`**具体地点：** ${details.specificLocationZh}`,`**特性：** ${details.abilityZh}`,`**招式：** ${details.movesZh.join('、')||'未提供'}`,`**通行技能（秘传／HM）：** ${details.hmsKnown?(details.hmsZh.join('、')||'源站未列出额外通行技能'):'暂无资料'}`);
  if(details.mapSourceUrl)lines.push(`[查看位置地图](${details.mapSourceUrl})`);else lines.push('**位置地图：** 源站暂无此地点的图片。');
  if(detail['Location Notes'])lines.push(`**前往条件：** ${tr('notes',detail['Location Notes'])}`);
  if(detail.Notes?.length)lines.push(`**捕捉备注：** ${detail.Notes.map(v=>tr('notes',v)).join('；')}`);
}else if(kind==='头目')lines.push('**捕捉资料：** 未匹配到该精灵在此地点的资料，请以游戏为准。');
lines.push(`**报点时间：** ${time(pick('reportedAt','reported_at','Report Time','报点时间'))}`,`**接收时间：** ${time(new Date(receivedAt).toISOString())}`);
if(pick('status','状态'))lines.push(`**来源状态：** ${translated(clean(pick('status','状态')))}`);
// 原文先限长，避免超长输入引起词表替换开销；只对显示文本做翻译。
if(raw)lines.push('**原始报点（已替换可识别的中文名称）：**',translated(clean(raw).slice(0,5000)));
const footer=`\n[查看来源](${sourceLink})\n> 社区报点可能延迟、更正或结束，请以游戏为准。未知名称保留原文；捕捉资料来自随包词表，可能更新。`;
const bytes=s=>Array.from(s).reduce((n,c)=>n+(c.codePointAt(0)>65535?4:c.codePointAt(0)>2047?3:c.codePointAt(0)>127?2:1),0);
let content=lines.join('\n');
if(bytes(content+footer)>4000){const chars=Array.from(content);let size=bytes(content);while(chars.length&&size+bytes('\n…（内容过长已截断）'+footer)>4000)size-=bytes(chars.pop());content=chars.join('')+'\n…（内容过长已截断）';}
return {payload:{msgtype:'markdown',markdown:{content:content+footer}},title,timing,sourceTiming,reportedStatus:clean(pick('status','状态')),details,pokemon,region,location,kind:kind==='头目'?'alpha':kind.startsWith('明雷')?'swarm':'unknown'};

}
