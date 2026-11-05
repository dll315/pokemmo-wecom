import { WebsiteSource } from '../src/source.mjs';
import { Translator } from '../src/i18n.mjs';
import { applySwarmStatus, isActive } from '../src/events.mjs';
import { formatNotification } from '../src/wecom.mjs';
const source=new WebsiteSource(),translator=await Translator.load();
try{
  for(const kind of ['alpha','swarm']){
    // Read-only: this script never calls a robot webhook or creates queue state.
    const events=await source.history(kind,Date.now()-24*3600000);
    let checked=events[0];if(kind==='swarm'){
      checked=null;
      for(const candidate of events.slice(0,8)){
        const status=await source.swarmStatus(candidate);
        if(status.status==='missing'&&status.notification_id===null){console.log(JSON.stringify({skipped:candidate.id,reason:'源站状态记录缺失，不能确认为在场'}));continue;}
        checked=applySwarmStatus(candidate,status);break;
      }
      if(events.length&&!checked)throw new Error('最近8条明雷均无法从源站状态接口核实，不能确认兼容');
    }
    console.log(JSON.stringify({kind,rowsIn24Hours:events.length,latest:checked?{pokemon:translator.pokemon(checked.pokemon),region:translator.region(checked.region),location:translator.location(checked.location),reportedAt:new Date(checked.reportedAt).toISOString(),expiresAt:new Date(checked.expiresAt).toISOString(),status:checked.status,active:isActive(checked)}:null},null,2));
    if(checked&&Buffer.byteLength(formatNotification(checked,translator).markdown.content)>4096)throw new Error('通知长度超过限制');
  }
}finally{source.close();}
