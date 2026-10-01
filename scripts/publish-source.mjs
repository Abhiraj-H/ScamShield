// Fallback source preparation when the installed Sites workflow helper is unavailable.
// Credentials arrive on stdin and exist only in this process and child environment.
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.log('Ready for deployment credential JSON (input hidden).');
let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.includes('\n'))break;}
const {credential}=JSON.parse(raw);raw='';
if(credential.auth_mode!=='http_extra_header')throw new Error('Unsupported source credential mode');
function git(args,authenticated=false){const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'};if(authenticated){env.GIT_CONFIG_COUNT='1';env.GIT_CONFIG_KEY_0='http.extraHeader';env.GIT_CONFIG_VALUE_0='Authorization: Bearer '+credential.token;}
 const p=spawnSync('git',args,{env,encoding:'utf8'});if(p.status!==0){throw new Error('Git '+args[0]+' failed: '+(p.stderr||'').replaceAll(credential.token,'[REDACTED]'));}return p.stdout.trim();}
git(['init','-b',credential.branch]);git(['config','user.name','ScamShield Builder']);git(['config','user.email','scamshield@localhost']);
try{git(['remote','get-url','origin']);git(['remote','set-url','origin',credential.remote_url]);}catch{git(['remote','add','origin',credential.remote_url]);}
git(['add','.']);git(['commit','-m','Build ScamShield scam triage and recovery preparation app']);
const remote=git(['ls-remote','--heads','origin',credential.branch],true);
if(remote)throw new Error('Remote already has source; refusing to overwrite unrelated history.');
git(['push','-u','origin',credential.branch],true);
const commit_sha=git(['rev-parse','HEAD']);console.log(JSON.stringify({commit_sha,project_id:JSON.parse(await readFile('.openai/hosting.json','utf8')).project_id}));
