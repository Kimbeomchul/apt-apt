// Official file download (not the API). Derive the attachment from page metadata.
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source='https://www.data.go.kr/data/15106861/fileData.do';
const output=process.argv[2]||'data/raw/reb-complexes.csv';
const page=await fetch(source,{signal:AbortSignal.timeout(30000)});
if(!page.ok)throw Error(`Master metadata HTTP ${page.status}`);
const html=await page.text();
const url=html.match(/"contentUrl"\s*:\s*"(https:\/\/www\.data\.go\.kr\/cmm\/cmm\/fileDownload\.do[^"<>]+)"/)?.[1];
if(!url)throw Error('Official attachment URL not found');
const response=await fetch(url.replaceAll('&amp;','&'),{signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Master attachment HTTP ${response.status}`);
const bytes=Buffer.from(await response.arrayBuffer());
if(!new TextDecoder('euc-kr').decode(bytes.subarray(0,2048)).includes('단지고유번호'))throw Error('Unexpected master file');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,bytes);
await writeFile(output+'.metadata.json',JSON.stringify({source,download_url:url,retrieved_at:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2));
console.log(JSON.stringify({file:output,bytes:bytes.length}));
