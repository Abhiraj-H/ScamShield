// Render text through a shaping engine, so Devanagari vowel marks have correct order.
import 'regenerator-runtime/runtime.js';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontData from '../lib/font-data.mjs';
const fixtures=JSON.parse(await fs.readFile('output/ocr-fixtures/fixtures.json'));
for(const f of fixtures){const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(Buffer.from(fontData,'base64'),{subset:true});const page=pdf.addPage([760,336]);page.drawText('SYNTHETIC SCAM MESSAGE - FOR TESTING ONLY',{x:28,y:299,font,size:14,color:rgb(.4,.47,.58)});let y=245;let line='';for(const word of f.text.split(' ')){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,21)>700){page.drawText(line,{x:28,y,font,size:21});y-=40;line=word;}else line=next;}page.drawText(line,{x:28,y,font,size:21});const stem='output/ocr-fixtures/sample-'+f.id;await fs.writeFile(stem+'.pdf',await pdf.save());execFileSync('pdftoppm',['-r','110','-singlefile','-png',stem+'.pdf',stem],{stdio:'ignore'});if(f.id===1)await fs.copyFile(stem+'.png','public/demo-electricity.png');}
