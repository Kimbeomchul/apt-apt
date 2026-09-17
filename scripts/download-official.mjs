// Download the public CSV export offered by the website, without an OpenAPI key.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const from=process.argv.find(x=>x.startsWith('--from='))?.slice(7)||'2025-09-17';
const to=process.argv.find(x=>x.startsWith('--to='))?.slice(5)||'2026-09-16';
const days=(new Date(to)-new Date(from))/86400000;
if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(days)||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to||days<0||days>365)throw Error('Download one year or less per region using valid dates');
const outputDir=process.argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||'data/raw/molit';
await mkdir(outputDir,{recursive:true});
const headers={'User-Agent':'JipStandardResearch/1.0'};
const pageUrl='https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=';
const initial=await fetch(pageUrl,{headers,signal:AbortSignal.timeout(30000)});
if(!initial.ok)throw Error(`Export page HTTP ${initial.status}`);
const page=await initial.text();
const action=page.match(/document\.frm_xls\.action = "([^"\n]*ptXlsCSVDown\.do[^"\n]*)"/)?.[1];
if(!action)throw Error('CSV form changed; inspect official page');
const cookies=initial.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
for(const [code,name] of [['11','서울특별시'],['41','경기도']]){
  const file=`${outputDir}/${code}-${from}-${to}.csv`;
  try{await readFile(file);console.log(`Already downloaded ${file}`);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  const body=new URLSearchParams({srhThingNo:'A',srhDelngSecd:'1',srhAddrGbn:'1',srhLfstsSecd:'1',srhFromDt:from,srhToDt:to,srhSidoCd:code,srhSggCd:'',srhEmdCd:'',srhHsmpCd:'',srhArea:'',srhLrArea:'',srhNewRonSecd:'',srhFromAmount:'',srhToAmount:'',srhRoadNm:'',srhLoadCd:'',sidoNm:name,sggNm:'전체',emdNm:'전체',hsmpNm:'전체',areaNm:'전체',loadNm:'전체',mobileAt:''});
  const r=await fetch(new URL(action,pageUrl),{method:'POST',headers:{...headers,Cookie:cookies,Referer:pageUrl},body,signal:AbortSignal.timeout(60000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  if(!r.ok||/html|json/i.test(r.headers.get('content-type')||''))throw Error(`CSV download unavailable: HTTP ${r.status}, ${bytes.toString('utf8').slice(0,150)}`);
  const text=new TextDecoder('euc-kr').decode(bytes);
  if(!text.includes('계약')||!text.includes('거래금액'))throw Error('Response is not a trade CSV');
  await writeFile(file,bytes);
  await writeFile(file+'.metadata.json',JSON.stringify({source:pageUrl,method:'public_csv_form',region:name,from,to,retrieved_at:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2));
  console.log(JSON.stringify({file,bytes:bytes.length}));
  await new Promise(r=>setTimeout(r,1500));
}
