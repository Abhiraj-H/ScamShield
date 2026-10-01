import { env } from 'cloudflare:workers';
function binding(): D1Database {const db=(env as unknown as {DB?:D1Database}).DB;if(!db)throw new Error('Case storage is unavailable. Try again when the database is connected.');return db;}
export async function saveCase(result:any){await binding().prepare('INSERT INTO cases (id, created_at, updated_at, status, lang, result) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, status=excluded.status, lang=excluded.lang, result=excluded.result').bind(result.id,result.created_at,result.updated_at,result.status,result.lang,JSON.stringify(result)).run();}
export async function getCase(id:string){const row=await binding().prepare('SELECT result FROM cases WHERE id=?').bind(id).first<{result:string}>();return row?JSON.parse(row.result):null;}
export async function listCases(){const rows=await binding().prepare('SELECT id, created_at, status, lang, result FROM cases ORDER BY created_at DESC LIMIT 50').all<{id:string,created_at:string,status:string,lang:string,result:string}>();return rows.results.map(r=>{const d=JSON.parse(r.result);return {id:r.id,created_at:r.created_at,status:r.status,lang:r.lang,verdict:d.verdict,score:d.score,scam_title:d.scam_title,branch:d.branch,amount_lost:d.amount_lost};});}
export async function lookupIntel(hash:string){const row=await binding().prepare('SELECT report_count FROM intel WHERE indicator_hash=?').bind(hash).first<{report_count:number}>();return row?.report_count||0;}
export async function approveCase(id:string,drafts:any){
 const db=binding(); const result=await getCase(id);if(!result)return null;
 if(result.approved_at)return result;
 result.drafts=drafts;result.approved_at=new Date().toISOString();result.updated_at=result.approved_at;result.status='approved';
 // Case and local report increments commit together. Conditional writes prevent duplicate concurrent approval increments.
 const statements=result.entities.map((e:any)=>db.prepare("INSERT INTO intel (indicator_hash,kind,report_count,first_seen,last_seen) SELECT ?,?,1,?,? WHERE EXISTS (SELECT 1 FROM cases WHERE id=? AND status='draft') ON CONFLICT(indicator_hash) DO UPDATE SET report_count=report_count+1,last_seen=excluded.last_seen").bind(e.value_hash,e.kind,result.approved_at,result.approved_at,id));
 statements.push(db.prepare("UPDATE cases SET result=?,status='approved',updated_at=? WHERE id=? AND status='draft'").bind(JSON.stringify(result),result.updated_at,id));await db.batch(statements);return getCase(id);
}

export async function deleteCase(id:string){await binding().prepare("DELETE FROM cases WHERE id=?").bind(id).run();}
