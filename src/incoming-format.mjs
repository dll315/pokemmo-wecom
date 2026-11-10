import {formatPush} from './presentation.mjs';
import {eventProfile} from './profile.mjs';
import {normalizePayload,classifyPayload} from './payload.mjs';
import {readFileSync} from 'node:fs';
import {buildCatalog} from './public.mjs';
import {findAlphaDetails} from './wecom.mjs';
import {reportTiming,parseReportTime,receiptPolicy} from './report-time.mjs';
const SOURCE_CATALOG=JSON.parse(readFileSync(new URL('../data/alpha-catalog.json',import.meta.url),'utf8'));
export function formatIncoming(input,translator,{receivedAt=Date.now()}={}){
const DICTIONARIES={...translator.maps,catalog:SOURCE_CATALOG};
// DICTIONARIES 在生成工作流时内嵌，不需要联网翻译或 AI API。
const incoming={body:input};
let body=normalizePayload(incoming.body??incoming);
if(typeof body==='string'){try{body=JSON.parse(body);}catch{body={content:body};}}
if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('无法识别报点：需要 JSON 对象或文本');
const obj=body.data&&typeof body.data==='object'?{...body,...body.data}:body;
const clean=v=>String(v??'').replace(/<@[^>]*>/g,'').replace(/[<>]/g,'').trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const fields={};
for(const [key,value]of Object.entries(obj))fields[norm(key)]=value;
for(const embed of body.embeds??[])for(const f of embed.fields??[])fields[norm(f.name)]=f.value;
const pick=(...keys)=>{for(const key of keys){const v=obj[key]??fields[norm(key)];if(v!==undefined&&v!==null&&v!=='')return v;}return '';};
const raw=[body.title,body.content,body.message,body.text,...(body.embeds??[]).flatMap(e=>[e.title,e.description,...(e.fields??[]).map(f=>`${f.name}: ${f.value}`)])].filter(v=>typeof v==='string'&&v.trim()).join('\n');
const originalLink=raw.match(/https?:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm|pheno|phenomenon)-list\?[^\s<>)]*/i)?.[0]||pick('shareUrl','share_url','url','source_url','sourceUrl','alphaUrl','swarmUrl','link','click')||(body.embeds??[]).find(e=>e.url)?.url||raw.match(/https?:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm|pheno|phenomenon)-list\?[^\s<>)]*/i)?.[0];
// n8n Code 沙箱不保证提供 URL / URLSearchParams；只解析可信源站链接。
const query=Object.create(null);
const params={get:key=>query[key]??null};
let sourceLink='https://alpha.pokemmotools.org/';
if(typeof originalLink==='string'&&!/[\s\\<>()[\]`]/.test(originalLink)){
  const relative=/^\/(?!\/)/.test(originalLink);
  const absolute=/^https?:\/\/alpha\.pokemmotools\.org(?:\/|\?|#|$)/i.test(originalLink);
  if(relative||absolute){
    sourceLink=relative?'https://alpha.pokemmotools.org'+originalLink:originalLink.replace(/^http:/i,'https:');
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
let pokemon=canonical('pokemon',pick('pokemon','pokemonName','Pokemon Name','species','Pokémon','宝可梦','宝可梦名称','精灵','精灵名称')||params.get('pokemon'));
let region=canonical('region',pick('region','地区')||params.get('region'));
const location=canonical('location',pick('location','位置','地点','具体位置')||params.get('location'));
const classification=classifyPayload(pick,sourceLink,raw,body._typeEvidence);const kind=classification.label;
// Only infer an unambiguous name from the notification heading, never from move lists.
const heading=[body.title,...(body.embeds??[]).map(e=>e.title),raw.split('\n')[0]].filter(Boolean).join(' ');
function headingName(category){const found=new Set();for(const [en,zh] of Object.entries(DICTIONARIES[category]||{})){for(const name of [en,zh]){const escaped=Array.from(name,c=>/[a-z0-9\u4e00-\u9fff ]/i.test(c)?c:String.fromCharCode(92)+c).join('');if(new RegExp('(?<![A-Za-z])'+escaped+'(?![A-Za-z])','i').test(heading))found.add(en);}}return found.size===1?[...found][0]:'';}
if(kind!=='报点'){pokemon||=headingName('pokemon');region||=headingName('region');}
function tr(category,v){return DICTIONARIES[category]?.[v]||v||'未提供';}
function translated(v){let out=String(v);for(const cat of ['pokemon','region','location','ability','move']){
  const dict=DICTIONARIES[cat]||{};
  for(const key of Object.keys(dict).sort((a,b)=>b.length-a.length)){
    const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    out=out.replace(new RegExp('(?<![A-Za-z])'+escaped+'(?![A-Za-z])','gi'),()=>dict[key]);
  }
}return out;}
function time(v){return parseReportTime(v).text;}

if(!pokemon&&!raw&&kind==='报点')throw new Error('无法识别报点：请检查 Alphapedia Test 返回的消息结构');
const phenoName=clean(pick('phenoType','pheno_type','phenomenonType','phenomenon_type','奇遇类型'))||raw.split('\n')[0].match(/^(?:奇遇|现象|pheno(?:menon|mena)?)[\s:：]+(.+)$/i)?.[1]||'地点现象';
const title=`${region?tr('region',region):'地区待确认'} ${kind==='头目'?'头目':kind==='群集'?'群集':kind==='奇遇'?'奇遇':'类型待识别'} ${pokemon?tr('pokemon',pokemon):kind==='奇遇'?phenoName:'名称待确认'}`;
const matchingLink=[['pokemon',pokemon],['region',region],['location',location]].every(([key,value])=>params.get(key)&&canonical(key,params.get(key))===value);
const sourceTiming=reportTiming(pick,{linkEnd:matchingLink&&/^https?:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm|pheno|phenomenon)-list(?:\?|$)/i.test(sourceLink)?params.get('timestamp'):''});
const timing=receiptPolicy(kind==='头目'?'alpha':kind==='群集'?'swarm':kind==='奇遇'?'pheno':'unknown',receivedAt,sourceTiming);
const lines=[title,`**开始时间：** ${timing.startText}`,`**结束时间：** ${timing.endText}`];
let details=kind==='头目'?findAlphaDetails({pokemon,region,location},buildCatalog(SOURCE_CATALOG,translator)):null;
const locationNotes=pick('locationNotes','location_notes','Location Notes','位置说明','地点说明','位置描述','具体地点说明');
const probability=clean(pick('catchProbability','captureProbability','捕获概率','捕捉概率'));
if(kind==='奇遇')lines.push('**奇遇说明：** '+translated(clean(pick('phenoType','phenomenonType','phenomenon_type','pheno_type','奇遇类型','说明','description')||locationNotes||raw.split('\n')[0]||'地点现象')));
if(probability&&/^(?:100|\d{1,2})(?:\.\d+)?%$/.test(probability)&&parseFloat(probability)<=100)lines.push('**来源提供的捕获概率：** '+probability);
const catalog=DICTIONARIES.catalog?.[region]?.[location]||[];
const cachedDetail=catalog.find(row=>norm(row.name)===norm(pokemon))?.data;const sourceDetail=body.originalJson?.data||body.original_json?.data;const detail=kind==='头目'&&(cachedDetail||sourceDetail)?{...cachedDetail,...sourceDetail}:cachedDetail;
if(kind==='头目'&&sourceDetail)details=findAlphaDetails({pokemon,region,location},buildCatalog({[region]:{[location]:[{name:pokemon,data:detail}]}},translator));
let position=[tr('region',region),tr('location',location)];if(details?.specificLocationZh&&!position.includes(details.specificLocationZh))position.push(details.specificLocationZh);let positionText=position.join(' · ');const positionNote=locationNotes?translated(clean(locationNotes)):'';if(positionNote&&!positionText.includes(positionNote))positionText+='；'+positionNote;if(kind!=='群集')lines.splice(3,0,'**位置说明：** '+positionText);
const profile=eventProfile(pick,kind==='头目'?detail:null,translator,pokemon);
if(kind==='头目'){
 if(profile.maleRatio!==null)lines.push('**雄性比例：** '+profile.maleRatio+'%');
 if(profile.eggGroups.length)lines.push('**蛋组：** '+profile.eggGroups.join('、'));
 if(profile.abilityZh)lines.push('**特性：** '+profile.abilityZh);
 if(profile.movesZh.length)lines.push('**配招／招式：** '+profile.movesZh.join('、'));
}
for(const plan of profile.capturePlans)lines.push('**捕获概率（'+plan.strategy+'）：** '+plan.ball+' '+plan.chance+'；HP '+plan.hp+'；状态：'+plan.status);
if(profile.tier!==null)lines.push('**闪光等级（Tier）：** '+profile.tier);
if(detail&&kind==='头目'){
  lines.push(`**通行技能（秘传／HM）：** ${details.hmsKnown?(details.hmsZh.join('、')||'源站未列出额外通行技能'):'暂无资料'}`);
  if(details.mapSourceUrl)lines.push(`[查看位置地图](${details.mapSourceUrl})`);else lines.push('**位置地图：** 源站暂无此地点的图片。');
  if(detail['Location Notes'])lines.push(`**前往条件：** ${tr('notes',detail['Location Notes'])}`);
  if(detail.Notes?.length)lines.push(`**捕捉备注：** ${detail.Notes.map(v=>tr('notes',v)).join('；')}`);
}else if(kind==='头目')lines.push('**捕捉资料：** 未匹配到该精灵在此地点的资料，请以游戏为准。');
if(pick('status','状态'))lines.push(`**来源状态：** ${translated(clean(pick('status','状态')))}`);
// 原文先限长，避免超长输入引起词表替换开销；只对显示文本做翻译。
if(kind==='报点'&&raw)lines.push('**原始通知：**',translated(clean(raw).slice(0,5000)));
const footer=sourceLink==='https://alpha.pokemmotools.org/'?'':`\n[查看来源](${sourceLink})`;
const bytes=s=>Array.from(s).reduce((n,c)=>n+(c.codePointAt(0)>65535?4:c.codePointAt(0)>2047?3:c.codePointAt(0)>127?2:1),0);
let content=lines.join('\n');
if(bytes(content+footer)>4000){const chars=Array.from(content);let size=bytes(content);while(chars.length&&size+bytes('\n…（内容过长已截断）'+footer)>4000)size-=bytes(chars.pop());content=chars.join('')+'\n…（内容过长已截断）';}
const swarmInfo=kind==='群集'?{locationNotes:tr('location',location),captureProbability:/^(?:100|\d{1,2})(?:\.\d+)?%$/.test(probability)&&parseFloat(probability)<=100?probability:null}:null;
return {classification,profile,swarmInfo,payload:formatPush({_sprite:profile.sprite,msgtype:'markdown',markdown:{content:content+footer}},timing),title,timing,sourceTiming,reportedStatus:clean(pick('status','状态')),details,pokemon,region,location,kind:classification.kind};

}
