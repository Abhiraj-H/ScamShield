import {analyze,sha256} from './engine.mjs';
import {modelConfig} from './llm.mjs';
import {boundedJSON,checkOrigin} from './security.mjs';
import {createSecurityStore} from './vercel-store.mjs';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const bad=message=>Object.assign(new Error(message),{status:400});
export function publicInput(input) {
 if (!input || typeof input!=='object' || Array.isArray(input)) throw bad('JSON object required.');
 if (Object.keys(input).some(key=>!['text','lang','answers','imageHash'].includes(key))) throw bad('Unsupported input field.');
 if (typeof input.text!=='string' || !input.text.trim() || input.text.length>4000) throw bad('Enter 1–4,000 text characters.');
 if (input.lang!==undefined && !['en','hi','mr'].includes(input.lang)) throw bad('Language must be en, hi or mr.');
 if (input.imageHash!==undefined && (typeof input.imageHash!=='string' || !/^[a-f0-9]{64}$/.test(input.imageHash))) throw bad('Invalid image hash.');
 const answers=input.answers || {};
 if (typeof answers!=='object' || Array.isArray(answers)) throw bad('Answers must be an object.');
 const allowed=['clicked','shared','paid','amount','bank','method','utr','incidentTime'];
 if (Object.keys(answers).some(key=>!allowed.includes(key))) throw bad('Unsupported answer field.');
 for (const key of ['clicked','shared','paid']) if (answers[key]!==undefined && typeof answers[key]!=='boolean') throw bad('Invalid triage answer.');
 if (answers.amount!==undefined && (typeof answers.amount!=='number' || !Number.isFinite(answers.amount) || answers.amount<0 || answers.amount>1000000000)) throw bad('Invalid amount.');
 for (const key of ['bank','method','utr','incidentTime']) if (answers[key]!==undefined && (typeof answers[key]!=='string' || answers[key].length>200)) throw bad('Invalid payment detail.');
 return {...input,lang:input.lang||'en',answers};
}

export function handlers({env=process.env,storeFactory=createSecurityStore,runAnalysis=analyze}={}) {
 async function health(request) {
  if (request.method!=='GET') return json({error:'Method not allowed.'},405);
  try {
   const store=storeFactory(env); await store.ready();
   const provider=modelConfig(env);
   return json({status:'ok',version:'1.3.0',public_demo:true,mode:provider?'AI-assisted':'rules',provider:provider?.provider||null,storage:'durable-redis',vision:false,safe_browsing:Boolean(env.GOOGLE_SAFE_BROWSING_API_KEY)});
  } catch {return json({status:'unavailable',error:'Security storage is not configured or reachable.'},503);}
 }
 async function analyzeRequest(request) {
  if (request.method!=='POST') return json({error:'Method not allowed.'},405);
  const requestId=crypto.randomUUID(); let store; let peer;
  try {
   checkOrigin(request);
   if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) throw Object.assign(new Error('JSON content type required.'),{status:415});
   const input=publicInput(await boundedJSON(request,24576));
   store=storeFactory(env);
   // Vercel overwrites x-vercel-forwarded-for at its trusted edge. Ignore client x-forwarded-for.
   const address=env.VERCEL==='1' ? (request.headers.get('x-vercel-forwarded-for')||'unknown').split(',')[0].trim() : 'local';
   peer=await sha256(address);
   await store.reserve(peer);
   await store.audit({time:new Date().toISOString(),request_id:requestId,actor_hash:peer,route:'/analyze',phase:'started',status:202});
   const eventStream=request.headers.get('accept')?.includes('text/event-stream');
   if (!eventStream) {
    const result=await runAnalysis(input,env);
    await store.audit({time:new Date().toISOString(),request_id:requestId,actor_hash:peer,route:'/analyze',phase:'completed',status:200});
    return json(result);
   }
   const encoder=new TextEncoder();
   let connected=true;
   const body=new ReadableStream({
    async start(controller) {
     const send=(event,data)=>{if(connected)try {controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));} catch {connected=false;}};
     try {
      const result=await runAnalysis(input,env,{onTrace:row=>send('trace',row)});
      await store.audit({time:new Date().toISOString(),request_id:requestId,actor_hash:peer,route:'/analyze',phase:'completed',status:200});
      send('result',result);
     } catch {
      try {await store.audit({time:new Date().toISOString(),request_id:requestId,actor_hash:peer,route:'/analyze',phase:'failed',status:503});} catch {}
      send('error',{error:'Analysis unavailable. Please retry.'});
     } finally {if(connected)try {controller.close();} catch {}}
    },
    cancel() {connected=false;},
   });
   return new Response(body,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'}});
  } catch(error) {
   const status=error.status || (error instanceof SyntaxError?400:503);
   const safe=status===503?'Analysis unavailable. Please retry.':error.message;
   return new Response(JSON.stringify({error:safe,request_id:requestId}),{status,headers:{...headers,'Content-Type':'application/json',...(status===429?{'Retry-After':'60'}:{})}});
  }
 }
 return {health,analyzeRequest};
}
