import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {districtOptions,matchesQuality,readSearchParams,sharedSearchUrl,windowComparison} from '../src/explore.js';
test('시군구 목록은 지역에 맞추고 중복 제거',()=>{
  const rows=[{region:'서울',district:'강남구'},{region:'서울',district:'강남구'},{region:'경기',district:'군포시'}];
  assert.deepEqual(districtOptions(rows,'서울'),['서울|강남구']);assert.equal(districtOptions(rows).length,2);
});
test('미확인·소표본·5건 이상을 선택 평형 가격으로 구분',()=>{
  assert.equal(matchesQuality(null,'all'),true);assert.equal(matchesQuality(null,'known'),false);
  assert.equal(matchesQuality({sampleCount:4},'sufficient'),false);assert.equal(matchesQuality({sampleCount:5},'sufficient'),true);
});
test('공유 링크는 검색 조건만 왕복하고 금융정보·관심·예산 제외',()=>{
  const state={region:'서울',district:'서울|강남구',area:'59',priceBand:'6to8',quality:'sufficient',sort:'price-desc',search:'래미안 & 서울',income:12345,cash:99999,profile:{gift:10000},affordable:true,favoritesOnly:true};
  const url=sharedSearchUrl('https://example.com/apt/?income=12345&token=secret',state);
  assert.ok(!url.includes('income')&&!url.includes('99999')&&!url.includes('token')&&!url.includes('affordable'));
  assert.deepEqual(readSearchParams(new URL(url).search),Object.fromEntries(['region','district','area','priceBand','quality','sort','search'].map(k=>[k,state[k]])));
  assert.equal(readSearchParams('?region=bad&area=100&quality=bad').area,'84');
});
test('변화율은 양쪽 3건 이상만 표시하고 거래 없음을 구분',()=>{
  assert.equal(windowComparison({count:0}).label,'거래 없음');
  assert.equal(windowComparison({count:4,previous_count:2,change_pct:30}).change,null);
  assert.equal(windowComparison({count:3,previous_count:3,change_pct:-5}).change,-5);
});
test('배포용 기간별 통계는 공식 원장의 전체 ID·구간과 일치',async()=>{
  for(const region of ['seoul','gyeonggi']){
    const [source,history]=await Promise.all([`research/regions/${region}.json`,`data/price-history/${region}.json`].map(async path=>JSON.parse(await readFile(path,'utf8'))));
    assert.equal(history.asOf,source.as_of);assert.equal(Object.keys(history.apartments).length,source.apartments.length);
    for(const a of source.apartments)assert.deepEqual(history.apartments[a.id],a.price_windows);
  }
});
