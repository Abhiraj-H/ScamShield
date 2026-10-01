import test from 'node:test';
import assert from 'node:assert/strict';
import {runToolAgent} from '../lib/agent.mjs';
const tool=name=>({type:'function',function:{name,description:'bound inputs',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}}});
const call=(id,name,args='{}')=>({id,type:'function',function:{name,arguments:args}});
const model=(calls=[])=>Response.json({id:'test-response',choices:[{message:calls.length?{tool_calls:calls}:{content:'done'}}],usage:{total_tokens:10}});
test('real tool outputs return to model, and it can request another tool',async()=>{
 const original=fetch;const bodies=[];const trace=[];const executed=[];
 try{
  globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);bodies.push(body);return bodies.length===1?model([call('one','check_rdap')]):model([call('two','check_upi')]);};
  const proof=await runToolAgent({config:{OPENAI_API_KEY:crypto.randomUUID()},context:{message:'redacted'},tools:[tool('check_rdap'),tool('check_upi')],execute:async name=>{executed.push(name);return [{id:'E-'+name,finding:'actual observation',weight:0,status:'unverified'}];},emit:async(...event)=>trace.push(event)});
  assert.deepEqual(executed,['check_rdap','check_upi']);assert.equal(proof.calls.length,2);
  assert.equal(bodies[1].messages.find(m=>m.role==='tool').tool_call_id,'one');
  assert.ok(bodies[1].messages.find(m=>m.role==='tool').content.includes('actual observation'));
  assert.ok(trace.some(t=>t[0]==='Observe'));assert.equal(proof.completed,false);
 }finally{globalThis.fetch=original;}
});
test('all first-round outputs receive a final model observation request',async()=>{
 const original=fetch;const bodies=[];
 try{globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);bodies.push(body);return bodies.length===1?model([call('one','check_upi')]):model();};const p=await runToolAgent({config:{OPENAI_API_KEY:crypto.randomUUID()},context:{},tools:[tool('check_upi')],execute:async()=>[{id:'E1',finding:'syntax only',status:'unverified',weight:0}],emit:async()=>{}});assert.equal(p.completed,true);assert.equal(bodies[1].tool_choice,'none');assert.ok(bodies[1].messages.some(m=>m.role==='tool'));}finally{globalThis.fetch=original;}
});
test('unknown tools, forged arguments and duplicate tool requests never execute',async()=>{
 const original=fetch;
 try{for(const calls of [[call('one','execute_shell')],[call('one','check_upi','{"host":"internal"}')],[call('one','check_upi'),call('two','check_upi')]]){let ran=false;globalThis.fetch=async()=>model(calls);await assert.rejects(()=>runToolAgent({config:{OPENAI_API_KEY:crypto.randomUUID()},context:{},tools:[tool('check_upi'),tool('check_rdap')],execute:async()=>{ran=true;return [];},emit:async()=>{}}));assert.equal(ran,false);}}finally{globalThis.fetch=original;}
});
test('provider failure preserves already-executed calls for safe fallback',async()=>{
 const original=fetch;let calls=0;
 try{globalThis.fetch=async()=>{if(++calls===1)return model([call('one','check_upi')]);throw new Error('offline');};await assert.rejects(()=>runToolAgent({config:{OPENAI_API_KEY:crypto.randomUUID()},context:{},tools:[tool('check_upi'),tool('check_rdap')],execute:async()=>[{id:'E1',finding:'actual',weight:0,status:'ok'}],emit:async()=>{}}),error=>error.proof.calls.length===1);}finally{globalThis.fetch=original;}
});
