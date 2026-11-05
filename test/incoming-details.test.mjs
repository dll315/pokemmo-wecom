import test from 'node:test';
import assert from 'node:assert/strict';
import {Translator} from '../src/i18n.mjs';
import {formatIncoming} from '../src/incoming-format.mjs';
const tr=await Translator.load();
test('官网描述中的报点链接也能解析物种和地点，补齐准确中文招式',()=>{
 const msg=formatIncoming({embeds:[{title:'头目出现',description:'[查看地点](https://alpha.pokemmotools.org/alpha-list?pokemon=Jynx&region=Unova&location=Route+8)'}]},tr);
 assert.equal(msg.pokemon,'Jynx');assert.equal(msg.location,'Route 8');assert.match(msg.payload.markdown.content,/精神强念/);
});
test('头目地图、特性、招式、通行技能同时提供，并保留可靠位置图片来源',()=>{
 const msg=formatIncoming({kind:'alpha',pokemon:'Lairon',region:'Hoenn',location:'Granite Cave'},tr);
 const t=msg.payload.markdown.content;
 for(const word of ['可多拉','石之洞窟','闪光','铁尾','地图'])assert.ok(t.includes(word),word);
 assert.ok(msg.details.mapSourceUrl.startsWith('https://i.imgur.com/'));assert.ok(msg.details.movesZh.length>0);
});
test('字段名不区分大小写，支持中文和带装饰的字段值',()=>{
 const msg=formatIncoming({embeds:[{title:'头目',fields:[{name:'Pokémon Name',value:'**迷唇姐**'},{name:'REGION',value:'合众'},{name:'LOCATION',value:'8号道路'}]}]},tr);
 assert.equal(msg.pokemon,'Jynx');assert.match(msg.payload.markdown.content,/精神强念/);
});
test('来源没有HM资料时不能宣称不需要通行技能，字段未匹配时不混用其他地点',()=>{
 const msg=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Unknown place'},tr);
 assert.equal(msg.details,null);assert.match(msg.payload.markdown.content,/未匹配|暂无/);assert.doesNotMatch(msg.payload.markdown.content,/无需额外秘传/);
});
test('原始消息很长时仍保留核心资料和位置地图入口',()=>{
 const msg=formatIncoming({kind:'alpha',pokemon:'Lairon',region:'Hoenn',location:'Granite Cave',content:'附加文字'.repeat(4000)},tr);
 const t=msg.payload.markdown.content;assert.ok(Buffer.byteLength(t)<=4096);assert.match(t,/地图/);assert.match(t,/铁尾/);assert.match(t,/闪光/);
});
test('源站域名中的alpha不能把明雷误判为头目',()=>{
 const m=formatIncoming({kind:'swarm',content:'[查看](https://alpha.pokemmotools.org/swarm-list?pokemon=Jynx&region=Unova&location=Route+8)'},tr);assert.equal(m.kind,'swarm');assert.equal(m.details,null);
});
