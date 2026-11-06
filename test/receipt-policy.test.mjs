import test from 'node:test';import assert from 'node:assert/strict';
import {Translator} from '../src/i18n.mjs';import {formatIncoming} from '../src/incoming-format.mjs';
const tr=await Translator.load(),receivedAt=Date.parse('2026-11-05T15:50:00Z');
test('头目从收到推送时刻起算75分钟，跨天仍准确，不使用上游起止覆盖',()=>{
 const r=formatIncoming({kind:'alpha',pokemon:'Jynx',region:'Unova',startAt:'2026-11-01T00:00:00Z',endAt:'2026-11-01T01:00:00Z'},tr,{receivedAt});assert.equal(r.timing.startAt,receivedAt);assert.equal(r.timing.endAt,receivedAt+75*60000);assert.equal(r.timing.durationMinutes,75);assert.match(r.timing.endText,/2026\/11\/6 01:05/);assert.equal(r.timing.durationMinutes,75);
});
test('群集从收到推送起算15分钟，即使上游未提供时间也有结束时间',()=>{
 const r=formatIncoming({kind:'swarm',pokemon:'Pikachu',region:'Kanto'},tr,{receivedAt});assert.equal(r.timing.startAt,receivedAt);assert.equal(r.timing.endAt,receivedAt+15*60000);assert.equal(r.timing.basis,'receipt-policy');assert.match(r.payload.markdown.content,/结束时间/);
});
test('未知通知不套用头目或群集的固定时长',()=>{const r=formatIncoming({content:'未知通知'},tr,{receivedAt});assert.equal(r.timing.durationMinutes,undefined);assert.equal(r.timing.endAt,null);});
