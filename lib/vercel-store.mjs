import {signAudit} from './security.mjs';

export const QUOTA_SCRIPT = `
local limits = {6, 20, 200}
for i = 1, 3 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if not count or count < 0 then return redis.error_reply('Invalid quota state') end
  if count >= limits[i] then return 0 end
end
for i = 1, 3 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[i])) end
end
return 1`;

export const AUDIT_SCRIPT = `
local previous = redis.call('GET', KEYS[1]) or string.rep('0', 64)
if previous ~= ARGV[1] then return 0 end
redis.call('RPUSH', KEYS[2], ARGV[3])
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

const unavailable = () => Object.assign(new Error('Durable security storage unavailable.'), {status:503});
export function redisConfig(env) {
 const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
 const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
 if (!url || !token) throw unavailable();
 let target; try {target = new URL(url);} catch {throw unavailable();}
 if (target.protocol !== 'https:' || !/^[a-z0-9-]+\.upstash\.io$/.test(target.hostname) || target.port || target.username || target.password || target.search || target.hash || target.pathname !== '/') throw unavailable();
 return {url:target.origin,token};
}
export function createSecurityStore(env, transport=fetch) {
 const {url,token} = redisConfig(env);
 if (!env.SCAMSHIELD_AUDIT_KEY || env.SCAMSHIELD_AUDIT_KEY.length < 32) throw unavailable();
 const base = 'scamshield:v1';
 async function command(args) {
  try {
   const response = await transport(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(8000)});
   if (!response.ok) throw unavailable();
   const data = await response.json();
   if (data.error || !Object.hasOwn(data,'result')) throw unavailable();
   return data.result;
  } catch {throw unavailable();}
 }
 return {
  async ready() {if (await command(['PING']) !== 'PONG') throw unavailable();},
  async reserve(peer,now=Date.now()) {
   if (!/^[a-f0-9]{64}$/.test(peer)) throw unavailable();
   const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
   const allowed = await command(['EVAL',QUOTA_SCRIPT,3,`${base}:peer:${minute}:${peer}`,`${base}:minute:${minute}`,`${base}:day:${day}`,90,90,86460]);
   if (allowed !== 1) throw Object.assign(new Error('Analysis limit reached. Try again later.'),{status:429});
  },
  async audit(event) {
   // The caller supplies metadata only; evidence, provider keys and headers never enter this ledger.
   const body=JSON.stringify(event);
   for (let attempt=0;attempt<12;attempt++) {
    const previous=(await command(['GET',base+':audit:head'])) || '0'.repeat(64);
    if (!/^[a-f0-9]{64}$/.test(previous)) throw unavailable();
    const digest=await signAudit(env.SCAMSHIELD_AUDIT_KEY,previous,body);
    const row=JSON.stringify({body,previous,digest});
    const added=await command(['EVAL',AUDIT_SCRIPT,2,base+':audit:head',base+':audit:events',previous,digest,row]);
    if (added === 1) return digest;
   }
   throw unavailable();
  },
 };
}
