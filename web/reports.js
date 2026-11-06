const routes=new Set(['live','alpha','swarm','history','catalog','guide']);
let pageRoute='live',refreshing=false,catalogLoading=false;
function phase(r){
 if(/^(removed|撤回|已撤回)$/i.test(r.reportedStatus||''))return'removed';
 if(/^(expired|ended|ended_early|结束|已结束|提前结束)$/i.test(r.reportedStatus||''))return'ended';
 const t=r.timing;if(!t||t.invalidOrder)return t?.invalidOrder?'invalid':'unknown';
 if(Number.isFinite(t.endAt)&&t.endAt<=Date.now())return'ended';
 if(Number.isFinite(t.startAt)&&t.startAt>Date.now())return'upcoming';
 return Number.isFinite(t.startAt)&&Number.isFinite(t.endAt)?'in-window':'unknown';
}
function phaseLabel(r){return{'in-window':'按推送时间计时中',ended:'按计时规则已结束',upcoming:'开始时间未到',unknown:'起止时间待确认',invalid:'时间异常，请核实',removed:'源站已撤回'}[phase(r)];}
function timings(r,box){
 const t=r.timing||{};const grid=element('dl',undefined,'report-times');
 for(const [name,value]of [['开始时间',t.startText||'源站未提供'],['结束时间',t.endText||'源站未提供']]){const row=element('div');row.append(element('dt',name),element('dd',value));grid.append(row);}
 if(t.basis==='receipt-policy'&&t.endAt>Date.now())box.append(element('p','剩余约 '+Math.ceil((t.endAt-Date.now())/60000)+' 分钟 · 共 '+t.durationMinutes+' 分钟','report-countdown'));
 box.append(grid,element('p',(t.startSource||'源站未提供')+'；'+(t.endSource||'源站未提供'),'note'),element('p','接收时间：'+date(r.receivedAt)+'（北京时间）','note'));
}
function reportDetail(r){
 if(r.details){detail(catalog.find(e=>e.key===r.details.key)||r.details);byId('detail-title').textContent=r.title;const timingBox=element('section');timings(r,timingBox);byId('detail-content').prepend(timingBox);}
 else{byId('detail-title').textContent=r.title;const box=byId('detail-content');box.replaceChildren();timings(r,box);box.append(element('p',r.regionZh+' · '+r.locationZh),element('p',r.kind==='swarm'?'群集没有匹配的额外资料，不借用头目招式。':'暂无准确匹配的资料，请到管理后台查看原始通知。','note'));byId('catalog-detail').showModal();}
}
function reportCard(r){
 const card=element('article',undefined,'card report-card '+r.kind);const top=element('div',undefined,'report-card-heading');top.append(element('h3',r.title),element('span',r.kind==='alpha'?'头目':r.kind==='swarm'?'群集':'未识别通知','report-kind '+r.kind));
 card.append(top,element('p',r.regionZh+' · '+r.locationZh,'report-place'),element('span',phaseLabel(r),'report-pill '+phase(r)));timings(r,card);
 if(r.swarmInfo){card.append(element('p','位置说明：'+r.swarmInfo.locationNotes));if(r.swarmInfo.captureProbability)card.append(element('p','来源提供的捕获概率：'+r.swarmInfo.captureProbability));}
 if(r.details){const info=element('div',undefined,'report-essentials');info.append(element('p','特性：'+r.details.abilityZh),element('p','招式：'+r.details.movesZh.join('、')),element('p','通行技能／HM：'+(r.details.hmsZh.join('、')||'源站未列出额外通行技能')));if(r.details.locationNotes)info.append(element('p','前往条件：'+r.details.locationNotes));card.append(info);}
 const button=element('button',r.details?'详细资料与位置图':'查看报点详情','quiet');button.addEventListener('click',()=>reportDetail(r));card.append(button);return card;
}
function filtered(){const q=byId('feed-search').value.trim().toLowerCase(),region=byId('feed-region').value,windowOnly=byId('feed-window').checked;return(current?.incoming||[]).filter(r=>(!q||searchable({...r,...r.details}).includes(q)||r.title.toLowerCase().includes(q))&&(!region||r.region===region)&&(!windowOnly||phase(r)==='in-window'));}
function fillFeed(id,rows,limit=50){const box=byId(id);box.replaceChildren();for(const r of rows.slice(0,limit))box.append(reportCard(r));if(!rows.length)box.append(element('p','暂无符合条件的报点。可调整筛选条件；新消息到达后会自动显示。','empty'));if(rows.length>limit)box.append(element('p','显示最近'+limit+'条，可在报点记录中筛选查看更多。','note'));}
function renderPanel(){
 if(!current)return;
 const rows=filtered();const scope=pageRoute==='alpha'?rows.filter(r=>r.kind==='alpha'):pageRoute==='swarm'?rows.filter(r=>r.kind==='swarm'):pageRoute==='live'?rows.filter(r=>['alpha','swarm'].includes(r.kind)&&!['ended','removed'].includes(phase(r))):pageRoute==='history'?rows.filter(r=>!byId('history-kind').value||r.kind===byId('history-kind').value):rows;byId('feed-count').textContent='最近24小时 '+(current.incoming||[]).length+' 条 · 当前栏目 '+scope.length+' 条';
 if(pageRoute==='live'){const recent=rows.filter(r=>!['ended','removed'].includes(phase(r)));fillFeed('live-alpha',recent.filter(r=>r.kind==='alpha'),10);fillFeed('live-swarm',recent.filter(r=>r.kind==='swarm'),10);}
 if(pageRoute==='alpha')fillFeed('alpha-feed',rows.filter(r=>r.kind==='alpha'));
 if(pageRoute==='swarm')fillFeed('swarm-feed',rows.filter(r=>r.kind==='swarm'));
 if(pageRoute==='history'){const kind=byId('history-kind').value,chosen=rows.filter(r=>!kind||r.kind===kind);fillFeed('history-feed',chosen,historyLimit);byId('more-history').hidden=chosen.length<=historyLimit;}
 if(pageRoute==='catalog')renderCatalog();
}
function route(name,{push=false,scroll=false}={}){
 pageRoute=routes.has(name)?name:'live';
 for(const panel of document.querySelectorAll('[data-page]'))panel.hidden=panel.dataset.page!==pageRoute;
 for(const a of document.querySelectorAll('nav [data-route]')){if(a.dataset.route===pageRoute)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 byId('feed-controls').hidden=['catalog','guide'].includes(pageRoute);
 if(push&&location.hash!=='#'+pageRoute)history.pushState(null,'','#'+pageRoute);
 renderPanel();
 if(scroll){window.scrollTo({top:0,behavior:'auto'});byId(pageRoute).querySelector('h2')?.focus({preventScroll:true});}
}
for(const a of document.querySelectorAll('[data-route]'))a.addEventListener('click',event=>{event.preventDefault();route(a.dataset.route,{push:true,scroll:true});});
addEventListener('hashchange',()=>route(location.hash.slice(1),{scroll:true}));addEventListener('popstate',()=>route(location.hash.slice(1),{scroll:true}));
for(const id of ['feed-search','feed-region','feed-window','history-kind'])byId(id).addEventListener('input',()=>{historyLimit=20;renderPanel();});
for(const id of ['catalog-search','catalog-region'])byId(id).addEventListener('input',()=>{catalogLimit=12;renderCatalog();});
byId('more-history').addEventListener('click',()=>{historyLimit+=20;renderPanel();});byId('more-catalog').addEventListener('click',()=>{catalogLimit+=12;renderCatalog();});byId('close-detail').addEventListener('click',()=>byId('catalog-detail').close());
function tick(){const now=new Date();byId('public-clock').textContent=now.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});byId('public-date').textContent=now.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});}
async function loadCatalog(){if(catalogLoading||catalog.length)return;catalogLoading=true;try{const r=await fetch('/api/public/catalog');if(!r.ok)throw Error('资料接口HTTP '+r.status);catalog=(await r.json()).entries;byId('catalog-total').textContent=new Set(catalog.map(e=>e.pokemon)).size+'种头目 · '+catalog.length+'个地点组合';if(pageRoute==='catalog')renderCatalog();}catch(e){byId('catalog-grid').replaceChildren(element('p','资料读取失败：'+e.message+'，稍后自动重试。','empty'));}finally{catalogLoading=false;}}
async function refresh(){if(refreshing)return;refreshing=true;try{const r=await fetch('/api/public');if(!r.ok)throw Error('报点接口HTTP '+r.status);current=await r.json();byId('public-error').hidden=true;byId('connection-text').textContent='官网主动推送模式';const latest=Math.max(0,...(current.incoming||[]).map(e=>e.receivedAt));byId('updated-at').textContent=latest?'最近接收 '+date(latest):'等待官网首次推送';renderPanel();}catch(e){byId('public-error').hidden=false;byId('public-error').textContent='报点暂未更新：'+e.message+'。已显示的记录保留，稍后重试。';}finally{refreshing=false;}void loadCatalog();}
route(location.hash.slice(1));tick();setInterval(tick,1000);setInterval(()=>void refresh(),10000);void refresh();void loadCatalog();
