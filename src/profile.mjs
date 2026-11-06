import {readFileSync,existsSync} from 'node:fs';
const dex=JSON.parse(readFileSync(new URL('../data/pokemon-natdex.json',import.meta.url)));
export function spritePath(pokemon){const n=Number(dex[pokemon.toLowerCase()]);return Number.isInteger(n)&&n>0&&n<=1025&&existsSync(new URL('../web/sprites/'+n+'.png',import.meta.url))?'/sprites/'+n+'.png':null;}
function list(v){if(Array.isArray(v))return v.map(String);if(typeof v!=='string'||!v)return[];try{const a=JSON.parse(v);if(Array.isArray(a))return a.map(String);}catch{}return v.replace(/^\[|\]$/g,'').split(/[,，、]/).map(s=>s.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);}
export function eventProfile(pick,detail,tr,pokemon){
 const valueRatio=pick('maleRatio','male_ratio','Male Ratio','雄性比例');const rawRatio=valueRatio===''?detail?.['Male Ratio']:valueRatio;
 const ratio=rawRatio===undefined||rawRatio===''?null:Number(String(rawRatio).replace('%',''));
 const valueTier=pick('tier','shinyTier','shiny_tier','闪光等级 (Tier)','闪光等级','Tier');const rawTier=valueTier===''?detail?.Tier:valueTier;
 const tier=rawTier===undefined||rawTier===''?null:Number(rawTier);
 const ability=pick('ability','特性')||detail?.Ability;
 return{sprite:spritePath(pokemon),maleRatio:ratio!==null&&Number.isFinite(ratio)&&ratio>=0&&ratio<=100?ratio:null,
 eggGroups:list(pick('eggGroups','egg_groups','Egg Group','蛋组')||detail?.['Egg Group']).map(s=>tr.lookup('egg-group',s)),
 abilityZh:ability?tr.lookup('ability',String(ability)):'',movesZh:list(pick('moves','moveset','配招','招式')||detail?.Moveset).map(s=>tr.lookup('move',s)),
 tier:tier!==null&&Number.isInteger(tier)&&tier>=0&&tier<=100?tier:null};
}
