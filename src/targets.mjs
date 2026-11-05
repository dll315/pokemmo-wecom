import { randomUUID } from 'node:crypto';
import { validateWebhook } from './wecom.mjs';

export function configuredTargets(config){
  if(config.targets?.length)return config.targets;
  return config.webhookUrl?[{id:'default',name:'默认机器人',url:config.webhookUrl,enabled:true,alphas:true,swarms:true}]:[];
}
export function upsertTarget(config,input){
  const targets=configuredTargets(config).map(t=>({...t}));const existing=input.id?targets.find(t=>t.id===input.id):null;
  if(input.id&&!existing)throw new Error('推送链接不存在');
  if(input.name!==undefined&&typeof input.name!=='string')throw new Error('链接名称必须为文字');
  const name=String(input.name??existing?.name??'').trim();if(!name||name.length>64||/[\x00-\x1f]/.test(name))throw new Error('请填写不超过64字的链接名称');
  const raw=input.url??'';if(typeof raw!=='string')throw new Error('推送链接格式无效');
  const url=raw.trim()?validateWebhook(raw.trim()):existing?.url;if(!url)throw new Error('新链接必须填写企业微信机器人地址');
  const target={id:existing&&existing.url===url?existing.id:randomUUID(),name,url};
  for(const key of ['enabled','alphas','swarms']){target[key]=input[key]??existing?.[key]??true;if(typeof target[key]!=='boolean')throw new Error('链接开关格式无效');}
  if(targets.some(t=>t!==existing&&t.url===url))throw new Error('这个机器人地址已经添加，避免重复推送');
  if(!existing&&targets.length>=20)throw new Error('最多支持20个推送链接');
  if(existing)targets.splice(targets.indexOf(existing),1,target);else targets.push(target);
  return{...config,targets,webhookUrl:targets.find(t=>t.id==='default')?.url||''};
}
export function deleteTarget(config,id){
  const targets=configuredTargets(config);if(!targets.some(t=>t.id===id))throw new Error('推送链接不存在');
  const remaining=targets.filter(t=>t.id!==id);return{...config,targets:remaining,enabled:remaining.length?config.enabled:false,webhookUrl:remaining.find(t=>t.id==='default')?.url||''};
}
export function targetView(target){const{id,name,enabled,alphas,swarms}=target;return{id,name,enabled,alphas,swarms,urlConfigured:!!target.url};}

export function setLegacyWebhook(config,value){
  const url=validateWebhook(value);const targets=configuredTargets(config).map(t=>({...t}));
  const previous=targets.find(t=>t.id==='default'||(config.webhookUrl&&t.url===config.webhookUrl));
  if(targets.some(t=>t!==previous&&t.url===url))throw new Error('这个机器人地址已经添加，避免重复推送');
  if(!previous&&targets.length>=20)throw new Error('最多支持20个推送链接');
  const target={id:previous?.url===url?previous.id:randomUUID(),name:previous?.name||'默认机器人',url,enabled:true,alphas:true,swarms:true};
  if(previous)targets.splice(targets.indexOf(previous),1,target);else targets.push(target);
  return{...config,webhookUrl:url,targets};
}
