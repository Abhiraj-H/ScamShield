// Small synthetic diagnostic, not a population accuracy estimate.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {retrieveGuidance,corpusHash} from '../lib/rag.mjs';
import {analyze} from '../lib/engine.mjs';
const config={...process.env};
try{for(const line of (await fs.readFile('.dev.vars','utf8')).split('\n')){const match=line.match(/^(GEMINI_API_KEY|LLM_PROVIDER|GEMINI_MODEL)=(.*)$/);if(match&&!config[match[1]])config[match[1]]=match[2].trim().replace(/^['"]|['"]$/g,'');}}catch{}
const cases=[
 {id:'R1',query:'I lost money in an online bank transfer fraud. Where can I report it?',expected:'G1'},
 {id:'R2',query:'मेरे पैसे ऑनलाइन धोखाधड़ी में चले गए। शिकायत कहां करूं?',expected:'G1'},
 {id:'R3',query:'सायबर फसवणुकीत पैसे गेले. आता कुठे तक्रार करावी?',expected:'G1'},
 {id:'R4',query:'Someone says I must scan a QR and enter my UPI PIN to receive a refund.',expected:'G4'},
 {id:'R5',query:'An electricity message threatens disconnection unless I update my KYC with an APK.',expected:'G3'}
];
const rows=[];
for(const item of cases){const start=Date.now();const r=await retrieveGuidance(item.query,config);const passed=r.mode==='semantic'&&r.matches.some(d=>d.id===item.expected);rows.push({...item,mode:r.mode,returned:r.matches.map(d=>({id:d.id,similarity:d.similarity})),passed,latency_ms:Date.now()-start});console.log(item.id+': '+r.mode+' '+(passed?'PASS':'FAIL'));}
const r=await analyze({text:'SBI KYC expires tonight. Send OTP. Pay demo123@ybl.',lang:'hi',answers:{paid:true,amount:5000,bank:'SBI'}},config);
const integration={mode:r.mode,verdict:r.verdict,score:r.score,branch:r.branch,retrieval_mode:r.retrieval.mode,generation:r.retrieval.generation,citations:r.retrieval.selected_ids,model_tools:r.agent.calls.map(c=>c.name),agent_completed:r.agent.completed,trace:r.trace,passed:r.mode==='AI-assisted'&&r.retrieval.mode==='semantic'&&r.retrieval.generation==='model-selected-extractive'&&r.agent.completed&&r.agent.calls.some(c=>c.name==='check_upi')&&r.actions[0].href==='tel:1930'};
const report={evaluated_at:new Date().toISOString(),scope:'Five authored diagnostic retrieval queries plus one synthetic live agent integration. Not scam-detection accuracy.',corpus_sha256:await corpusHash(),cases:rows,integration};
await fs.mkdir('output/fa',{recursive:true});await fs.writeFile('output/fa/rag-evaluation.json',JSON.stringify(report,null,2)+'\n');
assert.ok(rows.every(r=>r.passed)&&integration.passed,'RAG diagnostic or live integration failed; inspect output/fa/rag-evaluation.json.');
