import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryRow, applySwarmStatus, eventFingerprint, isActive } from '../src/events.mjs';
import { Translator } from '../src/i18n.mjs';
import { formatNotification, validateWebhook, sendWebhook } from '../src/wecom.mjs';
import { createServer } from 'node:http';

export const alphaRow = { id:4927, pokemon:'Jynx', region:'Unova', location:'Route 8', timestampIso:'2026-10-12T07:36:15', alphaUrl:'/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1791795075' };
export const swarmRow = { id:6105, pokemon:'Blastoise', region:'Kanto', location:'Cape Brink', timestampIso:'2026-10-12T11:10:04', alphaUrl:'/swarm-list?pokemon=Blastoise&region=Kanto&location=Cape+Brink&timestamp=1791807904' };
const tr = new Translator({pokemon:{Jynx:'迷唇姐',Blastoise:'水箭龟'},region:{Unova:'合众',Kanto:'关都'},location:{'Route 8':'8号道路','Cape Brink':'水之道'}});

test('无时区网站记录按 UTC 解析，链接时间戳是消失时间',()=>{
  const e=parseHistoryRow('alpha',alphaRow);
  assert.equal(e.reportedAt,1791790575000);
  assert.equal(e.expiresAt,1791795075000);
  assert.equal(e.key,'alpha:4927');
});
test('拒绝日期无效、身份不匹配、外站链接与缺少消失时间的记录',()=>{
  for (const row of [{...alphaRow,timestampIso:'bad'}, {...alphaRow,timestampIso:'2026-02-30T07:36:15'}, {...alphaRow,pokemon:'Ditto'}, {...alphaRow,alphaUrl:'https://evil.invalid/alpha-list'}, {...alphaRow,alphaUrl:alphaRow.alphaUrl.replace('&timestamp=1791795075','')}]) assert.throws(()=>parseHistoryRow('alpha',row));
});
test('群怪必须以状态接口的有效消失时间覆盖历史链接',()=>{
  const e=applySwarmStatus(parseHistoryRow('swarm',swarmRow),{status:'expired',notification_id:6105,effective_despawn_timestamp:1791803704});
  assert.equal(e.expiresAt,1791803704000);
  assert.equal(isActive(e,Date.parse('2026-10-12T11:20:00Z')),false);
});
test('状态接口记录 ID 不匹配、未知状态、缺少时间时拒绝发送',()=>{
  const e=parseHistoryRow('swarm',swarmRow);
  for (const status of [{status:'active',notification_id:1,effective_despawn_timestamp:1791803704},{status:'unknown',notification_id:6105},{status:'active',notification_id:6105}]) assert.throws(()=>applySwarmStatus(e,status));
});
test('撤回和提前结束的群怪不能作为活跃报点',()=>{
  for(const status of ['removed','ended_early']){
    const e=applySwarmStatus(parseHistoryRow('swarm',swarmRow),{status,notification_id:6105,effective_despawn_timestamp:1791803704});
    assert.equal(isActive(e,Date.parse('2026-10-12T11:11:00Z')),false);
  }
});
test('失效边界相等时不能发送，未知物种保留原文',()=>{
  const e=parseHistoryRow('alpha',alphaRow);
  assert.equal(isActive(e,1791795075000),false);
  assert.equal(tr.pokemon('Unknown New Form'),'Unknown New Form');
});
test('中文消息正确区分报点和预计消失，使用北京时间',()=>{
  const e=parseHistoryRow('alpha',alphaRow);
  const payload=formatNotification(e,tr,Date.parse('2026-10-12T07:40:00Z'));
  assert.equal(payload.msgtype,'markdown');
  assert.match(payload.markdown.content,/迷唇姐/);
  assert.match(payload.markdown.content,/合众/);
  assert.match(payload.markdown.content,/15:36:15/);
  assert.match(payload.markdown.content,/16:51:15/);
  assert.match(payload.markdown.content,/预计/);
  assert.match(payload.markdown.content,/71分15秒/);
  assert.ok(Buffer.byteLength(payload.markdown.content)<=4096);
});
test('更正指纹会随内容变更，但不会随运行时刻改变',()=>{
  const a=parseHistoryRow('alpha',alphaRow);
  assert.equal(eventFingerprint(a),eventFingerprint({...a,checkedAt:123}));
  assert.notEqual(eventFingerprint(a),eventFingerprint({...a,status:'removed'}));
});
test('机器人地址仅允许企业微信 HTTPS 发送接口，拒绝重定向与不规范地址',()=>{
  assert.equal(validateWebhook('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc'), 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc');
  for(const value of ['http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x','https://evil.invalid/?key=x','https://qyapi.weixin.qq.com/other?key=x','https://u:p@qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=']) assert.throws(()=>validateWebhook(value));
});
async function withReceiver(handler,fn){
  const server=createServer(handler); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}
}
test('HTTP 200 且 errcode=0 才能确认为成功，实际请求为中文 JSON',async()=>{
  let body;
  await withReceiver(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);res.setHeader('Content-Type','application/json');res.end('{"errcode":0,"errmsg":"ok"}');},async url=>{
    const result=await sendWebhook(url,formatNotification(parseHistoryRow('alpha',alphaRow),tr,Date.parse('2026-10-12T07:40:00Z')));
    assert.equal(result.outcome,'success');
  });
  assert.equal(body.msgtype,'markdown');assert.match(body.markdown.content,/迷唇姐/);
});
test('HTTP 200 业务失败不记为成功；限流可以重试',async()=>{
  for(const code of [93000,45009])await withReceiver((req,res)=>res.end(JSON.stringify({errcode:code,errmsg:'failed'})),async url=>{
    const result=await sendWebhook(url,{msgtype:'text',text:{content:'测试'}});
    assert.equal(result.outcome,code===45009?'retry':'failed');
  });
});
test('响应不是合法成功结果时标记待确认，避免自动重复发群',async()=>{
  for(const body of ['not json','{"errcode":"0"}','{}']) await withReceiver((req,res)=>res.end(body),async url=>{
    assert.equal((await sendWebhook(url,{msgtype:'text',text:{content:'测试'}})).outcome,'uncertain');
  });
});
