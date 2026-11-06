import test from 'node:test';import assert from 'node:assert/strict';import {Translator} from '../src/i18n.mjs';import {formatIncoming} from '../src/incoming-format.mjs';const tr=await Translator.load(),at=Date.now();
for(const [label,body,kind]of [
 ['中文群怪',{pokemon:'Ekans',region:'Johto',location:'Route 212',notification_type:'群怪'},'swarm'],
 ['嵌套事件',{event:'alpha_spawn',payload:{pokemon:'Ekans',region:'Johto',location:'Route 212'}},'alpha'],
 ['微信markdown',{msgtype:'markdown',markdown:{content:'关都 群怪 皮卡丘\n位置：1号道路'}},'swarm'],
 ['群集链接优先于正文',{content:'Alpha与Swarm报点服务',data:{pokemon:'Ekans',region:'Johto',location:'Route 212',source_url:'https://alpha.pokemmotools.org/swarm-list?pokemon=Ekans&region=Johto&location=Route+212'}},'swarm'],
 ['明确布尔字段',{pokemon:'Ekans',region:'Johto',is_swarm:true},'swarm'],
])test(label+'正确识别类型并按接收时刻计算',()=>{const r=formatIncoming(body,tr,{receivedAt:at});assert.equal(r.kind,kind);assert.match(r.title,kind==='alpha'?/头目/:/群集/);assert.equal(r.timing.startAt,at);assert.equal(r.timing.endAt,at+(kind==='alpha'?75:15)*60000);});

test('正文同时含两种类型时不猜测，但开始时间仍使用接收时间',()=>{const r=formatIncoming({content:'Alpha and Swarm feed',pokemon:'Ekans'},tr,{receivedAt:at});assert.equal(r.kind,'unknown');assert.equal(r.timing.startAt,at);assert.equal(r.timing.endAt,null);assert.doesNotMatch(r.payload.markdown.content,/源站未提供|查看来源/);});
