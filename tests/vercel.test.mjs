import test from 'node:test';
import assert from 'node:assert/strict';
import {handlers,publicInput} from '../lib/vercel-api.mjs';
import {createSecurityStore,redisConfig,QUOTA_SCRIPT,AUDIT_SCRIPT} from '../lib/vercel-store.mjs';
import {signAudit} from '../lib/security.mjs';

const env={UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'fixture',SCAMSHIELD_AUDIT_KEY:'x'.repeat(64)};
function memoryRedis() {
 const values=new Map(),rows=[]; let alive=true;
 const transport=async(_url,options)=>{
  await new Promise(resolve=>setImmediate(resolve));
  if(!alive)throw new Error('offline');
  const [name,...args]=JSON.parse(options.body);let result;
  if(name==='PING')result='PONG';
  else if(name==='GET')result=values.get(args[0])??null;
  else if(name==='EVAL'&&args[0]===QUOTA_SCRIPT){const keys=args.slice(2,5);const limits=[6,20,200];result=keys.every((key,i)=>(values.get(key)||0)<limits[i])?1:0;if(result)for(const key of keys)values.set(key,(values.get(key)||0)+1);}
  else if(name==='EVAL'&&args[0]===AUDIT_SCRIPT){const [head,_events,previous,digest,row]=args.slice(2);result=(values.get(head)||'0'.repeat(64))===previous?1:0;if(result){rows.push(JSON.parse(row));values.set(head,digest);}}
  else throw new Error('unexpected command');
  return Response.json({result});
 };
 return {transport,rows,values,stop(){alive=false;}};
}
const payload={text:'Please share OTP and send money to test@ybl',lang:'hi',answers:{paid:false}};
function request(value=payload,options={}) {
 return new Request('https://scamshield.example/analyze',{method:'POST',headers:{'content-type':'application/json','x-scamshield-request':'1',origin:'https://scamshield.example',...options.headers},body:JSON.stringify(value)});
}
function fixture(options={}) {
 const database=memoryRedis();let called=0;
 const app=handlers({env,storeFactory:()=>createSecurityStore(env,database.transport),runAnalysis:async(input,_env,hooks={})=>{called++;hooks.onTrace?.({tool:'fixture',summary:'Observation',status:'ok'});return {text:input.text,verdict:'Suspicious'};},...options});
 return {database,app,calls:()=>called};
}
test('Vercel rejects cross-site and malformed input before model work',async()=>{
 const f=fixture();
 for(const req of [request(payload,{headers:{origin:'https://evil.example'}}),request(payload,{headers:{'sec-fetch-site':'cross-site'}}),request(payload,{headers:{'x-scamshield-request':'0'}})])assert.equal((await f.app.analyzeRequest(req)).status,403);
 for(const input of [{...payload,text:'x'.repeat(4001)},{...payload,image:'data:image/png;base64,abc'},{...payload,id:'forged'},{...payload,lang:'xx'},{...payload,answers:{paid:'yes'}},{...payload,answers:{amount:-1}},{...payload,answers:{arbitrary:true}}])assert.equal((await f.app.analyzeRequest(request(input))).status,400);
 assert.equal(f.calls(),0);assert.equal(f.database.rows.length,0);
});
test('Vercel request byte limit and JSON errors are enforced',async()=>{
 const f=fixture();
 assert.equal((await f.app.analyzeRequest(request({...payload,text:'x'.repeat(25000)}))).status,413);
 const broken=new Request('https://scamshield.example/analyze',{method:'POST',headers:{'content-type':'application/json','x-scamshield-request':'1'},body:'{'});
 assert.equal((await f.app.analyzeRequest(broken)).status,400);assert.equal(f.calls(),0);
});
test('Vercel durable storage and signing key fail closed',async()=>{
 const f=fixture();f.database.stop();assert.equal((await f.app.analyzeRequest(request())).status,503);assert.equal(f.calls(),0);
 assert.equal((await f.app.health(new Request('https://scamshield.example/health'))).status,503);
 assert.throws(()=>createSecurityStore({...env,SCAMSHIELD_AUDIT_KEY:''}),/unavailable/);
 assert.throws(()=>redisConfig({...env,UPSTASH_REDIS_REST_URL:'http://127.0.0.1'}),/unavailable/);
 assert.throws(()=>redisConfig({...env,UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io.evil.example'}),/unavailable/);
});
test('Separate function instances share quota and rejected calls cannot reach model',async()=>{
 const db=memoryRedis();let calls=0;
 const build=()=>handlers({env,storeFactory:()=>createSecurityStore(env,db.transport),runAnalysis:async()=>{calls++;return {verdict:'Unverified'};}});
 const a=build(),b=build();
 for(let i=0;i<6;i++)assert.equal((await (i%2?a:b).analyzeRequest(request())).status,200);
 const limited=await b.analyzeRequest(request());assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');assert.equal(calls,6);
});
test('Global minute and daily budgets are shared across peers',async()=>{
 const db=memoryRedis(),store=createSecurityStore(env,db.transport);const minute=123456;
 for(let i=0;i<20;i++)await store.reserve(i.toString(16).padStart(64,'0'),minute*60000);
 await assert.rejects(store.reserve('f'.repeat(64),minute*60000),error=>error.status===429);
 const day=Math.floor(minute*60000/86400000);db.values.set('scamshield:v1:day:'+day,200);
 await assert.rejects(store.reserve('e'.repeat(64),(minute+1)*60000),error=>error.status===429);
});
test('Concurrent audit writers produce a single verifiable chain without raw message data',async()=>{
 const db=memoryRedis(),a=createSecurityStore(env,db.transport),b=createSecurityStore(env,db.transport);
 await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).audit({request_id:String(i),status:200})));
 assert.equal(db.rows.length,8);let previous='0'.repeat(64);
 for(const row of db.rows){assert.equal(row.previous,previous);assert.equal(row.digest,await signAudit(env.SCAMSHIELD_AUDIT_KEY,previous,row.body));previous=row.digest;}
 assert.equal(db.values.get('scamshield:v1:audit:head'),previous);
});
test('Stream emits actual traces and withholds result when completion audit fails',async()=>{
 const f=fixture();const response=await f.app.analyzeRequest(request(payload,{headers:{accept:'text/event-stream'}}));
 const stream=await response.text();assert.match(stream,/event: trace/);assert.match(stream,/event: result/);assert.equal(f.database.rows.length,2);
 const failed=fixture({storeFactory:()=>({reserve:async()=>{},audit:async event=>{if(event.phase==='completed')throw new Error('offline');}})});
 const r=await failed.app.analyzeRequest(request(payload,{headers:{accept:'text/event-stream'}}));const body=await r.text();assert.match(body,/event: error/);assert.doesNotMatch(body,/event: result/);
});
test('No success JSON is returned without a completed audit record',async()=>{
 const f=fixture({storeFactory:()=>({reserve:async()=>{},audit:async event=>{if(event.phase==='completed')throw new Error('private database error');}})});
 const r=await f.app.analyzeRequest(request());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private database/);
 assert.throws(()=>publicInput(null));
});
