import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDANCE_INDEX} from '../data/guidance-index.mjs';
import {normalize,validateIndex,retrieveGuidance,selectGroundedGuidance} from '../lib/rag.mjs';
import {analyze,refreshTriage} from '../lib/engine.mjs';
test('the real dense index matches the corpus and rejects stale content',async()=>{
 assert.equal((await validateIndex()).entries.length,6);
 await assert.rejects(()=>validateIndex({...GUIDANCE_INDEX,corpus_sha256:'stale'}),/stale/);
 for(const row of GUIDANCE_INDEX.entries)assert.ok(Math.abs(Math.hypot(...normalize(row.vector))-1)<1e-8);
});
test('cosine ranking returns a grounded citation with the matching dense vector',async()=>{
 const r=await retrieveGuidance('money lost',{GEMINI_API_KEY:'test'},{embedder:async()=>GUIDANCE_INDEX.entries[0].vector});
 assert.equal(r.mode,'semantic');assert.equal(r.matches[0].id,'G1');assert.equal(r.matches[0].similarity,1);assert.match(r.answer,/\[G1\]/);
});
test('quota failure uses a labelled keyword fallback and never exposes response secrets',async()=>{
 const old=fetch;const key=crypto.randomUUID();
 try{globalThis.fetch=async()=>Response.json({error:{message:key}},{status:429});const r=await retrieveGuidance('refund UPI PIN',{GEMINI_API_KEY:key});assert.equal(r.mode,'lexical-fallback');assert.ok(r.matches.some(d=>d.id==='G4'));assert.ok(!JSON.stringify(r).includes(key));}finally{globalThis.fetch=old;}
});
test('unknown model citation IDs and duplicate IDs cannot enter the grounded output',async()=>{
 const r=await retrieveGuidance('refund UPI PIN');
 for(const ids of [['invented'],['G4','G4'],['G4','G1','G2','G3']])assert.deepEqual(selectGroundedGuidance(r,ids),r);
 const selected=selectGroundedGuidance(r,['G4']);assert.equal(selected.generation,'model-selected-extractive');assert.deepEqual(selected.selected_ids,['G4']);assert.equal(selected.answer,'[G4] '+r.matches.find(d=>d.id==='G4').text);
});
test('unrelated text abstains in the no-key fallback',async()=>{
 const r=await retrieveGuidance('astronomy galaxies telescope');assert.equal(r.mode,'lexical-fallback');assert.equal(r.matches.length,0);assert.equal(r.answer,'');
});
test('malformed and zero embeddings cannot masquerade as semantic retrieval',async()=>{
 for(const vector of [[],Array(768).fill(0),Array(768).fill(NaN)])await assert.rejects(async()=>normalize(vector));
 const r=await retrieveGuidance('KYC electricity',{GEMINI_API_KEY:'test'},{embedder:async()=>[1,2]});assert.equal(r.mode,'lexical-fallback');
});
test('retrieval query masks contacts and secrets; cited context reaches the classifier',async()=>{
 const old=fetch;const requests=[];
 try{globalThis.fetch=async(url,opts)=>{
 const body=JSON.parse(opts.body);requests.push({url,body});
 if(url.endsWith(':embedContent'))return Response.json({embedding:{values:GUIDANCE_INDEX.entries[3].vector}});
 return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({type:'upi_refund',tools:[],guidance_ids:['G4']})}]},finishReason:'STOP'}]});
 };
 const r=await analyze({text:'Refund: send OTP is 123456 to 9876543210. Pay merchant123@ybl immediately.',answers:{paid:true,utr:'private-ref'}},{LLM_PROVIDER:'gemini',GEMINI_API_KEY:'test'});
 const q=requests.find(r=>r.url.endsWith(':embedContent')).body.content.parts[0].text;
 for(const value of ['123456','9876543210','merchant123@ybl','private-ref'])assert.ok(!q.includes(value));
 const classifier=requests.find(r=>r.body.generationConfig?.responseMimeType);
 assert.match(JSON.stringify(classifier),/retrieved_guidance/);assert.equal(r.retrieval.generation,'model-selected-extractive');assert.deepEqual(r.retrieval.selected_ids,['G4']);assert.equal(r.score,40);assert.equal(r.branch,'C');assert.equal(r.actions[0].href,'tel:1930');
 }finally{globalThis.fetch=old;}
});

test('changed recovery answers flag the previous retrieval as stale and revoke approval',async()=>{
 const r=await analyze({text:'UPI refund PIN'});r.approved_at='approved';const updated=refreshTriage(r,{paid:true});assert.equal(updated.retrieval.situation_changed,true);assert.equal(updated.approved_at,null);assert.equal(updated.actions[0].href,'tel:1930');
});
