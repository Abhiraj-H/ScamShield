import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if (!process.env.npm_execpath) throw new Error('Run with npm run install:ci.');
const result=spawnSync(process.execPath,[process.env.npm_execpath,'ci','--ignore-scripts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
if (result.error) throw result.error;
process.exit(result.status??1);
