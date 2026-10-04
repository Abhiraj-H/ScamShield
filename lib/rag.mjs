import {GUIDANCE} from '../data/guidance.mjs';
import {GUIDANCE_INDEX} from '../data/guidance-index.mjs';
export const EMBEDDING_MODEL='gemini-embedding-001';
export const DIMENSIONS=768;
export function normalize(vector){
 if(!Array.isArray(vector)||vector.length!==DIMENSIONS||vector.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('Invalid embedding dimensions or values.');
 const norm=Math.hypot(...vector);if(!norm)throw new Error('Zero embedding rejected.');return vector.map(v=>v/norm);
}
export async function embed(text,config,taskType='RETRIEVAL_QUERY',title){
 if(!config.GEMINI_API_KEY)throw new Error('Embedding key not configured.');
 const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+EMBEDDING_MODEL+':embedContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.GEMINI_API_KEY},body:JSON.stringify({content:{parts:[{text}]},taskType,outputDimensionality:DIMENSIONS,...(title?{title}:{})}),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('Embedding service unavailable (HTTP '+res.status+').');
 return normalize((await res.json()).embedding?.values);
}
export async function corpusHash(){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(GUIDANCE)));
 return Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function validateIndex(index=GUIDANCE_INDEX){
 if(index.model!==EMBEDDING_MODEL||index.dimensions!==DIMENSIONS||index.corpus_sha256!==await corpusHash()||index.entries.length!==GUIDANCE.length)throw new Error('Guidance index is stale or incompatible. Rebuild it.');
 for(const doc of GUIDANCE){const e=index.entries.find(e=>e.id===doc.id);if(!e)throw new Error('Missing guidance vector.');normalize(e.vector);}
 return index;
}
const tokens=text=>new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);
export async function retrieveGuidance(query,config={},options={}){
 let mode='lexical-fallback',reason='Semantic retrieval needs a Gemini key.',ranking=[];
 try{
  await validateIndex(options.index||GUIDANCE_INDEX);
  if(!config.GEMINI_API_KEY)throw new Error(reason);
  const vector=await (options.embedder||embed)(query,config);
  const unit=normalize(vector);
  ranking=(options.index||GUIDANCE_INDEX).entries.map(e=>({id:e.id,similarity:normalize(e.vector).reduce((sum,v,i)=>sum+v*unit[i],0)})).filter(e=>e.similarity>=0.35);
  mode='semantic';reason=null;
 }catch(error){
  reason=error.message.startsWith('Guidance index')?'Semantic index unavailable.':config.GEMINI_API_KEY?'Semantic service unavailable.':'Semantic retrieval needs a Gemini key.';
  const q=tokens(query);
  ranking=GUIDANCE.map(d=>({id:d.id,similarity:[...tokens(d.title+' '+d.text+' '+d.tags)].filter(w=>q.has(w)).length})).filter(e=>e.similarity>0);
 }
 const matches=ranking.sort((a,b)=>b.similarity-a.similarity||a.id.localeCompare(b.id)).slice(0,3).map(e=>({...GUIDANCE.find(d=>d.id===e.id),similarity:Number(e.similarity.toFixed(4))}));
 return {mode,reason,model:mode==='semantic'?EMBEDDING_MODEL:null,dimensions:mode==='semantic'?DIMENSIONS:null,matches,selected_ids:matches.map(d=>d.id),answer:matches.map(d=>`[${d.id}] ${d.text}`).join('\n\n'),generation:'extractive-fallback'};
}
export function selectGroundedGuidance(retrieval,ids){
 if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!retrieval.matches.some(d=>d.id===id)))return retrieval;
 // The model selects grounded passages; prose comes only from the reviewed corpus.
 const selected=ids.map(id=>retrieval.matches.find(d=>d.id===id));
 return {...retrieval,selected_ids:ids,answer:selected.map(d=>`[${d.id}] ${d.text}`).join('\n\n'),generation:'model-selected-extractive'};
}
