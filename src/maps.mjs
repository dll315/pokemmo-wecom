import {readFileSync} from 'node:fs';
let manifest={};try{manifest=JSON.parse(readFileSync(new URL('../data/map-manifest.json',import.meta.url),'utf8'));}catch{}
export function mapInfo(value){
 if(typeof value!=='string'||!/^https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.(png|jpe?g|gif|webp)$/i.test(value))return{mapSourceUrl:null,mapPath:null};
 return{mapSourceUrl:value,mapPath:manifest[value]?.path||null};
}
export function mapAsset(path){return Object.values(manifest).find(m=>m.path===path)||null;}
