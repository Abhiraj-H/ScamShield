import fs from 'node:fs/promises';
import {GUIDANCE} from '../data/guidance.mjs';
import {embed,corpusHash,EMBEDDING_MODEL,DIMENSIONS} from '../lib/rag.mjs';
const config={...process.env};
try{for(const line of (await fs.readFile('.dev.vars','utf8')).split('\n')){const match=line.match(/^(GEMINI_API_KEY)=(.*)$/);if(match&&!config[match[1]])config[match[1]]=match[2].trim().replace(/^['"]|['"]$/g,'');}}catch{}
if(!config.GEMINI_API_KEY)throw new Error('Set GEMINI_API_KEY server-side or in ignored .dev.vars.');
const entries=[];
for(const doc of GUIDANCE){entries.push({id:doc.id,vector:await embed(doc.title+'\n'+doc.text,config,'RETRIEVAL_DOCUMENT',doc.title)});console.log(doc.id+' embedded');}
const index={model:EMBEDDING_MODEL,dimensions:DIMENSIONS,corpus_sha256:await corpusHash(),built_at:new Date().toISOString(),entries};
await fs.writeFile('data/guidance-index.mjs','// Public guidance vectors only. No user data or credentials.\nexport const GUIDANCE_INDEX='+JSON.stringify(index)+';\n');
console.log('Index written: '+entries.length+' public documents, '+DIMENSIONS+' dimensions.');
