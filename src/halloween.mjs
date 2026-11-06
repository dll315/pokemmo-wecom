const groups=[
 ['先机球',[['Gastly','鬼斯'],['Duskull','夜巡灵'],['Shuppet','怨影娃娃'],['Zubat','超音蝠'],['Hoothoot','咕咕'],['Spinarak','圆丝蛛'],['Ekans','阿柏蛇'],['Cubone','卡拉卡拉'],['Poochyena','土狼犬'],['Drowzee','催眠貘']]],
 ['高级球＋点到为止',[['Skorupi','钳尾蝎'],['Houndour','戴鲁比']]],
 ['高级球＋蘑菇孢子＋点到为止',[['Zorua','索罗亚'],['Umbreon','月亮伊布'],['Seviper','饭匙蛇'],['Gligar','天蝎']]],
 ['高级球＋蘑菇孢子＋浸水＋点到为止',[['Misdreavus','梦妖'],['Sableye','勾魂眼'],['Drifloon','飘飘球']]],
 ['高级球＋胃液/特性互换＋点到为止＋蘑菇孢子',[['Murkrow','黑暗鸦']]]
];
const methods=new Map(groups.flatMap(([method,species])=>species.flatMap(names=>names.map(name=>[name.toLowerCase(),method]))));
export function halloweenMethod(pokemon){return typeof pokemon==='string'?methods.get(pokemon.trim().toLowerCase())||null:null;}
export function applyHalloween(payload,{enabled=false,pokemon,kind}={}){
 const method=enabled&&['alpha','swarm','pheno'].includes(kind)?halloweenMethod(pokemon):null;
 if(!method||typeof payload.markdown?.content!=='string')return payload;
 const lines=payload.markdown.content.replace(/^\*\*捕捉方案｜[^\n]+\n(?:•[^\n]*(?:\n|$))+/gm,'').split('\n').filter(line=>!/^\*\*(?:捕获概率（[^）]*）|来源提供的捕获概率)：\*\*/.test(line));
 const position=lines.findIndex(line=>line.startsWith('**位置说明：**'));
 lines.splice(position<0?1:position+1,0,'**万圣节捕捉方法：** '+method);
 let content=lines.join('\n');
 if(Buffer.byteLength(content)>4096){const suffix='\n…（末尾内容已省略）',chars=Array.from(content);let bytes=Buffer.byteLength(content);while(bytes+Buffer.byteLength(suffix)>4096)bytes-=Buffer.byteLength(chars.pop());content=chars.join('')+suffix;}
 return{...payload,markdown:{...payload.markdown,content}};
}
