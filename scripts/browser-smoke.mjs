import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const siteUrl=process.argv[2]||'http://127.0.0.1:4173/';
const profile=path.join(root,'.cache','browser-'+Date.now());
await mkdir(profile,{recursive:true});await mkdir('artifacts',{recursive:true});
const executable=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let launchError;child.on('error',e=>launchError=e);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
  let port;
  for(let i=0;i<100;i++){
    if(launchError)throw launchError;
    try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}
  }
  if(!port)throw Error('Chrome failed to start');
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:siteUrl});
  let ready=false;for(let i=0;i<100;i++){if(await run("document.querySelectorAll('.apartment-card').length===7")){ready=true;break;}await delay(100);}assert.ok(ready,'7 cards loaded');
  await run('document.fonts.ready');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('artifacts/desktop.png',Buffer.from(shot.data,'base64'));
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'desktop no overflow');
  await run("document.querySelector('[data-region=서울]').click()");assert.equal(await run("document.querySelectorAll('.apartment-card').length"),3);
  await run("document.querySelector('[data-region=all]').click();document.querySelector('#search').value='산본';document.querySelector('#search').dispatchEvent(new Event('input'))");assert.equal(await run("document.querySelectorAll('.apartment-card').length"),1);
  await run("document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('[data-area=\"59\"]').click()");
  await run("document.querySelector('[data-detail=sejong]').click()");assert.equal(await run("document.querySelector('dialog').open"),true);
  assert.ok(await run("document.querySelector('#detail-result').textContent.includes('월 원리금')"));
  await run("document.querySelector('#detail-price').value=0;document.querySelector('#detail-price').dispatchEvent(new Event('input'))");assert.ok(await run("document.querySelector('#detail-result').textContent.includes('입력해주세요')"));
  await run("document.querySelector('#close-modal').click();['sejong','matan','godeok'].forEach(id=>document.querySelector('[data-compare='+id+']').click());document.querySelector('[data-action=comparison]').click()");assert.equal(await run("document.querySelectorAll('.comparison-table thead th').length"),4);
  await run("document.querySelector('#close-modal').click();document.querySelector('[data-favorite=sejong]').click();document.querySelector('#favorites-only').click()");assert.equal(await run("document.querySelectorAll('.apartment-card').length"),1);
  await run("document.querySelector('#favorites-only').click();document.querySelector('[name=cash]').value=100000;document.querySelector('#finance-form').requestSubmit();document.querySelector('#affordable').click()");assert.ok(await run("document.querySelectorAll('.apartment-card').length>0"));
  await run("document.querySelector('#affordable').click();document.querySelector('#finance-form').reset();document.querySelector('[data-area=\"84\"]').click()");await delay(100);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'mobile no overflow');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('artifacts/mobile.png',Buffer.from(mobile.data,'base64'));
  await run("document.querySelector('[data-detail=matan]').click()");assert.equal(await run("document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth"),true,'mobile dialog no overflow');
  await run("document.querySelector('#close-modal').click()");
  await send('Page.navigate',{url:process.argv[2]?siteUrl:'http://127.0.0.1:4173/dist/'});await delay(1500);
  assert.equal(await run("document.querySelectorAll('.apartment-card').length"),7,'build works at project subpath');
  assert.deepEqual(errors,[],'no browser exceptions');
  console.log('Browser checks passed: 7 cards, region/search/area, detail calculator, comparison, favorites, budget filters, responsive layouts, project path. URL: '+siteUrl);
  await send('Browser.close').catch(()=>{});
}finally{if(ws)ws.close();child.kill();}
