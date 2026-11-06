import {readFileSync,existsSync} from 'node:fs';
const dex=JSON.parse(readFileSync(new URL('../data/pokemon-natdex.json',import.meta.url)));
export function spritePath(pokemon){const n=Number(dex[pokemon.toLowerCase()]);return Number.isInteger(n)&&n>0&&n<=1025&&existsSync(new URL('../web/sprites/'+n+'.png',import.meta.url))?'/sprites/'+n+'.png':null;}
function list(v){if(Array.isArray(v))return v.map(String);if(typeof v!=='string'||!v)return[];try{const a=JSON.parse(v);if(Array.isArray(a))return a.map(String);}catch{}return v.replace(/^\[|\]$/g,'').split(/[,，、]/).map(s=>s.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);}
function capturePlans(pick){
 const balls={Friend:'友友球',Level:'等级球','Poké':'精灵球',Poke:'精灵球',Quick:'先机球',Ultra:'高级球',Great:'超级球',Dusk:'黑暗球',Timer:'计时球',Repeat:'重复球',Nest:'巢穴球',Net:'捕网球',Dive:'潜水球',Luxury:'豪华球',Premier:'纪念球',Heal:'治愈球',Master:'大师球'};
 const statuses={'Asleep':'睡眠','Normal':'正常','Paralyzed':'麻痹','Asleep or Paralyzed':'睡眠或麻痹','Frozen':'冰冻','Poisoned':'中毒','Burned':'灼伤'};
 return ['Cheapest','Fastest'].flatMap(key=>{const plan=pick(key);if(!plan||typeof plan!=='object'||!Array.isArray(plan.Ball))return[];
  return plan.Ball.flatMap(b=>{const chance=String(b.Chance||'');if(!/^\d{1,3}(?:\.\d+)?%$/.test(chance)||parseFloat(chance)>100)return[];
   return[{strategy:key==='Cheapest'?'省钱方案':'最快方案',ball:balls[b.Name]||String(b.Name||'未提供'),chance,hp:String(plan.HP||'未提供'),status:statuses[plan.Status]||String(plan.Status||'未提供')}];});
 });
}
export function eventProfile(pick,detail,tr,pokemon){
 const valueRatio=pick('maleRatio','male_ratio','Male Ratio','雄性比例');const rawRatio=valueRatio===''?detail?.['Male Ratio']:valueRatio;
 const ratio=rawRatio===undefined||rawRatio===''?null:Number(String(rawRatio).replace('%',''));
 const valueTier=pick('tier','shinyTier','shiny_tier','闪光等级 (Tier)','闪光等级','Tier');const rawTier=valueTier===''?detail?.Tier:valueTier;
 const tier=rawTier===undefined||rawTier===''?null:Number(rawTier);
 const ability=pick('ability','特性')||detail?.Ability;
 return{capturePlans:capturePlans(pick),sprite:spritePath(pokemon),maleRatio:ratio!==null&&Number.isFinite(ratio)&&ratio>=0&&ratio<=100?ratio:null,
 eggGroups:list(pick('eggGroups','egg_groups','Egg Group','蛋组')||detail?.['Egg Group']).map(s=>tr.lookup('egg-group',s)),
 abilityZh:ability?tr.lookup('ability',String(ability)):'',movesZh:list(pick('moves','moveset','配招','招式')||detail?.Moveset).map(s=>tr.lookup('move',s)),
 tier:tier!==null&&Number.isInteger(tier)&&tier>=0&&tier<=100?tier:null};
}
