// The Sites dispatcher supplies identity headers. Never expose this worker directly.
export function identity(req) {
 const id=req.headers.get('oai-authenticated-user-id');
 const email=req.headers.get('oai-authenticated-user-email');
 if(!id||!email)throw Object.assign(new Error('Sign in to access your cases.'),{status:401});
 return id;
}
export function checkOrigin(req) {
 if(['GET','HEAD'].includes(req.method))return;
 const origin=req.headers.get('origin');
 if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('x-scamshield-request')!=='1')throw Object.assign(new Error('Cross-site request rejected.'),{status:403});
 const type=req.headers.get('content-type')||'';
 if(!type.toLowerCase().startsWith('application/json'))throw Object.assign(new Error('JSON content type required.'),{status:415});
}
export async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function signAudit(key,previous,body){if(!key||key.length<32)throw Object.assign(new Error('Audit signing key is not configured.'),{status:503});const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signed=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(previous+'\n'+body));return Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,'0')).join('');}
export async function boundedJSON(req,limit=6000000){if(Number(req.headers.get('content-length')||0)>limit)throw Object.assign(new Error('Request exceeds 6 MB.'),{status:413});const reader=req.body?.getReader();const parts=[];let size=0;if(reader){while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(new Error('Request exceeds 6 MB.'),{status:413});}parts.push(r.value);}}const body=new Uint8Array(size);let offset=0;for(const p of parts){body.set(p,offset);offset+=p.byteLength;}const d=JSON.parse(new TextDecoder().decode(body)||'{}');if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('JSON object required.');return d;}
