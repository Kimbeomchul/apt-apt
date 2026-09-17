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
  let ready=false;for(let i=0;i<100;i++){if(await run("document.querySelectorAll('.apartment-card').length===24")){ready=true;break;}await delay(100);}assert.ok(ready,'24 cards loaded');
  assert.ok(await run("document.querySelector('#result-count').textContent.includes('4,860')"));
  const first=await run("document.querySelector('[data-detail]').dataset.detail");
  await run("document.querySelector('[data-page=\"2\"]').click()");
  assert.notEqual(await run("document.querySelector('[data-detail]').dataset.detail"),first);
  await run("document.querySelector('[data-page=\"1\"]').click()");
  await run("document.querySelector('#pagination button:last-child').dataset.page='203';document.querySelector('#pagination button:last-child').click()");
  assert.equal(await run("document.querySelectorAll('.apartment-card').length"),12,'last page contains remaining apartments');
  assert.ok(await run("document.querySelector('.prices').textContent.includes('미확인')"),'apartments without prices remain visible');
  await run("document.querySelector('#search').value='아남1';document.querySelector('#search').dispatchEvent(new Event('input'))");
  assert.ok(await run("document.querySelector('[data-detail]').textContent.includes('아남1')"),'search covers apartments beyond first page');
  await run("document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));scrollTo(0,0)");
  await run('document.fonts.ready');
  await run("document.querySelector('#affordable').click();document.querySelector('[name=creditStatus]').value='active';document.querySelector('[name=creditStatus]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await run("document.querySelector('#budget-filter-notice').textContent.includes('적용 보류')"),'review reason is visible');
  assert.equal(await run("document.querySelector('#budget-filter-notice').hidden"),false);
  assert.equal(await run("document.querySelectorAll('.apartment-card').length"),24,'review must not erase inventory');
  await run("document.querySelector('[name=creditStatus]').value='repaid';document.querySelector('[name=creditStatus]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await run("document.querySelector('#budget-filter-notice').hidden"),true,'repaid restores budget filtering');
  assert.ok(await run("document.querySelector('#budget-summary').textContent.includes('전액 상환')"));
  assert.ok(await run("document.querySelectorAll('.apartment-card').length>0"));
  await run("document.querySelector('#affordable').click();document.querySelector('[data-household=couple]').click();document.querySelector('[name=spouseincome]').value=5000;document.querySelector('[name=spousecash]').value=20000;document.querySelector('[name=spousetakeHome]').value=350;document.querySelector('[name=spousecash]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await run("document.querySelector('#funding-summary').textContent.includes('1.2억')"),'income aggregated');
  assert.ok(await run("document.querySelector('#funding-summary').textContent.includes('5억')"),'cash aggregated');
  for(const prefix of ['giftSelf','giftSpouse'])await run(`document.querySelector('[name=${prefix}enabled]').click();document.querySelector('[name=${prefix}amount]').value=10000;document.querySelector('[name=${prefix}amount]').dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.ok(await run("document.querySelector('[data-gift-result=giftSelf]').textContent.includes('485만원')"),'gift tax displayed');
  assert.ok(await run("document.querySelector('#funding-summary').textContent.includes('970만원')"),'both recipients taxed');
  assert.ok(await run("document.querySelector('#funding-summary').textContent.includes('6.9억')"),'net gifts enter budget');
  await run("document.querySelector('[data-household=single]').click()");
  assert.ok(await run("document.querySelector('#funding-summary').textContent.includes('3.95억')"),'single excludes spouse gift and cash');
  await run("document.querySelector('[data-household=couple]').click();document.querySelectorAll('.gift-section,.gift-history').forEach(d=>d.open=true)");
  for(const width of [1440,820,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'couple and gift form fits '+width);
    assert.equal(await run("document.querySelector('.finance-panel').scrollWidth<=document.querySelector('.finance-panel').clientWidth"),true,'gift fields fit panel '+width);
    if(width===390){
      await run("document.querySelector('.gifts-panel').scrollIntoView({block:'start'})");
      const giftShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('artifacts/gift-mobile.png',Buffer.from(giftShot.data,'base64'));
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await run("document.querySelector('#finance-form').reset();document.querySelectorAll('.gift-section,.gift-history').forEach(d=>d.open=false)");await delay(300);
  assert.equal(await run("document.querySelector('[name=householdMode]').value"),'single','reset clears combined mode');
  assert.equal(await run("document.querySelector('[name=creditStatus]').value"),'none');
  assert.equal(await run("document.querySelector('[data-gift-result=giftSelf]').textContent"),'','reset clears gift results');

  // Opening the input sections must not rotate their titles or overflow the panel.
  for(const width of [1440,1024,820,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    await run("document.querySelectorAll('.form-details').forEach(d=>{if(!d.open)d.querySelector('summary').click()})");
    assert.equal(await run("Array.from(document.querySelectorAll('.summary-label')).every(s=>getComputedStyle(s).transform==='none')"),true,'expanded titles stay horizontal at '+width);
    assert.equal(await run("document.querySelector('.finance-panel').scrollWidth<=document.querySelector('.finance-panel').clientWidth"),true,'expanded form fits at '+width);
    assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'expanded page fits at '+width);
    assert.equal(await run("Array.from(document.querySelectorAll('.finance-panel input,.finance-panel select')).filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.finance-panel').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right})"),true,'all expanded inputs stay inside panel at '+width);
    if(width===1440||width===390){
      await run("document.querySelector('.form-details').scrollIntoView({block:'start'})");
      const expanded=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(`artifacts/expanded-${width}.png`,Buffer.from(expanded.data,'base64'));
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await run("document.querySelectorAll('.form-details').forEach(d=>d.open=false);scrollTo(0,0)");
  const dataset=JSON.parse(await readFile('data/apartments.json','utf8'));
  for(const [id,min,max,inclusive] of [['under6',0,60000,false],['6to8',60000,80000,false],['8to11',80000,110000,false],['11to15',110000,150000,true]]){
    for(const area of ['59','84']){
      await run(`document.querySelector('[data-area="${area}"]').click();document.querySelector('[data-price-band="${id}"]').click()`);
      const matches=dataset.apartments.filter(a=>{const p=a.prices[area]?.amount;return p>0&&p>=min&&(inclusive?p<=max:p<max)});
      assert.equal(await run("document.querySelector('#result-count strong').textContent"),matches.length.toLocaleString()+'개','price band total for '+id+' '+area);
      const ids=await run("Array.from(document.querySelectorAll('[data-detail]')).map(b=>b.dataset.detail)");
      assert.ok(ids.every(id=>matches.some(a=>a.id===id)),'visible cards fit selected price and area');
      assert.equal(await run(`document.querySelector('[data-price-band="${id}"]').getAttribute('aria-pressed')`),'true');
    }
  }
  await run("document.querySelector('[data-action=clear-filters]').click()");
  assert.equal(await run("document.querySelector('[data-price-band=all]').getAttribute('aria-pressed')"),'true','reset includes price filter');
  await run("document.querySelector('.price-browser').scrollIntoView({block:'start'})");
  const priceShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('artifacts/price-bands.png',Buffer.from(priceShot.data,'base64'));
  await run('scrollTo(0,0)');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('artifacts/desktop.png',Buffer.from(shot.data,'base64'));
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'desktop no overflow');
  await run("document.querySelector('[name=income]').value=30000;document.querySelector('[name=takeHome]').value=2000;document.querySelector('#finance-form').requestSubmit();document.querySelector('[name=purchaseHistory]').value='first';document.querySelector('[name=purchaseHistory]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await run("document.querySelector('#budget-summary').textContent.includes('LTV 70%')"),'first-home selection updates immediately');
  await run("document.querySelector('[data-detail]').click()");
  assert.ok(await run("document.querySelector('#detail-result').textContent.includes('일반 → 생애최초 비교')"),'comparison visible');
  assert.equal(await run("document.querySelectorAll('#detail-result meter').length"),3,'three loan limits');
  await run("document.querySelector('#close-modal').click();document.querySelector('[name=homeStatus]').value='keep';document.querySelector('[name=homeStatus]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await run("document.querySelector('#history-error').textContent.includes('모순')"),'contradiction shown immediately');
  assert.ok(await run("document.querySelector('#budget-summary').textContent.includes('별도 심사')"),'stale budget suppressed');
  await run("document.querySelector('[name=homeStatus]').value='none';document.querySelector('[name=homeStatus]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[name=purchaseHistory]').value='unknown';document.querySelector('[name=purchaseHistory]').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await run("document.querySelector('#budget-summary').textContent.includes('생애최초 여부를 확인')"),'unknown eligibility kept unknown');
  await run("document.querySelector('#finance-form').reset()");await delay(100);
  assert.equal(await run("document.querySelector('#history-error').textContent"),'','reset clears validation');
  await run("document.querySelector('[data-region=서울]').click()");assert.equal(await run("document.querySelectorAll('.apartment-card').length"),24);
  await run("document.querySelector('[data-region=all]').click();document.querySelector('#search').value='산본';document.querySelector('#search').dispatchEvent(new Event('input'))");assert.ok(await run("document.querySelectorAll('.apartment-card').length>1"));
  await run("document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('[data-area=\"59\"]').click()");
  await run("document.querySelector('[data-detail]').click()");assert.equal(await run("document.querySelector('dialog').open"),true);
  assert.ok(await run("document.querySelector('#detail-result').textContent.includes('월 원리금')"));
  await run("document.querySelector('#detail-price').value=0;document.querySelector('#detail-price').dispatchEvent(new Event('input'))");assert.ok(await run("document.querySelector('#detail-result').textContent.includes('입력해주세요')"));
  await run("document.querySelector('#close-modal').click();Array.from(document.querySelectorAll('[data-compare]')).slice(0,3).map(b=>b.dataset.compare).forEach(id=>document.querySelector('[data-compare=\"'+id+'\"]').click());document.querySelector('[data-action=comparison]').click()");assert.equal(await run("document.querySelectorAll('.comparison-table thead th').length"),4);
  await run("document.querySelector('#close-modal').click();document.querySelector('[data-favorite]').click();document.querySelector('#favorites-only').click()");assert.equal(await run("document.querySelectorAll('.apartment-card').length"),1);
  await run("document.querySelector('#favorites-only').click();document.querySelector('[name=cash]').value=100000;document.querySelector('#finance-form').requestSubmit();document.querySelector('#affordable').click()");assert.ok(await run("document.querySelectorAll('.apartment-card').length>0"));
  await run("document.querySelector('#affordable').click();document.querySelector('#finance-form').reset();document.querySelector('[data-area=\"84\"]').click()");await delay(100);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await run('scrollTo(0,0)');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'mobile no overflow');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('artifacts/mobile.png',Buffer.from(mobile.data,'base64'));
  await run("document.querySelector('[data-detail]').click()");assert.equal(await run("document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth"),true,'mobile dialog no overflow');
  await run("document.querySelector('#close-modal').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'320px no overflow');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:process.argv[2]?siteUrl:'http://127.0.0.1:4173/dist/'});await delay(1500);
  assert.equal(await run("document.querySelectorAll('.apartment-card').length"),24,'build works at project subpath');
  assert.deepEqual(errors,[],'no browser exceptions');
  console.log('Browser checks passed: 4,860 apartments, pagination, region/search/area, detail calculator, comparison, favorites, budget filters, responsive layouts, project path. URL: '+siteUrl);
  await send('Browser.close').catch(()=>{});
}finally{if(ws)ws.close();child.kill();}
