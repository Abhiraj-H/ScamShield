// Fixed provider endpoints. Credentials and opaque model context stay server-side.
export const DEFAULT_GEMINI_MODEL='gemini-3.5-flash-lite';
export function modelConfig(config={}) {
 const selected=config.LLM_PROVIDER|| (config.GEMINI_API_KEY?'gemini':config.OPENAI_API_KEY?'openai':'none');
 if(selected==='gemini')return config.GEMINI_API_KEY?{provider:'gemini',key:config.GEMINI_API_KEY,model:config.GEMINI_MODEL||DEFAULT_GEMINI_MODEL}:null;
 if(selected==='openai')return config.OPENAI_API_KEY?{provider:'openai',key:config.OPENAI_API_KEY,model:config.OPENAI_MODEL||'gpt-4.1-mini'}:null;
 return null;
}
function geminiPayload(body) {
 const contents=[];const names=new Map();const nativeIds=new Map();const systems=[];
 for(const message of body.messages) {
  if(message.role==='system'){systems.push({text:message.content});continue;}
  let parts=[];let role=message.role==='assistant'?'model':'user';
  if(message.role==='tool') {
   const name=names.get(message.tool_call_id);if(!name)throw new Error('Tool result has no matching request.');
   let response;try{response=JSON.parse(message.content);}catch{response={result:message.content};}
   parts=[{functionResponse:{name,...(nativeIds.get(message.tool_call_id)?{id:nativeIds.get(message.tool_call_id)}:{}),response}}];
  }else if(message.native_parts){
   // Replay the original parts, including Gemini thought signatures, verbatim.
   // Signatures are protocol context; they are never rendered as reasoning.
   parts=message.native_parts;
   for(const call of message.tool_calls||[]){names.set(call.id,call.function.name);const native=parts.find(p=>p.functionCall?.name===call.function.name);nativeIds.set(call.id,native?.functionCall?.id);}
  }else{
   if(typeof message.content==='string')parts.push({text:message.content});
   else if(Array.isArray(message.content))for(const part of message.content){
    if(part.type==='text')parts.push({text:part.text});
    else if(part.type==='image_url'){const image=part.image_url.url.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);if(!image)throw new Error('Only validated inline screenshots are supported.');parts.push({inlineData:{mimeType:image[1],data:image[2]}});}
   }
   for(const call of message.tool_calls||[]){names.set(call.id,call.function.name);parts.push({functionCall:{name:call.function.name,args:JSON.parse(call.function.arguments)}});}
  }
  if(!parts.length)continue;
  if(contents.at(-1)?.role===role)contents.at(-1).parts.push(...parts);else contents.push({role,parts:[...parts]});
 }
 const functions=(body.tools||[]).map(({function:f})=>({name:f.name,description:f.description,...(Object.keys(f.parameters?.properties||{}).length?{parameters:f.parameters}:{})}));
 return {contents,...(systems.length?{systemInstruction:{parts:systems}}:{}),generationConfig:{temperature:body.temperature??0,maxOutputTokens:2048,...(body.response_format?{responseMimeType:'application/json'}:{})},...(functions.length?{tools:[{functionDeclarations:functions}],toolConfig:{functionCallingConfig:{mode:body.tool_choice==='required'?'ANY':body.tool_choice==='none'?'NONE':'AUTO'}}}:{})};
}
export async function requestModel(config,body,timeout=15000) {
 const provider=modelConfig(config);if(!provider)throw new Error('Model provider is not configured.');
 let endpoint,headers,payload;
 if(provider.provider==='gemini'){
  if(!/^[a-zA-Z0-9._-]{1,120}$/.test(provider.model))throw new Error('Invalid Gemini model name.');
  endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+provider.model+':generateContent';
  headers={'Content-Type':'application/json','x-goog-api-key':provider.key};payload=geminiPayload(body);
 }else{
  endpoint='https://api.openai.com/v1/chat/completions';headers={'Content-Type':'application/json',Authorization:'Bearer '+provider.key};
  payload={...body,model:provider.model,messages:body.messages.map(({native_parts,...message})=>message)};
 }
 const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout)});
 if(!res.ok){const kind=res.status===429?'quota or rate limit reached':res.status===401||res.status===403?'key rejected or model access denied':'service unavailable';throw new Error(`${provider.provider}: ${kind} (HTTP ${res.status}).`);}
 const data=await res.json();if(provider.provider==='openai')return data;
 const candidate=data.candidates?.[0];const parts=candidate?.content?.parts;
 if(!parts?.length)throw new Error('Gemini returned no usable response.');
 if(candidate.finishReason && !['STOP','MAX_TOKENS'].includes(candidate.finishReason))throw new Error('Gemini could not complete this request.');
 const calls=parts.filter(p=>p.functionCall).map(({functionCall:f},index)=>({id:f.id||`gemini-${data.responseId||crypto.randomUUID()}-${index}`,type:'function',function:{name:f.name,arguments:JSON.stringify(f.args||{})}}));
 return {id:data.responseId||null,usage:data.usageMetadata||null,choices:[{message:{role:'assistant',content:parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join(''),native_parts:parts,...(calls.length?{tool_calls:calls}:{})}}]};
}
