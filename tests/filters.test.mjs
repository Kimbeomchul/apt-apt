import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesPriceBand,priceBands} from '../src/filters.js';
test('가격대 경계는 중복 없이 구분하고 15억은 포함',()=>{
  for(const [price,id] of [[59999,'under6'],[60000,'6to8'],[79999,'6to8'],[80000,'8to11'],[109999,'8to11'],[110000,'11to15'],[150000,'11to15']]){
    assert.deepEqual(priceBands.filter(b=>b.id!=='all'&&matchesPriceBand(price,b.id)).map(b=>b.id),[id]);
  }
  assert.equal(matchesPriceBand(150001,'11to15'),false);
});
test('가격 미확인과 15억 초과는 전체에서 보존',()=>{
  for(const price of [null,undefined,NaN,0,160000]){
    assert.equal(matchesPriceBand(price,'all'),true);
    assert.ok(priceBands.filter(b=>b.id!=='all').every(b=>!matchesPriceBand(price,b.id)));
  }
});
