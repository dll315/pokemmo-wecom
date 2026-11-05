import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebsiteSource } from '../src/source.mjs';
const fixtureNow=()=>Date.parse('2026-10-12T11:20:00Z');
const source=(origin,extra={})=>new WebsiteSource({origin,now:fixtureNow,...extra});

async function fixture(handler,fn){const s=createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${s.address().port}`;try{await fn(origin);}finally{await new Promise(r=>s.close(r));}}
function row(id,time='2026-10-12T11:10:04') {return{id,pokemon:'Blastoise',region:'Kanto',location:'Cape Brink',timestampIso:time,alphaUrl:'/swarm-list?pokemon=Blastoise&region=Kanto&location=Cape+Brink&timestamp=1791807904'};}
test('网站读取保留页面会话与 token，按时间分页而非递增编号',async()=>{
  const seen=[];
  await fixture((req,res)=>{
    const u=new URL(req.url,'http://fixture');
    if(u.pathname==='/swarm-history'){res.setHeader('Set-Cookie','session=fixture; Path=/; HttpOnly');res.end('<meta content="public-token" name="history-api-token">');return;}
    seen.push(req.headers);assert.match(req.headers.cookie,/session=fixture/);assert.match(req.headers.cookie,/tz=UTC/);assert.equal(req.headers['x-history-token'],'public-token');
    const page=+u.searchParams.get('page');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({historyData:page===1?[row(6105),row(6108,'2026-10-12T11:08:47')]:[row(6107,'2026-10-12T10:58:40')],totalRows:3,totalAllRows:3,page,pageSize:2,totalPages:2}));
  },async origin=>{
    const src=source(origin,{pageSize:2});
    const events=await src.history('swarm',Date.parse('2026-10-12T10:50:00Z'));
    assert.deepEqual(events.map(e=>e.id),[6105,6108,6107]);
    assert.equal(seen.length,2);
  });
});
test('HTTP200空壳响应不能当成“没有新报点”，刷新会话后仍失败要报错',async()=>{
  let pages=0;
  await fixture((req,res)=>{if(req.url.startsWith('/history')){pages++;res.end('<meta name="history-api-token" content="x">');}else res.end('{"historyData":[]}');},async origin=>{
    await assert.rejects(source(origin).history('alpha',0),/结构|数据/);assert.equal(pages,2);
  });
});
test('网站限流遵守 Retry-After，不能立即反复获取新会话',async()=>{
  let calls=0;
  await fixture((req,res)=>{calls++;res.writeHead(429,{'Retry-After':'120'});res.end('limited');},async origin=>{
    await assert.rejects(source(origin).history('alpha',0),e=>e.retryAfterMs===120000);assert.equal(calls,1);
  });
});
test('拒绝重定向到其他站点及超大网页响应',async()=>{
  await fixture((req,res)=>{res.writeHead(302,{Location:'http://example.invalid'});res.end();},async origin=>await assert.rejects(source(origin).history('alpha',0)));
});
test('群怪状态请求使用 name 和原始消失时间，返回权威状态',async()=>{
  await fixture((req,res)=>{
    const u=new URL(req.url,'http://fixture');assert.equal(u.searchParams.get('name'),'Blastoise');assert.equal(u.searchParams.get('despawn_timestamp'),'1791807904');
    res.end('{"status":"expired","notification_id":6105,"effective_despawn_timestamp":1791803704}');
  },async origin=>{
    const e={id:6105,kind:'swarm',pokemon:'Blastoise',region:'Kanto',location:'Cape Brink',reportedAt:Date.parse('2026-10-12T11:10:04Z'),originalExpiresAt:1791807904000};
    const status=await source(origin).swarmStatus(e);assert.equal(status.status,'expired');
  });
});
test('旧记录出现在第一页时仍读取后续页，使用 UTC 日期筛选限制请求范围',async()=>{
  let calls=0;
  await fixture((req,res)=>{
    if(req.url.startsWith('/swarm-history')){res.end('<meta name="history-api-token" content="x">');return;}
    const u=new URL(req.url,'http://fixture');calls++;assert.equal(u.searchParams.get('year'),'2026');assert.equal(u.searchParams.get('month'),'10');assert.equal(u.searchParams.get('day'),'12');const page=+u.searchParams.get('page');
    res.end(JSON.stringify({historyData:[row(page,page===1?'2026-10-12T11:00:04':'2026-10-12T11:10:04')],totalRows:2,totalAllRows:2,page,pageSize:1,totalPages:2}));
  },async origin=>{const events=await new WebsiteSource({origin,now:()=>Date.parse('2026-10-12T11:20:00Z')}).history('swarm',Date.parse('2026-10-12T11:05:00Z'));assert.deepEqual(events.map(e=>e.id),[2]);assert.equal(calls,2);});
});
