import fs from 'node:fs/promises';
import {analyze} from '../lib/engine.mjs';
// Official aiKart v1 contract: input file or AIKART_INPUT, exact output wrapper.
try {
 const input=JSON.parse(process.env.AIKART_INPUT||await fs.readFile('/aikart/input.json','utf8'));
 const result=await analyze({text:input.text,lang:input.lang||'en',answers:{clicked:input.clicked===true,shared:input.shared===true,paid:input.paid===true,amount:Number(input.amount||0),bank:input.bank||'',utr:input.utr||''}},process.env);
 const response=JSON.stringify(result);
 const out=process.env.AIKART_OUTPUT||'/aikart/output.json';
 await fs.mkdir(out.slice(0,out.lastIndexOf('/'))||'.',{recursive:true});
 await fs.writeFile(out,JSON.stringify({format:'json',response}));
}catch(e){process.stderr.write('ScamShield run failed. Check input or service configuration.\n');process.exitCode=1;}
