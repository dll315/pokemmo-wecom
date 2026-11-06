// Normalize transport envelopes without discarding the original receipt.
export function normalizePayload(input){
 let body=input;if(typeof body==='string'){try{body=JSON.parse(body);}catch{body={content:body};}}
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('无法识别报点：需要JSON对象');
 let obj={...body};const texts=[],embeds=[];
 function visit(node,depth=0){if(depth>8||!node||typeof node!=='object')return;if(Array.isArray(node)){for(const n of node)visit(n,depth+1);return;}
  if(Array.isArray(node.embeds))embeds.push(...node.embeds);
  for(const [k,v]of Object.entries(node)){
   if(typeof v==='string'&&['caption','title','content','text','description','message','url','source_url','sourceUrl','click'].includes(k))texts.push(v);
   if(['data','payload','body','notification','event','message'].includes(k)&&v&&typeof v==='object'&&!Array.isArray(v))obj={...obj,...v};
   if(v&&typeof v==='object')visit(v,depth+1);
  }
 }
 visit(body);
 // Photo captions and plain-text field lines are part of the event, not decoration.
 for(const line of texts.join('\n').replace(/<[^>]*>/g,'').split('\n')){const m=/^\s*(?:\*\*)?([^:：\n]{1,40})[：:]\s*(.+)$/.exec(line);if(m&&!Object.hasOwn(obj,m[1].trim()))obj[m[1].trim()]=m[2].trim();}
 return {...obj,embeds,content:[...new Set(texts)].join('\n')};
}
export function classifyPayload(pick,link,text){
 const detect=value=>{const s=String(value||'').replace(/https?:\/\/\S+/gi,'');const alpha=/(?:^|[^a-z])alphas?(?:$|[^a-z])|头目/i.test(s),swarm=/(?:^|[^a-z])swarms?(?:$|[^a-z])|群集|群怪|集群|群聚|明雷|大量出现/i.test(s);return alpha===swarm?null:alpha?'头目':'群集';};
 const explicit=detect(pick('kind','notificationKind','notification_type','notificationType','type','eventType','event_type','event','category','报点类型','通知类型','类型'));
 if(explicit)return explicit;
 if(pick('isAlpha','is_alpha')===true)return '头目';if(pick('isSwarm','is_swarm')===true)return '群集';
 if(/^https:\/\/alpha\.pokemmotools\.org\/alpha-list(?:[?#]|$)/i.test(link))return '头目';
 if(/^https:\/\/alpha\.pokemmotools\.org\/swarm-list(?:[?#]|$)/i.test(link))return '群集';
 return detect(pick('topic'))||detect(text)||'报点';
}
