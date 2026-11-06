// Normalize transport envelopes without discarding the original receipt.
export function normalizePayload(input){
 let body=input;if(typeof body==='string'){try{body=JSON.parse(body);}catch{body={content:body};}}
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('无法识别报点：需要JSON对象');
 let obj={...body};const texts=[],embeds=[],typeEvidence=[];
 function visit(node,depth=0){if(depth>8||!node||typeof node!=='object')return;if(Array.isArray(node)){for(const n of node)visit(n,depth+1);return;}
  if(Array.isArray(node.embeds))embeds.push(...node.embeds);
  for(const [k,v]of Object.entries(node)){
   if(/^(?:kind|type|event|event_?(?:type|kind)|spawn_?type|encounter_?type|notification_?(?:type|kind|event)|category|报点类型|通知类型|类型)$/i.test(k)&&typeof v==='string')typeEvidence.push({field:k,value:v});
   if(/^(?:is_?(?:alpha|swarm|pheno|phenomenon))$/i.test(k)&&v===true)typeEvidence.push({field:k,value:k.replace(/^is_?/i,'')});
   if(/^(?:pheno_?type|phenomenon_?type|奇遇类型)$/i.test(k)&&typeof v==='string'&&v)typeEvidence.push({field:k,value:'pheno'});
   if(typeof v==='string'&&['caption','title','content','text','description','message','url','source_url','sourceUrl','click'].includes(k))texts.push(v);
   if(['data','payload','body','notification','event','message'].includes(k)&&v&&typeof v==='object'&&!Array.isArray(v))obj={...obj,...v};
   if(v&&typeof v==='object')visit(v,depth+1);
  }
 }
 visit(body);
 // Photo captions and plain-text field lines are part of the event, not decoration.
 for(const line of texts.join('\n').replace(/<[^>]*>/g,'').split('\n')){const m=/^\s*(?:\*\*)?([^:：\n]{1,40})[：:]\s*(.+)$/.exec(line);if(m&&!Object.hasOwn(obj,m[1].trim()))obj[m[1].trim()]=m[2].trim();}
 return {...obj,embeds,_typeEvidence:typeEvidence,content:[...new Set(texts)].join('\n')};
}
export function classifyPayload(pick,link,text,provided=[]){
 const labels={alpha:'头目',swarm:'群集',pheno:'奇遇'};
 function detect(value){const s=String(value||'').replace(/https?:\/\/\S+/gi,'');const matches=[];
 if(/(?:^|[^a-z])alphas?(?:$|[^a-z])|头目/i.test(s))matches.push('alpha');
 if(/(?:^|[^a-z])swarms?(?:$|[^a-z])|群集|群怪|集群|群聚|明雷|大量出现/i.test(s))matches.push('swarm');
 if(/(?:^|[^a-z])(?:pheno(?:mena|menon|s)?)(?:$|[^a-z])|奇遇|现象/i.test(s))matches.push('pheno');
 return matches;}
 const evidence=[...provided];
 for(const key of ['kind','notificationKind','notification_type','notificationType','type','eventType','event_type','event_kind','spawn_type','spawnType','encounterType','notification_event','event','category','报点类型','通知类型','类型']){const v=pick(key);if(typeof v==='string'&&v)evidence.push({field:key,value:v});}
 for(const [key,value]of [['isAlpha','alpha'],['is_alpha','alpha'],['isSwarm','swarm'],['is_swarm','swarm'],['isPheno','pheno'],['is_pheno','pheno']])if(pick(key)===true)evidence.push({field:key,value});
 const strong=new Set(evidence.flatMap(e=>detect(e.value)));
 const result=(kind,reason)=>({kind,label:labels[kind]||'报点',reason,evidence:evidence.filter(e=>detect(e.value).length)});
 if(strong.size>1)return result('unknown','明确类型字段冲突，停止自动转发');
 if(strong.size===1)return result([...strong][0],'源站明确类型字段');
 if(/^https:\/\/alpha\.pokemmotools\.org\/(?:alpha|swarm|pheno|phenomenon)-list(?:[?#]|$)/i.test(link)){const type=link.match(/\/(alpha|swarm|pheno|phenomenon)-list/i)[1].toLowerCase();return result(type==='phenomenon'?'pheno':type,'源站具体报点链接');}
 const topic=detect(pick('topic'));if(topic.length===1)return result(topic[0],'来源主题');
 const hints=detect(text);return hints.length===1?result(hints[0],'报点正文或图片说明'):result('unknown',hints.length>1?'正文包含多种类型，缺少明确类型字段':'未找到受支持的类型字段');
}
