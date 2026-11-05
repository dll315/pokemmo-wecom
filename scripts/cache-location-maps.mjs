// Offline release preparation only. The deployed server never fetches arbitrary image URLs.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=new URL('../',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('data/alpha-catalog.json',root)));
const urls=[...new Set(Object.values(data).flatMap(ls=>Object.values(ls).flatMap(ps=>ps.map(p=>p.data?.['Map Link']).filter(Boolean))))];
await fs.mkdir(new URL('web/maps/',root),{recursive:true});
const manifest={};let cursor=0;
async function worker(){while(cursor<urls.length){const source=urls[cursor++];if(!/^https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.(png|jpe?g|gif|webp)$/i.test(source))continue;const name=source.split('/').at(-1),file=new URL('web/maps/'+name,root);
try{const {stdout}=await exec(process.platform==='win32'?'curl.exe':'curl',['-sS','--location','--connect-timeout','8','--max-time','20','--max-filesize','5242880','-o',file.pathname.replace(/^\/(\w:)/,'$1'),'-w','%{http_code} %{content_type}',source],{timeout:25000});const bytes=await fs.readFile(file);
const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216,gif=bytes.subarray(0,3).toString()==='GIF',webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
if(!stdout.startsWith('200 ')||!(png||jpg||gif||webp)||bytes.length>5242880)throw Error('无有效图片响应');
manifest[source]={path:'/maps/'+name,mime:png?'image/png':jpg?'image/jpeg':gif?'image/gif':'image/webp',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),downloadedAt:new Date().toISOString()};console.log('OK '+name+' '+bytes.length);
}catch(e){await fs.rm(file,{force:true});console.log('Unavailable '+name+' '+e.message.split('\n')[0]);}}}
await Promise.all(Array.from({length:4},worker));await fs.writeFile(new URL('data/map-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({sources:urls.length,cached:Object.keys(manifest).length}));
