import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {identity,checkOrigin,boundedJSON,signAudit} from '../lib/security.mjs';

await mkdir('.security',{recursive:true});
const db=new DatabaseSync(':memory:');
for(const file of ['0000_amused_quasar.sql','0001_supreme_otto_octavius.sql','0002_fair_white_queen.sql'])db.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
class Statement{
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 async first(){return db.prepare(this.sql).get(...this.args)||null;}
 async all(){return {results:db.prepare(this.sql).all(...this.args)};}
 async run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}
}
globalThis.__securityTestEnv={SCAMSHIELD_AUDIT_KEY:crypto.randomUUID()+crypto.randomUUID(),DB:{prepare:sql=>new Statement(sql),batch:async statements=>{db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const built=await build({entryPoints:['lib/store.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'test-d1-binding',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'binding',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__securityTestEnv;',loader:'js'}));}}]});
await writeFile('.security/store-test.mjs',built.outputFiles[0].text);
const store=await import('../.security/store-test.mjs');
const record={id:'test-case',created_at:'2026-10-01',updated_at:'2026-10-01',status:'draft',lang:'en',entities:[{value_hash:'a'.repeat(64),kind:'url'}],drafts:{family:'reviewed'},verdict:'Scam'};

test('D1 every case query enforces ownership and ID collisions cannot overwrite another user',async()=>{
 await store.saveCase(record,'alice');
 assert.equal((await store.getCase(record.id,'alice')).id,record.id);
 assert.equal(await store.getCase(record.id,'bob'),null);
 assert.equal((await store.listCases('bob')).length,0);
 await store.saveCase({...record,drafts:{family:'malicious'}},'bob');
 assert.equal((await store.getCase(record.id,'alice')).drafts.family,'reviewed');
 assert.equal(await store.approveCase(record.id,{},'bob'),null);
 await store.deleteCase(record.id,'bob');
 assert.ok(await store.getCase(record.id,'alice'));
 const approved=await store.approveCase(record.id,record.drafts,'alice');
 assert.ok(approved.approved_at);
 await store.approveCase(record.id,record.drafts,'alice');
 assert.equal(await store.lookupIntel('a'.repeat(64)),1);
});
test('D1 persisted quotas reject the thirteenth write and isolate users',async()=>{for(let i=0;i<12;i++)await store.quota('alice',true);await assert.rejects(()=>store.quota('alice',true),{status:429});await store.quota('bob',true);});
test('D1 ledger survives concurrent appends and its triggers reject modifications',async()=>{
 const key=crypto.randomUUID()+crypto.randomUUID();
 await Promise.all(Array.from({length:5},(_,i)=>store.audit({event:i},key)));
 const rows=db.prepare('SELECT * FROM audit_events ORDER BY seq').all();let previous='0'.repeat(64);
 assert.equal(rows.filter(r=>JSON.parse(r.body).event!==undefined).length,5);
 for(const row of rows){assert.equal(row.previous,previous);assert.equal(row.digest,await signAudit(JSON.parse(row.body).event!==undefined?key:globalThis.__securityTestEnv.SCAMSHIELD_AUDIT_KEY,previous,row.body));previous=row.digest;}
 assert.throws(()=>db.exec("UPDATE audit_events SET body='changed' WHERE seq=1"));
 assert.throws(()=>db.exec('DELETE FROM audit_events WHERE seq=1'));
 await assert.rejects(()=>store.audit({event:'without-key'},''),{status:503});
});
test('Sites rejects absent identity, browser forgery, content-type tricks and oversized bodies',async()=>{
 assert.throws(()=>identity(new Request('https://app.example/api/cases')),{status:401});
 const authenticated=new Request('https://app.example/api/cases',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'a@example.test'}});
 assert.equal(identity(authenticated),'alice');
 const make=headers=>new Request('https://app.example/api/cases',{method:'POST',headers,body:'{}'});
 assert.throws(()=>checkOrigin(make({'Origin':'https://evil.example'})),{status:403});
 assert.throws(()=>checkOrigin(make({'Content-Type':'application/json'})),{status:403});
 assert.throws(()=>checkOrigin(make({'X-ScamShield-Request':'1','Content-Type':'text/plain'})),{status:415});
 assert.doesNotThrow(()=>checkOrigin(make({'X-ScamShield-Request':'1','Content-Type':'application/json','Origin':'https://app.example'})));
 await assert.rejects(()=>boundedJSON(new Request('https://app.example',{method:'POST',body:'1234567'}),6),{status:413});
});
