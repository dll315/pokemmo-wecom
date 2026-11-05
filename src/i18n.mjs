import { readFile } from 'node:fs/promises';
export class Translator {
  constructor(maps={}){this.maps=maps;}
  lookup(type,value){const m=this.maps[type]||{};return typeof m[value]==='string'&&m[value].trim()?m[value]:value;}
  pokemon(value){return this.lookup('pokemon',value);}
  region(value){return this.lookup('region',value);}
  location(value){return this.lookup('location',value);}
  static async load(directory){
    const maps={};
    for(const name of ['pokemon','region','location','ability','move','notes','egg-group'])maps[name]=JSON.parse(await readFile(new URL(`../data/${name}-zh.json`,import.meta.url),'utf8'));
    if(directory){try{const extra=JSON.parse(await readFile(`${directory}/translations.json`,'utf8'));for(const name of Object.keys(maps))Object.assign(maps[name],extra[name]||{});}catch(e){if(e.code!=='ENOENT')throw new Error('自定义中文翻译文件无法读取');}}
    return new Translator(maps);
  }
}
export function beijingTime(ms){
  const d=new Date(ms+8*3600000);return d.toISOString().slice(0,19).replace('T',' ');
}
