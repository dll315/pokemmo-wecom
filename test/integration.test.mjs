import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { WebsiteSource } from '../src/source.mjs';
import { Monitor } from '../src/monitor.mjs';
import { Translator } from '../src/i18n.mjs';
import { sendWebhook } from '../src/wecom.mjs';

test('完整网站读取→群怪核实→持久化队列→中文机器人消息→重启去重→提前结束更正',async()=>{
  let now=Date.parse('2026-10-12T07:40:00Z'),ended=false;
  const alpha={id:4927,pokemon:'Jynx',region:'Unova',location:'Route 8',timestampIso:'2026-10-12T07:36:15',alphaUrl:'/alpha-list?pokemon=Jynx&region=Unova&location=Route+8&timestamp=1791795075'};
  const swarm={id:6105,pokemon:'Blastoise',region:'Kanto',location:'Cape Brink',timestampIso:'2026-10-12T07:37:00',alphaUrl:'/swarm-list?pokemon=Blastoise&region=Kanto&location=Cape+Brink&timestamp=1791795120'};
  const received=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/robot'){
      let raw='';for await(const chunk of req)raw+=chunk;received.push(JSON.parse(raw));res.end('{"errcode":0,"errmsg":"ok"}');return;
    }
    if(['/history','/swarm-history'].includes(req.url)){res.setHeader('Set-Cookie','session=fixture; Path=/; HttpOnly');res.end('<meta name="history-api-token" content="fixture-token">');return;}
    if(req.url.startsWith('/api/swarm-call-status')){res.end(JSON.stringify({status:ended?'ended_early':'active',notification_id:6105,effective_despawn_timestamp:Date.parse('2026-10-12T07:42:00Z')/1000}));return;}
    assert.equal(req.headers['x-history-token'],'fixture-token');assert.match(req.headers.cookie,/session=fixture/);assert.match(req.headers.cookie,/tz=UTC/);
    res.end(JSON.stringify({historyData:[req.url.startsWith('/api/history-data')?alpha:swarm],totalRows:1,totalAllRows:1,page:1,pageSize:100,totalPages:1}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const dir=await mkdtemp(join(tmpdir(),'pokemmo-integration-'));let store=new Store(dir),source=new WebsiteSource({origin,now:()=>now});
  const tr=await Translator.load();let monitor;
  const makeMonitor=()=>new Monitor({store,source,translator:tr,now:()=>now,send:(_url,payload)=>sendWebhook(origin+'/robot',payload)});
  try{
    Object.assign(store.state.config,{enabled:true,webhookUrl:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture'});monitor=makeMonitor();
    await monitor.observe(await source.history('alpha',now-3600000));await monitor.observe(await source.history('swarm',now-3600000));
    await monitor.deliverOne();now+=3500;await monitor.deliverOne();assert.equal(received.length,2);
    assert.match(received[0].markdown.content,/迷唇姐/);assert.match(received[0].markdown.content,/16:51:15/);
    assert.match(received[1].markdown.content,/水箭龟/);assert.match(received[1].markdown.content,/歧波海湾/);assert.equal(received[1].markdown.content.includes('时间'),false);
    store.close();store=new Store(dir);monitor=makeMonitor();now+=3500;
    await monitor.observe(await source.history('swarm',now-3600000));await monitor.deliverOne();assert.equal(received.length,2);
    ended=true;await monitor.observe(await source.history('swarm',now-3600000));await monitor.deliverOne();assert.equal(received.length,3);assert.match(received[2].markdown.content,/报点更正/);assert.match(received[2].markdown.content,/提前结束/);
    await monitor.observe(await source.history('swarm',now-3600000));now+=3500;await monitor.deliverOne();assert.equal(received.length,3);
  }finally{source.close();store.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
