import fs from 'node:fs/promises';
import {createWorker} from 'tesseract.js';
import {extract} from '../lib/engine.mjs';
import {PATTERNS} from '../data/knowledge.mjs';
const fixtures=JSON.parse(await fs.readFile('output/ocr-fixtures/fixtures.json'));const results=[];
for(const lang of ['en','hi','mr']){const worker=await createWorker(lang==='en'?'eng':['eng',lang==='hi'?'hin':'mar'],1,{langPath:'./public/ocr',gzip:false,cacheMethod:'none'});try{for(const fixture of fixtures.filter(s=>s.lang===lang)){const {data}=await worker.recognize(fixture.image);const pattern=PATTERNS.find(p=>new RegExp(p.keywords,'iu').test(data.text));results.push({id:fixture.id,lang,expected:fixture.type,detected:pattern.type,correct:fixture.type===pattern.type,ocr_confidence:data.confidence,text:data.text});}}finally{await worker.terminate();}}
const report={generated_at:new Date().toISOString(),dataset:'Synthetic rendered screenshot fixtures; does not evaluate real screenshot quality',samples:results.length,by_language:Object.fromEntries(['en','hi','mr'].map(lang=>[lang,{correct:results.filter(r=>r.lang===lang&&r.correct).length,total:results.filter(r=>r.lang===lang).length}])),results};await fs.writeFile('output/ocr-evaluation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined},null,2));
