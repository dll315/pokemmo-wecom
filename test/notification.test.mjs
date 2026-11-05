import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Translator } from '../src/i18n.mjs';
import { buildCatalog } from '../src/public.mjs';
import { formatNotification, findAlphaDetails } from '../src/wecom.mjs';
const tr=await Translator.load();
const catalog=buildCatalog(JSON.parse(await readFile(new URL('../data/alpha-catalog.json',import.meta.url),'utf8')),tr);
const now=Date.parse('2026-10-12T07:40:00Z');
const e={kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:Date.parse('2026-10-12T07:36:15Z'),expiresAt:Date.parse('2026-10-12T08:51:15Z'),status:'active',url:'https://alpha.pokemmotools.org/alpha-list?pokemon=Jynx'};
test('头目通知按物种地区地点精确匹配，含中文招式特性位置和时间',()=>{
  const d=findAlphaDetails(e,catalog);const text=formatNotification(e,tr,now,false,d).markdown.content;
  for(const word of ['迷唇姐','合众','8号道路','干燥皮肤','精神强念','冰冻光束','扮演','挑衅','16:51:15'])assert.ok(text.includes(word),word);
  assert.equal(text.includes('恶魔之吻'),false);
});
test('不同地点使用对应招式；缺少精确匹配时不混用其他地点资料',()=>{
  const d=findAlphaDetails({...e,region:'Sinnoh',location:'Snowpoint Temple'},catalog);assert.ok(d.movesZh.includes('恶魔之吻'));
  assert.equal(findAlphaDetails({...e,location:'Not a real route'},catalog),null);
  const text=formatNotification(e,tr,now,false,null).markdown.content;assert.match(text,/暂无对应地点/);
});
test('群怪正常通知只提供中文名称和位置，不附招式时间或捕捉资料',()=>{
  const text=formatNotification({...e,kind:'swarm',pokemon:'Blastoise',region:'Kanto',location:'Cape Brink'},tr,now).markdown.content;
  assert.match(text,/水箭龟/);assert.match(text,/关都/);assert.match(text,/歧波海湾/);
  for(const word of ['招式','特性','预计','时间','来源','http'])assert.equal(text.includes(word),false,word);
});
test('群怪更正保留必要的结束状态，避免错误前往',()=>{
  const text=formatNotification({...e,kind:'swarm',status:'ended_early'},tr,now,true).markdown.content;assert.match(text,/提前结束/);assert.match(text,/更正/);
});
test('捕捉备注过长时保留核心招式和位置，消息不会超长失败',()=>{
  const d={...findAlphaDetails(e,catalog),notes:['注意'.repeat(4000)]};const text=formatNotification(e,tr,now,false,d).markdown.content;
  assert.ok(Buffer.byteLength(text)<=4096);assert.match(text,/精神强念/);assert.match(text,/8号道路/);
});
