import {analyze,refreshTriage,calendar,maskPII} from '../lib/engine.mjs';
import {makePDF} from '../lib/pdf.mjs';
let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
try{const request=JSON.parse(stdin);let result;
 if(request.operation==='pdf'){result={base64:Buffer.from(await makePDF(request.result,request.image)).toString('base64')};}
 else if(request.operation==='answers')result=refreshTriage(request.result,request.answers);
 else if(request.operation==='calendar')result={calendar:calendar(request.result)};
 else if(request.operation==='mask')result={drafts:Object.fromEntries(Object.entries(request.drafts).map(([k,v])=>[k,maskPII(v)]))};
 else result=await analyze(request.input,process.env,{onTrace:row=>process.stdout.write(JSON.stringify({event:'trace',data:row})+'\n'),lookupIntel:hash=>request.intel?.[hash]||0});
 process.stdout.write(JSON.stringify({event:'result',data:result})+'\n');
}catch(e){process.stdout.write(JSON.stringify({event:'error',data:{error:e.message}})+'\n');process.exitCode=1;}
