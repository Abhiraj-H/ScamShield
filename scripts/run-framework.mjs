import {fileURLToPath} from 'node:url';
const [command,...args]=process.argv.slice(2);
if (!['dev','build'].includes(command)) throw new Error('Expected dev or build.');
const cli=new URL('../node_modules/vite/bin/vite.js',import.meta.url);
process.argv=[process.execPath,fileURLToPath(cli),command,'--config','vite.demo.config.ts',...args];
await import(cli.href);
