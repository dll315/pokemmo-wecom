import { isActive } from './events.mjs';
import {mapInfo} from './maps.mjs';

export function timeSlots(now=Date.now()){
  const dayMs=86400000,day=Math.floor((now+8*3600000)/dayMs)*dayMs-8*3600000;
  const hours=[2,8,14,20],labels=['02:00—06:45','08:00—12:45','14:00—18:45','20:00—次日00:45'];
  const slots=hours.map((hour,i)=>{
    const today=day+hour*3600000,start=today>now?today-dayMs:today;
    const current=now>=start&&now<start+285*60000;
    return{label:labels[i],startAt:current?start:today,endAt:(current?start:today)+285*60000,current};
  });
  const nextStart=Math.min(...hours.map(hour=>{const start=day+hour*3600000;return start>now?start:start+dayMs;}));
  return{slots,nextStart};
}
function sprite(pokemon,natdex){const id=Number(natdex[pokemon]??natdex[pokemon.toLowerCase()]);return Number.isInteger(id)&&id>0&&id<=1025?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`:null;}
function publicEvent(e,tr,natdex,now){
  const status=!e.verified?'unverified':isActive(e,now)?'active':e.status==='active'?'expired':e.status;
  return{key:e.key,kind:e.kind,pokemon:e.pokemon,pokemonZh:tr.pokemon(e.pokemon),region:e.region,regionZh:tr.region(e.region),location:e.location,locationZh:tr.location(e.location),reportedAt:e.reportedAt,expiresAt:e.verified?e.expiresAt:null,status,url:e.url,sprite:sprite(e.pokemon,natdex)};
}
export function createPublicView(state,tr,catalog=[],natdex={},now=Date.now()){
  const allEvents=Object.values(state.records).map(r=>r.event).filter(e=>['alpha','swarm'].includes(e.kind)&&e.reportedAt>=now-24*3600000&&e.reportedAt<=now+120000).sort((a,b)=>b.reportedAt-a.reportedAt).map(e=>publicEvent(e,tr,natdex,now));
  const events=allEvents.slice(0,200);
  const times=timeSlots(now);
  for(const slot of times.slots)slot.reported=allEvents.some(e=>e.kind==='alpha'&&e.reportedAt>=slot.startAt&&e.reportedAt<=slot.endAt);
  const sources={};for(const kind of ['alpha','swarm']){const health=state.sources[kind]||{};sources[kind]={ok:health.ok??null,lastSuccessAt:health.lastSuccessAt||null,message:health.ok===false?'源站数据暂未能完整核实，正在重试':''};}
  const incoming=(state.receipts||[]).filter(r=>r.at>=now-24*3600000).slice(0,500).map(r=>({key:r.key,kind:r.kind,title:r.title||`${tr.region(r.region)||'地区待确认'} ${r.kind==='alpha'?'头目':r.kind==='swarm'?'明雷':'通知'} ${tr.pokemon(r.pokemon)||'名称待确认'}`,timing:r.timing||null,reportedStatus:r.reportedStatus||'',pokemon:r.pokemon,region:r.region,location:r.location,pokemonZh:tr.pokemon(r.pokemon)||'原文通知',regionZh:tr.region(r.region)||'未提供',locationZh:tr.location(r.location)||'未提供',details:r.details||null,receivedAt:r.at}));
  return{now,mode:state.sources.alpha?.mode==='webhook'?'webhook':'poll',sources,incoming,events,historyTotal:allEvents.length,latestAlpha:allEvents.find(e=>e.kind==='alpha')||null,
    summary:{activeAlphas:allEvents.filter(e=>e.kind==='alpha'&&e.status==='active').length,activeSwarms:allEvents.filter(e=>e.kind==='swarm'&&e.status==='active').length,alphas24h:allEvents.filter(e=>e.kind==='alpha').length,swarms24h:allEvents.filter(e=>e.kind==='swarm').length,catalogSpecies:new Set(catalog.map(e=>e.pokemon)).size,catalogEntries:catalog.length},
    regions:['Kanto','Johto','Hoenn','Sinnoh','Unova'].map(region=>({region,regionZh:tr.region(region),latest:allEvents.find(e=>e.kind==='swarm'&&e.region===region&&e.status==='active')||allEvents.find(e=>e.kind==='swarm'&&e.region===region)||null})),...times};
}
export function buildCatalog(data,tr,natdex={}){
  const hm={Surf:'冲浪',Dive:'潜水',Cut:'居合斩',Fly:'飞翔',Flash:'闪光',Strength:'怪力',Waterfall:'攀瀑','Rock Smash':'碎岩','Rock Climb':'攀岩'};
  return Object.entries(data).flatMap(([region,locations])=>Object.entries(locations).flatMap(([location,items])=>items.map(({name:pokemon,data:d={}})=>({
    key:[region,location,pokemon].join('|'),pokemon,pokemonZh:tr.pokemon(pokemon),region,regionZh:tr.region(region),location,locationZh:tr.location(location),specificLocationZh:tr.location(d['Specific Location']||location),
    abilityZh:tr.lookup('ability',d.Ability||'未知'),movesZh:(d.Moveset||[]).map(m=>tr.lookup('move',m)),hmsZh:(d.HMs||[]).map(m=>hm[m]||m),hmsKnown:Array.isArray(d.HMs),...mapInfo(d['Map Link']),notes:(d.Notes||[]).map(n=>tr.lookup('notes',n).replace(/\*\*/g,'')),locationNotes:tr.lookup('notes',d['Location Notes']||''),
    maleRatio:d['Male Ratio']||'未知',eggGroups:(d['Egg Group']||[]).map(g=>tr.lookup('egg-group',g)),sprite:sprite(pokemon,natdex),
    url:`https://alpha.pokemmotools.org/alpha-list?${new URLSearchParams({pokemon,region,location})}`
  }))));
}
