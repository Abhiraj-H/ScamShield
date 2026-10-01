import 'regenerator-runtime/runtime.js';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontData from './font-data.mjs';
import {sha256} from './engine.mjs';
export async function makePDF(result,image=null){
 if(image&&(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>5600000))throw new Error('Invalid screenshot.');
 if(image&&result.image_hash&&await sha256(image)!==result.image_hash)throw new Error('Screenshot does not match the analyzed image.');
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(Uint8Array.from(atob(fontData),c=>c.charCodeAt(0)),{subset:true});
 pdf.setTitle('ScamShield - reviewed evidence pack');pdf.setAuthor('ScamShield');
 const navy=rgb(.09,.15,.28),blue=rgb(.14,.30,.9);let page,y;let pages=0;
 const newPage=()=>{page=pdf.addPage([595.28,841.89]);y=772;pages++;page.drawText('SCAMSHIELD  /  EVIDENCE PACK',{x:44,y:803,font,size:10,color:blue});page.drawLine({start:{x:44,y:790},end:{x:551,y:790},color:rgb(.83,.87,.92)});page.drawText('Prepared and reviewed. Not filed. No guaranteed recovery.',{x:44,y:25,font,size:8,color:navy});};newPage();
 const clean=s=>String(s??'').replace(/•/g,'*').replace(/[–—]/g,'-').replace(/[^\u0009\u000a\u000d\u0020-\u007e\u0900-\u097f₹]/g,'');
 function line(text,size=10){const words=clean(text).split(/\s+/);let buffer='';for(const word of words){const candidate=buffer?buffer+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>505&&buffer){draw(buffer,size);buffer=word;}else buffer=candidate;}draw(buffer,size);}
 function draw(text,size){if(y<60)newPage();page.drawText(text,{x:44,y,font,size,color:navy});y-=size*1.65;}
 function paragraph(text,size=10){for(const part of clean(text).split('\n')){if(part.trim())line(part,size);else y-=7;}y-=8;}
 function heading(text){y-=10;line(text,14);y-=5;}
 heading('Case '+result.id.slice(0,8));paragraph(`Created: ${result.created_at}\nReviewed: ${result.approved_at}\nVerdict: ${result.verdict} | Evidence score: ${result.score}/100 | Branch: ${result.branch}\nMode: ${result.mode}\nMessage SHA-256: ${result.input_hash}`);
 paragraph(result.explanation);
 heading('Original message (redacted)');paragraph(result.text);
 heading('Extracted identifiers');for(const e of result.entities)paragraph(`${e.kind}: ${e.value_masked}\nSHA-256: ${e.value_hash}`,9);
 heading('Verification evidence');for(const e of result.evidence)paragraph(`[${e.id}] ${e.tool} | ${e.status} | Weight ${e.weight}\n${e.finding}\nChecked: ${e.ts}\nSource: ${e.source_url}`,9);
 heading('Your action plan');result.actions.forEach((a,i)=>paragraph(`${i+1}. ${a.when}: ${a.title}\n${a.detail}\nSource: ${a.source}`));
 for(const [key,title]of [['complaint','Cybercrime complaint sheet'],['dispute','Bank dispute letter'],['family','Family warning'],['chakshu','Chakshu prepared details']]){newPage();heading(title);paragraph(result.drafts[key]);}
 newPage();heading('Agent trace');for(const row of result.trace)paragraph(`${row.ts}\n${row.step} / ${row.tool} / ${row.status} / ${row.latency_ms}ms\n${row.summary}`,9);
 if(image){newPage();heading('Screenshot supplied by the reviewer');paragraph('Raw screenshot is included only in this download. It is not retained by the application. Check for personal information before sharing.');paragraph('Screenshot SHA-256: '+await sha256(image),9);const data=Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0));const embedded=image.startsWith('data:image/png')?await pdf.embedPng(data):await pdf.embedJpg(data);const scale=Math.min(505/embedded.width,(y-65)/embedded.height);page.drawImage(embedded,{x:44,y:y-embedded.height*scale,width:embedded.width*scale,height:embedded.height*scale});}
 pdf.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${pages}`,{x:510,y:25,font,size:8,color:navy}));return pdf.save();
}
