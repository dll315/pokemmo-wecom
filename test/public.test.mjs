import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicView, buildCatalog, timeSlots } from '../src/public.mjs';
import { Translator } from '../src/i18n.mjs';
const now=Date.parse('2026-10-12T07:40:00Z');
const event={key:'alpha:4927',id:4927,kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:Date.parse('2026-10-12T07:36:15Z'),expiresAt:Date.parse('2026-10-12T08:51:15Z'),url:'https://alpha.pokemmotools.org/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1791795075',status:'active',verified:true};
const tr=new Translator({pokemon:{Jynx:'迷唇姐'},region:{Unova:'合众'},location:{'Route 8':'8号道路'},ability:{'Dry Skin':'干燥皮肤'},move:{Psychic:'精神强念'}});
function state(){return{records:{[event.key]:{event,fingerprint:'secret-internal-hash',lastSentAt:123}},config:{webhookUrl:'SECRET_ROBOT_URL'},outbox:[{error:'SECRET_DELIVERY_ERROR'}],logs:[{message:'SECRET_LOG'}],sources:{alpha:{ok:true,lastSuccessAt:now,error:'SECRET_BACKEND_ERROR'},swarm:{}}};}
test('访客只获得报点和公开状态，不泄露机器人、发送队列、日志或内部字段',()=>{
  const view=createPublicView(state(),tr,[],{},now);const text=JSON.stringify(view);
  assert.equal(text.includes('SECRET'),false);assert.equal(text.includes('lastSentAt'),false);assert.equal(text.includes('fingerprint'),false);
  assert.equal(view.events[0].pokemonZh,'迷唇姐');assert.equal(view.summary.activeAlphas,1);
});
test('最新头目可以是已过期记录，绝不能把最新等同于在场',()=>{
  const s=state();s.records[event.key].event={...event,expiresAt:now-1};const view=createPublicView(s,tr,[],{},now);
  assert.equal(view.latestAlpha.status,'expired');assert.equal(view.summary.activeAlphas,0);assert.equal(view.latestAlpha.pokemonZh,'迷唇姐');
});
test('未经核实的群怪不进入活跃列表，也不展示猜测的消失时间',()=>{
  const s=state();s.records.swarm={event:{...event,key:'swarm:1',id:1,kind:'swarm',verified:false}};const view=createPublicView(s,tr,[],{},now);
  assert.equal(view.summary.activeSwarms,0);const swarm=view.events.find(e=>e.kind==='swarm');assert.equal(swarm.status,'unverified');assert.equal(swarm.expiresAt,null);
});
test('24小时访客记录按时间排列并排除更旧记录，不影响发送队列',()=>{
  const s=state();s.records.old={event:{...event,key:'alpha:1',id:1,reportedAt:now-25*3600000}};
  const view=createPublicView(s,tr,[],{},now);assert.equal(view.events.length,1);assert.equal(s.outbox.length,1);
});
test('头目资料提供中文特性、招式、通行条件与合法图片地址',()=>{
  const catalog=buildCatalog({Unova:{'Route 8':[{name:'Jynx',data:{Ability:'Dry Skin',Moveset:['Psychic'],HMs:['Surf'],Notes:[], 'Egg Group':['Humanoid'], 'Male Ratio':'0'}}]}},tr,{Jynx:124});
  assert.equal(catalog[0].abilityZh,'干燥皮肤');assert.deepEqual(catalog[0].movesZh,['精神强念']);assert.deepEqual(catalog[0].hmsZh,['冲浪']);assert.equal(catalog[0].sprite,'/sprites/124.png');
});
test('北京时间跨午夜时选择正确的20点时间窗，时间窗不代表确定刷新',()=>{
  const result=timeSlots(Date.parse('2026-10-12T16:30:00Z'));assert.equal(result.slots.filter(s=>s.current).length,1);assert.equal(result.slots.find(s=>s.current).label,'20:00—次日00:45');assert.equal(result.nextStart,Date.parse('2026-10-12T18:00:00Z'));
});
test('超过200条报点时，分页上限不影响24小时统计或最新头目',()=>{
  const s=state();s.records={};
  for(let i=0;i<220;i++)s.records['swarm:'+i]={event:{...event,key:'swarm:'+i,id:i,kind:'swarm',reportedAt:now-i*1000}};
  s.records[event.key]={event:{...event,reportedAt:now-3600000}};
  const view=createPublicView(s,tr,[],{},now);assert.equal(view.summary.swarms24h,220);assert.equal(view.summary.alphas24h,1);assert.equal(view.latestAlpha.pokemonZh,'迷唇姐');assert.equal(view.events.length,200);assert.equal(view.historyTotal,221);
});
