import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
const event={key:'alpha:1',id:1,kind:'alpha',pokemon:'Jynx',region:'Unova',location:'Route 8',reportedAt:1,expiresAt:4500001,status:'active',verified:true};
const task=status=>({id:'t',key:'alpha:1',event,fingerprint:'x',status,createdAt:1,nextAttemptAt:0,attempts:1});

async function temporary(fn){const dir=await mkdtemp(join(tmpdir(),'pokemmo-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('保存队列和记录后重启仍能读取，发送中任务变为待确认',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.records['alpha:1']={event,fingerprint:'x'};s.state.outbox.push(task('sending'));s.save();s.close();
  const restored=new Store(dir);assert.equal(restored.state.records['alpha:1'].fingerprint,'x');assert.equal(restored.state.outbox[0].status,'uncertain');restored.close();
}));
test('同一个数据目录只允许一个实例写入',async()=>temporary(async dir=>{
  const s=new Store(dir);assert.throws(()=>new Store(dir),/运行|锁/);s.close();const other=new Store(dir);other.close();
}));
test('主状态损坏可以恢复备份；两份都坏时停止而非清空去重',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.records['alpha:1']={event,fingerprint:'x'};s.save();s.save();s.close();
  await writeFile(join(dir,'state.json'),'broken');const r=new Store(dir);assert.ok(r.state.records['alpha:1']);r.close();
  await writeFile(join(dir,'state.json'),'broken');await writeFile(join(dir,'state.backup.json'),'broken');assert.throws(()=>new Store(dir),/损坏/);
}));
test('网页公开状态必须移除机器人密钥',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.config.webhookUrl='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=SECRET';
  assert.equal(JSON.stringify(s.publicState()).includes('SECRET'),false);assert.equal(s.publicState().config.webhookConfigured,true);s.close();
}));
test('备份恢复时暂停推送并把可能回滚的待发送任务标为待确认',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.config.enabled=true;s.state.outbox.push(task('pending'));s.save();s.state.outbox[0].status='sending';s.save();s.close();
  await writeFile(join(dir,'state.json'),'broken');const r=new Store(dir);assert.equal(r.state.config.enabled,false);assert.equal(r.state.outbox[0].status,'uncertain');r.close();
}));
test('缺少嵌套来源字段的主文件不能覆盖有效备份',async()=>temporary(async dir=>{
  const s=new Store(dir);s.save();s.close();const path=join(dir,'state.json');const broken=JSON.parse(await readFile(path,'utf8'));broken.sources={};await writeFile(path,JSON.stringify(broken));
  const r=new Store(dir);assert.ok(r.state.sources.alpha);assert.ok(r.state.sources.swarm);r.close();
}));
test('待确认任务不会因为新增100条发送记录而从管理页面消失',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.outbox.push({...task('uncertain'),id:'old'});for(let i=0;i<105;i++)s.state.outbox.push({...task('sent'),id:'sent-'+i});
  assert.ok(s.publicState().tasks.some(t=>t.id==='old'));s.close();
}));
test('长期运行清理旧成功记录，但保留待确认任务及其去重记录',async()=>temporary(async dir=>{
  const s=new Store(dir);const now=10*86400000;s.state.outbox.push({...task('sent'),id:'old-success'}, {...task('uncertain'),id:'uncertain',key:'alpha:2',event:{...event,key:'alpha:2',id:2}});
  s.state.records['alpha:1']={event,fingerprint:'x',observedAt:1};s.state.records['alpha:2']={event:{...event,key:'alpha:2',id:2},fingerprint:'x',observedAt:1};
  s.prune(now);assert.deepEqual(s.state.outbox.map(t=>t.id),['uncertain']);assert.equal(s.state.records['alpha:1'],undefined);assert.ok(s.state.records['alpha:2']);s.close();
}));
test('最新头目不会被较新的群怪挤出后台通知预览列表',async()=>temporary(async dir=>{
  const s=new Store(dir);s.state.records[event.key]={event,fingerprint:'x'};
  for(let i=0;i<50;i++)s.state.records['swarm:'+i]={event:{...event,key:'swarm:'+i,kind:'swarm',id:i+1,reportedAt:1000+i},fingerprint:'x'};
  assert.equal(s.publicState().events[0].kind,'alpha');s.close();
}));
