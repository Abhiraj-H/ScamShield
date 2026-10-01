import test from 'node:test';
import assert from 'node:assert/strict';
import {modelConfig,requestModel} from '../lib/llm.mjs';
import {runToolAgent} from '../lib/agent.mjs';
import {analyze} from '../lib/engine.mjs';
const tool={type:'function',function:{name:'check_upi',description:'UPI syntax only',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}}};
const config={LLM_PROVIDER:'gemini',GEMINI_API_KEY:crypto.randomUUID()};
const response=parts=>Response.json({responseId:'provider-response',candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{totalTokenCount:12}});
test('Gemini explicit selection never silently falls back to OpenAI',()=>{
 assert.equal(modelConfig({LLM_PROVIDER:'gemini',OPENAI_API_KEY:crypto.randomUUID()}),null);
 assert.equal(modelConfig({...config,OPENAI_API_KEY:crypto.randomUUID()}).provider,'gemini');
 assert.equal(modelConfig(config).model,'gemini-3.5-flash-lite');
});
test('Gemini loop returns actual tool output with opaque signatures intact',async()=>{
 const original=fetch;const requests=[];const executions=[];
 const native={functionCall:{name:'check_upi',args:{}},thoughtSignature:'opaque-test-signature'};
 try{
  globalThis.fetch=async(url,opts)=>{requests.push({url,headers:opts.headers,body:JSON.parse(opts.body)});return requests.length===1?response([native]):response([{text:'Done.'}]);};
  const proof=await runToolAgent({config,context:{message:'masked'},tools:[tool],execute:async name=>{executions.push(name);return [{id:'E1',finding:'No account ownership verification',weight:0,status:'unverified'}];},emit:async()=>{}});
  assert.equal(proof.provider,'gemini');assert.equal(proof.completed,true);assert.deepEqual(executions,['check_upi']);
  for(const request of requests){assert.ok(request.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));assert.ok(!request.url.includes(config.GEMINI_API_KEY));assert.equal(request.headers['x-goog-api-key'],config.GEMINI_API_KEY);}
  assert.equal(requests[0].body.toolConfig.functionCallingConfig.mode,'ANY');
  assert.deepEqual(requests[1].body.contents.find(c=>c.role==='model').parts,[native]);
  assert.match(JSON.stringify(requests[1].body.contents.find(c=>c.parts.some(p=>p.functionResponse))),/No account ownership verification/);
  assert.ok(!JSON.stringify(proof).includes('opaque-test-signature'));
 }finally{globalThis.fetch=original;}
});
test('Gemini classifier and tool agent work through the shared engine',async()=>{
 const original=fetch;const requests=[];
 try{globalThis.fetch=async(url,opts)=>{assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));const body=JSON.parse(opts.body);requests.push(body);if(body.generationConfig.responseMimeType)return response([{text:'{"type":"upi_refund","tools":["upi"]}'}]);if(body.tools)return response([{functionCall:{name:'check_upi',args:{}}}]);return response([{text:'Done'}]);};
 const result=await analyze({text:'Pay merchant@ybl. OTP is 123456.'},config);
 assert.equal(result.mode,'AI-assisted');assert.equal(result.agent.provider,'gemini');assert.equal(result.agent.calls[0].name,'check_upi');assert.equal(result.agent.completed,true);
 assert.ok(!JSON.stringify(requests).includes('123456'));assert.ok(result.trace.some(r=>r.actor==='model'));assert.ok(result.evidence.some(e=>e.tool==='UPI parser'&&/syntax/i.test(e.finding)));
 }finally{globalThis.fetch=original;}
});
test('Gemini quota failures fall back visibly without leaking provider payloads',async()=>{
 const original=fetch;
 try{globalThis.fetch=async()=>Response.json({error:{message:config.GEMINI_API_KEY}},{status:429});const r=await analyze({text:'OTP now'},config);assert.equal(r.mode,'rules');assert.ok(r.trace.some(t=>/quota reached/.test(t.summary)));assert.ok(!JSON.stringify(r).includes(config.GEMINI_API_KEY));}finally{globalThis.fetch=original;}
});
test('Gemini access denial stops model calls and exposes a safe fallback',async()=>{
 const original=fetch;let requests=0;
 try{globalThis.fetch=async()=>{requests++;return Response.json({error:{message:config.GEMINI_API_KEY}},{status:403});};const r=await analyze({text:'Send OTP now. Pay merchant@ybl.'},config);assert.equal(requests,1);assert.equal(r.mode,'rules');assert.equal(r.agent.completed,false);assert.deepEqual(r.agent.calls,[]);assert.ok(r.trace.some(t=>/Model access denied/.test(t.summary)));assert.ok(!JSON.stringify(r).includes(config.GEMINI_API_KEY));}finally{globalThis.fetch=original;}
});
test('Gemini vision maps validated inline images and rejects invented model paths',async()=>{
 const original=fetch;let body;
 try{globalThis.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return response([{text:'{"text":"test"}'}]);};await requestModel(config,{response_format:{type:'json_object'},messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]});assert.equal(body.contents[0].parts[0].inlineData.mimeType,'image/png');await assert.rejects(()=>requestModel({...config,GEMINI_MODEL:'../../other'},{messages:[]}),/Invalid Gemini model/);}finally{globalThis.fetch=original;}
});
