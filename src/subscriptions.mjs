import {randomBytes,randomUUID} from 'node:crypto';
export function subscriptionView(s){const {token,...v}=s;return {...v,path:'/receive/'+token};}
export function saveSubscription(list,input,now){
 const old=input.id?list.find(s=>s.id===input.id):null;
 if(input.id&&!old)throw Error('订阅地址不存在');
 if(!old&&list.length>=20)throw Error('最多支持20个订阅地址');
 const name=input.name??old?.name;if(typeof name!=='string'||!name.trim()||name.trim().length>64||/[\x00-\x1f]/.test(name))throw Error('请填写不超过64字的订阅名称');
 if(input.rotate!==undefined&&typeof input.rotate!=='boolean')throw Error('更新地址选项无效');
 const s={...old,id:old?.id||randomUUID(),token:old&&!input.rotate?old.token:randomBytes(24).toString('hex'),name:name.trim(),createdAt:old?.createdAt||now};
 for(const k of ['enabled','alphas','swarms','phenos']){s[k]=input[k]??old?.[k]??true;if(typeof s[k]!=='boolean')throw Error('订阅开关格式无效');}
 return s;
}
