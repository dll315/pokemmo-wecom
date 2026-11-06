import test from 'node:test';import assert from 'node:assert/strict';
import {Translator} from '../src/i18n.mjs';import {formatIncoming} from '../src/incoming-format.mjs';import {createPublicView} from '../src/public.mjs';
const tr=await Translator.load();
test('第一行严格为地区＋头目/群集＋中文精灵名，随后显示起止时间和资料',()=>{
 const a=formatIncoming({kind:'alpha',pokemon:'Lairon',region:'Hoenn',location:'Granite Cave',startAt:'2026-11-05T10:00:00Z',endAt:'2026-11-05T11:15:00Z'},tr,{receivedAt:Date.parse('2026-11-05T10:00:00Z')});
 assert.equal(a.payload.markdown.content.split('\n')[0],'丰缘 头目 可多拉');assert.match(a.payload.markdown.content,/开始时间：.*18:00/);assert.match(a.payload.markdown.content,/结束时间：.*19:15/);assert.match(a.payload.markdown.content,/铁尾/);assert.match(a.payload.markdown.content,/闪光/);
 const b=formatIncoming({kind:'swarm',pokemon:'Pikachu',region:'Kanto',location:'Route 1'},tr);assert.equal(b.payload.markdown.content.split('\n')[0],'关都 群集 皮卡丘');assert.equal(b.sourceTiming.startAt,null);assert.equal(b.sourceTiming.endAt,null);
});
test('Discord时间标记和Unix秒/毫秒均正确，没注明时区不猜测',()=>{
 const a=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',embeds:[{fields:[{name:'Start Time',value:'<t:1793872800:F>'},{name:'End Time',value:1793877300000}]}]},tr);assert.equal(a.sourceTiming.startAt,1793872800000);assert.equal(a.sourceTiming.endAt,1793877300000);
 const b=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',startAt:'2026-11-05 18:00'},tr);assert.equal(b.sourceTiming.startAt,null);assert.match(b.sourceTiming.startText,/未注明时区/);
});
test('可信报点链接的timestamp只作为源站预计结束时间，不推算开始时间',()=>{
 const r=formatIncoming({url:'/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1793877300'},tr);assert.equal(r.sourceTiming.startAt,null);assert.equal(r.sourceTiming.endAt,1793877300000);assert.match(r.sourceTiming.endSource,/源站链接/);
});
test('结束早于开始时明确异常，不能将其显示为当前可捕捉',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',startAt:'2026-11-05T11:00:00Z',endAt:'2026-11-05T10:00:00Z'},tr);assert.equal(r.sourceTiming.invalidOrder,true);assert.equal(r.timing.invalidOrder,false);
});
test('公开报点保留类型、起止和时间来源，不泄露原文或接收地址',()=>{
 const a=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',startAt:'2026-11-05T10:00:00Z',endAt:'2026-11-05T11:00:00Z'},tr,{receivedAt:Date.parse('2026-11-05T10:00:00Z')});
 const s={config:{},records:{},sources:{alpha:{mode:'webhook'},swarm:{}},receipts:[{key:'x',at:Date.now(),kind:a.kind,pokemon:a.pokemon,region:a.region,title:a.title,timing:a.timing,raw:{secret:'PRIVATE'},preview:'PRIVATE'}]};
 const v=createPublicView(s,tr);assert.equal(v.incoming[0].title,'合众 头目 迷唇姐');assert.equal(v.incoming[0].timing.startAt,1793872800000);assert.equal(JSON.stringify(v).includes('PRIVATE'),false);
});
test('链接和正文不是同一地点时，不挪用链接的结束时间',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Sinnoh',location:'Snowpoint Temple',url:'/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1793877300'},tr);assert.equal(r.sourceTiming.endAt,null);
});
test('非法日历日期不能自动滚动成另一天',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',startAt:'2026-02-30T10:00:00Z'},tr);assert.equal(r.sourceTiming.startAt,null);assert.match(r.sourceTiming.startText,/无效/);
});
test('整理旧记录时接收时间保持原值，不变成升级或预览时刻',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova'},tr,{receivedAt:Date.parse('2026-11-04T00:00:00Z')});assert.equal(r.timing.startAt,Date.parse('2026-11-04T00:00:00Z'));assert.match(r.payload.markdown.content,/开始时间：.*08:00/);assert.doesNotMatch(r.payload.markdown.content,/2026|北京时间|08:00:00/);
});
test('只有刷新时间时不将它误写为源站报点时间',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',spawnedAt:'2026-11-05T10:00:00Z'},tr);assert.equal(r.sourceTiming.startAt,1793872800000);assert.doesNotMatch(r.payload.markdown.content,/报点时间：/);
});
