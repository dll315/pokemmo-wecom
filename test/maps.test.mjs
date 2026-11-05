import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mapInfo,mapAsset} from '../src/maps.mjs';
import {buildCatalog} from '../src/public.mjs';
import {Translator} from '../src/i18n.mjs';
test('随包地图确为可读取的图片，清单哈希与文件一致，覆盖源站已提供的位置图',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../data/map-manifest.json',import.meta.url)));
 assert.equal(Object.keys(manifest).length,38);
 for(const [source,m]of Object.entries(manifest)){assert.match(source,/^https:\/\/i\.imgur\.com\//);const b=readFileSync(new URL('../web'+m.path,import.meta.url));assert.equal(createHash('sha256').update(b).digest('hex'),m.sha256);assert.equal(b.length,m.bytes);assert.match(m.mime,/^image\//);assert.equal(mapAsset(m.path).sha256,m.sha256);}
});
test('未知图片URL和目录穿越不会成为可服务的图片路径',()=>{
 assert.equal(mapInfo('http://127.0.0.1/private').mapPath,null);assert.equal(mapInfo('javascript:alert(1)').mapPath,null);assert.equal(mapAsset('/maps/../../.env'),null);
});
test('地图只按精灵地区地点关联，缺失位置图片不借用其他地点',async()=>{
 const tr=await Translator.load();const data=JSON.parse(readFileSync(new URL('../data/alpha-catalog.json',import.meta.url)));
 const catalog=buildCatalog(data,tr);const mapped=catalog.find(e=>e.pokemon==='Lairon'&&e.location==='Granite Cave');assert.ok(mapped.mapPath);assert.match(mapped.mapSourceUrl,/TptOIBx/);
 assert.equal(catalog.find(e=>e.pokemon==='Jynx'&&e.region==='Unova'&&e.location==='Route 8').mapPath,null);
});
