import {env} from 'cloudflare:workers';
import {analyze,refreshTriage,calendar,maskPII} from './engine.mjs';
import {saveCase,getCase,listCases,lookupIntel,approveCase,deleteCase} from './store';
import {makePDF} from './pdf.mjs';
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function payload(req:Request){const declared=Number(req.headers.get('content-length')||0);if(declared>6000000)throw new Error('Request exceeds 6 MB.');const body=await req.text();if(body.length>6000000)throw new Error('Request exceeds 6 MB.');const d=JSON.parse(body||'{}');if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('JSON object required.');return d;}
export function validateInput(input:any){
 if(input.text!==undefined&&typeof input.text!=='string')throw new Error('text must be a string.');
 if(input.image!==undefined&&typeof input.image!=='string')throw new Error('image must be a data URL.');
 if(input.lang&&!['en','hi','mr'].includes(input.lang))throw new Error('Language must be en, hi or mr.');
 if(input.imageHash!==undefined&&(typeof input.imageHash!=='string'||!/^[a-f0-9]{64}$/.test(input.imageHash)))throw new Error('Invalid image hash.');
 if(input.answers){if(typeof input.answers!=='object'||Array.isArray(input.answers))throw new Error('answers must be an object.');for(const key of ['paid','shared','clicked'])if(input.answers[key]!==undefined&&typeof input.answers[key]!=='boolean')throw new Error(key+' must be true or false.');
 const amount=Number(input.answers.amount||0);if(!Number.isFinite(amount)||amount<0||amount>1000000000)throw new Error('Enter a valid non-negative amount.');
 for(const key of ['bank','method','utr','incidentTime'])if(input.answers[key]!==undefined&&(typeof input.answers[key]!=='string'||input.answers[key].length>200))throw new Error('Invalid '+key+'.');}
 return input;
}
export async function dispatch(req:Request){
 const url=new URL(req.url);const parts=url.pathname.replace(/^\/api(?=\/)/,'').split('/').filter(Boolean);const [route,id,operation]=parts;
 const config=env as any;
 try {
  if(route==='health')return json({status:'ok',version:'1.0.0',mode:config.OPENAI_API_KEY?'AI-assisted':'rules',storage:!!config.DB,vision:!!config.OPENAI_API_KEY,safe_browsing:!!config.GOOGLE_SAFE_BROWSING_API_KEY,limitations:['No filing or automatic contact','No guaranteed recovery','Redirect/TLS checks not performed']});
  if(route==='analyze'&&req.method==='POST'){return json(await analyze(validateInput(await payload(req)),config));}
  if(route==='cases'&&!id&&req.method==='GET')return json({cases:await listCases()});
  if(route==='cases'&&!id&&req.method==='POST'){
   const input=validateInput(await payload(req));
   if(req.headers.get('accept')?.includes('text/event-stream')){
    const enc=new TextEncoder();const stream=new ReadableStream({async start(controller){let connected=true;const send=(event:string,data:any)=>{if(connected)try{controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{connected=false;}};
    try{const result=await analyze(input,config,{onTrace:(row:any)=>send('trace',row),lookupIntel});await saveCase(result);send('result',result);}catch(e){send('error',{error:e instanceof Error?e.message:'Analysis unavailable.'});}finally{if(connected)controller.close();}},cancel(){}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no'}});
   }
   const result=await analyze(input,config,{lookupIntel});await saveCase(result);return json(result,201);
  }
  if(route==='cases'&&id){const result=await getCase(id);if(!result)return json({error:'Case not found.'},404);
   if(!operation&&req.method==='GET')return json(result);
   if(!operation&&req.method==='DELETE'){await deleteCase(id);return json({deleted:true,note:'Hashed local reports are retained separately.'});}
   if(operation==='answers'&&req.method==='POST'){const a=validateInput({answers:await payload(req)}).answers;const updated=refreshTriage(result,a);await saveCase(updated);return json(updated);}
   if(operation==='evidence'&&req.method==='POST'){const more=validateInput(await payload(req));const updated=await analyze({...more,id,text:result.text+'\n'+(more.text||''),lang:result.lang,answers:result.answers},config,{lookupIntel});updated.created_at=result.created_at;await saveCase(updated);return json(updated);}
   if(operation==='approve'&&req.method==='POST'){const p=await payload(req);const drafts:any={};for(const key of ['complaint','dispute','family','chakshu']){const value=p.drafts?.[key]??result.drafts[key];if(typeof value!=='string'||value.length>16000)throw new Error('Draft must be text of at most 16,000 characters.');drafts[key]=maskPII(value);}return json(await approveCase(id,drafts));}
   if(operation==='stream'&&req.method==='GET'){const events=result.trace.map((r:any)=>`event: trace\ndata: ${JSON.stringify(r)}\n\n`).join('')+`event: result\ndata: ${JSON.stringify(result)}\n\n`;return new Response(events,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-ScamShield-Stream':'replay'}});}
   if(operation==='pack.pdf'&&['GET','POST'].includes(req.method)){if(!result.approved_at)return json({error:'Review and approve the drafts before downloading.'},403);const p=req.method==='POST'?await payload(req):{};const bytes=await makePDF(result,p.image||null);return new Response(bytes as any,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ScamShield-${id.slice(0,8)}.pdf"`,'Cache-Control':'no-store'}});}
   if(operation==='reminders.ics'&&req.method==='GET'){if(!result.approved_at)return json({error:'Review and approve first.'},403);return new Response(calendar(result),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="ScamShield-follow-up.ics"','Cache-Control':'no-store'}});}
  }
  return json({error:'Endpoint not found.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Service unavailable.'},400);}
}
