import {env} from 'cloudflare:workers';
import {analyze,refreshTriage,calendar,maskPII} from './engine.mjs';
import {saveCase,getCase,listCases,lookupIntel,approveCase,deleteCase,quota,audit} from './store';
import {identity,checkOrigin,boundedJSON,sha256} from './security.mjs';
import {makePDF} from './pdf.mjs';
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const payload=boundedJSON;
export function validateInput(input:any){
 if(input.id!==undefined)throw new Error("Case IDs are assigned by the server.");
 if(input.text!==undefined&&typeof input.text!=='string')throw new Error('text must be a string.');
 if(input.image!==undefined&&typeof input.image!=='string')throw new Error('image must be a data URL.');
 if(input.lang&&!['en','hi','mr'].includes(input.lang))throw new Error('Language must be en, hi or mr.');
 if(input.imageHash!==undefined&&(typeof input.imageHash!=='string'||!/^[a-f0-9]{64}$/.test(input.imageHash)))throw new Error('Invalid image hash.');
 if(input.answers){if(typeof input.answers!=='object'||Array.isArray(input.answers))throw new Error('answers must be an object.');for(const key of ['paid','shared','clicked'])if(input.answers[key]!==undefined&&typeof input.answers[key]!=='boolean')throw new Error(key+' must be true or false.');
 const amount=Number(input.answers.amount||0);if(!Number.isFinite(amount)||amount<0||amount>1000000000)throw new Error('Enter a valid non-negative amount.');
 for(const key of ['bank','method','utr','incidentTime'])if(input.answers[key]!==undefined&&(typeof input.answers[key]!=='string'||input.answers[key].length>200))throw new Error('Invalid '+key+'.');}
 return input;
}
async function handle(req:Request,owner:string,requestId:string){
 const url=new URL(req.url);const parts=url.pathname.replace(/^\/api(?=\/)/,'').split('/').filter(Boolean);const [route,id,operation]=parts;
 const config=env as any;
 try {
  if(route==='health')return json({status:'ok',version:'1.0.0',mode:config.OPENAI_API_KEY?'AI-assisted':'rules',storage:!!config.DB,vision:!!config.OPENAI_API_KEY,safe_browsing:!!config.GOOGLE_SAFE_BROWSING_API_KEY,limitations:['No filing or automatic contact','No guaranteed recovery','Redirect/TLS checks not performed']});
  if(route==='analyze'&&req.method==='POST'){return json(await analyze(validateInput(await payload(req)),config));}
  if(route==='cases'&&!id&&req.method==='GET')return json({cases:await listCases(owner)});
  if(route==='cases'&&!id&&req.method==='POST'){
   const input=validateInput(await payload(req));
   if(req.headers.get('accept')?.includes('text/event-stream')){
    const enc=new TextEncoder();const stream=new ReadableStream({async start(controller){let connected=true;const send=(event:string,data:any)=>{if(connected)try{controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{connected=false;}};
    try{const result=await analyze(input,config,{onTrace:(row:any)=>send('trace',row),lookupIntel});await saveCase(result,owner);await audit({time:new Date().toISOString(),request_id:requestId,actor:owner,phase:'stream-completed',status:200},config.SCAMSHIELD_AUDIT_KEY);send('result',result);}catch(e){try{await audit({time:new Date().toISOString(),request_id:requestId,actor:owner,phase:'stream-error',status:500},config.SCAMSHIELD_AUDIT_KEY);}catch{}send('error',{error:'Analysis unavailable. Please retry.'});}finally{if(connected)controller.close();}},cancel(){}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no'}});
   }
   const result=await analyze(input,config,{lookupIntel});await saveCase(result,owner);return json(result,201);
  }
  if(route==='cases'&&id){const result=await getCase(id,owner);if(!result)return json({error:'Case not found.'},404);
   if(!operation&&req.method==='GET')return json(result);
   if(!operation&&req.method==='DELETE'){await deleteCase(id,owner);return json({deleted:true,note:'Hashed local reports are retained separately.'});}
   if(operation==='answers'&&req.method==='POST'){const a=validateInput({answers:await payload(req)}).answers;const updated=refreshTriage(result,a);await saveCase(updated,owner);return json(updated);}
   if(operation==='evidence'&&req.method==='POST'){const more=validateInput(await payload(req));const updated=await analyze({...more,id,text:result.text+'\n'+(more.text||''),lang:result.lang,answers:result.answers},config,{lookupIntel});updated.created_at=result.created_at;await saveCase(updated,owner);return json(updated);}
   if(operation==='approve'&&req.method==='POST'){const p=await payload(req);const drafts:any={};for(const key of ['complaint','dispute','family','chakshu']){const value=p.drafts?.[key]??result.drafts[key];if(typeof value!=='string'||value.length>16000)throw new Error('Draft must be text of at most 16,000 characters.');drafts[key]=maskPII(value);}return json(await approveCase(id,drafts,owner));}
   if(operation==='stream'&&req.method==='GET'){const events=result.trace.map((r:any)=>`event: trace\ndata: ${JSON.stringify(r)}\n\n`).join('')+`event: result\ndata: ${JSON.stringify(result)}\n\n`;return new Response(events,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-ScamShield-Stream':'replay'}});}
   if(operation==='pack.pdf'&&['GET','POST'].includes(req.method)){if(!result.approved_at)return json({error:'Review and approve the drafts before downloading.'},403);const p=req.method==='POST'?await payload(req):{};const bytes=await makePDF(result,p.image||null);return new Response(bytes as any,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ScamShield-${id.slice(0,8)}.pdf"`,'Cache-Control':'no-store'}});}
   if(operation==='reminders.ics'&&req.method==='GET'){if(!result.approved_at)return json({error:'Review and approve first.'},403);return new Response(calendar(result),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="ScamShield-follow-up.ics"','Cache-Control':'no-store'}});}
  }
  return json({error:'Endpoint not found.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Service unavailable.'},(e as any)?.status||400);}
}

export async function dispatch(req:Request){
 const requestId=crypto.randomUUID();const started=Date.now();const path=new URL(req.url).pathname;
 let response:Response;let owner='unauthenticated';
 try{
  if(path==='/api/health')return handle(req,owner,requestId);
  owner=identity(req);checkOrigin(req);
  const key=(env as any).SCAMSHIELD_AUDIT_KEY;
  if(!key||key.length<32)throw Object.assign(new Error('Audit signing key is not configured.'),{status:503});
  await quota(owner,!['GET','HEAD'].includes(req.method));
  // Persist intent before an SSE response can start executing its background work.
  await audit({time:new Date().toISOString(),request_id:requestId,actor:owner,method:req.method,route:path.replace(/cases\/[^/]+/,'cases/:id'),phase:'started'},key);
  response=await handle(req,owner,requestId);
  const digest=await audit({time:new Date().toISOString(),request_id:requestId,actor:owner,method:req.method,route:path.replace(/cases\/[^/]+/,'cases/:id'),status:response.status,phase:response.headers.get('content-type')?.includes('text/event-stream')?'stream-started':'completed'},key);
  console.info(JSON.stringify({request_id:requestId,actor_hash:await sha256(owner),status:response.status,duration_ms:Date.now()-started,audit_digest:digest}));
 }catch(e){const key=(env as any).SCAMSHIELD_AUDIT_KEY;if(key?.length>=32)try{await audit({time:new Date().toISOString(),request_id:requestId,actor:owner,method:req.method,route:path.replace(/cases\/[^/]+/,'cases/:id'),status:(e as any)?.status||503,phase:'rejected'},key);}catch{}response=json({error:(e as any)?.status?(e as Error).message:'Service unavailable.',request_id:requestId},(e as any)?.status||503);}
 response.headers.set('X-Request-ID',requestId);response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('X-Frame-Options','DENY');response.headers.set('Referrer-Policy','no-referrer');if(response.status===429)response.headers.set('Retry-After','60');return response;
}
