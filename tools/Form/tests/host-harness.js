// The working test's SDK AppBridge host, with controllable delivery and host context.
import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
window.__log=[];
window.startHost=async (html,args,result,options={})=>{
 const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts allow-forms');frame.style.cssText='width:100%;height:4000px;border:0';document.body.append(frame);
 const bridge=new AppBridge(null,{name:options.name??'chatgpt',version:'0'},{message:{text:{}},updateModelContext:{text:{}}},{hostContext:options.theme?{theme:options.theme}:{}});
 bridge.onmessage=async params=>{window.__log.push({kind:'message',params});if(options.messageThrows)throw Error('test message refusal');return options.messageFails?{isError:true}:{};};
 bridge.onupdatemodelcontext=async params=>{window.__log.push({kind:'context',params});if(options.contextFails)throw Error('test context refusal');return {};};
 bridge.onrequestdisplaymode=async params=>{window.__log.push({kind:'display-mode',params});return {mode:'inline'};};
 bridge.onsizechange=params=>window.__log.push({kind:'size',params});
 bridge.oninitialized=()=>{
  window.__log.push({kind:'initialized'});
  if(options.hold)return;
  if(options.cancel){bridge.sendToolCancelled({reason:'test cancel'});return;}
  if(options.resultFirst){bridge.sendToolResult(result);bridge.sendToolInput({arguments:args});}
  else{bridge.sendToolInput({arguments:args});bridge.sendToolResult(result);}
 };
 window.__bridge=bridge;
 await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));
 frame.srcdoc=html;
 await new Promise(r=>frame.addEventListener('load',r,{once:true}));
};
