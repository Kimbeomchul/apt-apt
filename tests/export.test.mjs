import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectPrice} from '../scripts/export-app.mjs';
const data=JSON.parse(await readFile('data/apartments.json','utf8'));
const regions=await Promise.all(['seoul','gyeonggi'].map(async r=>JSON.parse(await readFile(`research/regions/${r}.json`,'utf8'))));
test('공식 마스터 전체 ID와 가격 없는 단지도 보존',()=>{
  const records=regions.flatMap(r=>r.apartments);
  assert.equal(data.apartments.length,4860);
  assert.deepEqual(data.apartments.map(a=>a.id).sort(),records.map(a=>a.id).sort());
  assert.ok(data.apartments.some(a=>!a.prices['59']&&!a.prices['84']));
  for(const [i,a] of data.apartments.entries())for(const area of ['59','84']){
    const p=a.prices[area];
    if(p){const w=records[i].price_windows[area][p.periodMonths];assert.equal(p.amount,w.median_manwon);assert.equal(p.sampleCount,w.count);}
    else assert.equal(records[i].price_windows[area]['12'].count,0);
  }
});
test('대표가격 기간 확대와 소표본·거래 없음 보존',()=>{
  const w=count=>({count,median_manwon:count?50000:null,from_exclusive:'2026-06-16',through:'2026-09-16'});
  assert.equal(selectPrice({'3':w(5),'6':w(10),'12':w(20)},'https://example.com').periodMonths,3);
  assert.equal(selectPrice({'3':w(4),'6':w(10),'12':w(20)},'https://example.com').periodMonths,6);
  assert.match(selectPrice({'3':w(0),'6':w(0),'12':w(1)},'https://example.com').kind,/소표본/);
  assert.equal(selectPrice({'3':w(0),'6':w(0),'12':w(0)},'https://example.com'),null);
});
