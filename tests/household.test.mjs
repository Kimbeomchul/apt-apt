import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateGift,giftScale} from '../src/gift.js';
import {composeHousehold} from '../src/household.js';
import {evaluate,budgetFor,scenarioFor,validateProfile} from '../src/finance.js';
const gift={enabled:true,amount:10000,relation:'parent',priorAmount:0,priorDeduction:0,priorSpecial:0,priorTax:0,usedDeduction:0,special:false,specialUsed:0,onTime:true};
const raw={householdMode:'single',income:7000,cash:30000,takeHome:480,living:200,debtBalance:0,debtAnnual:0,debtMonthly:0,deposit:0,depositReady:false,rate:4.5,stress:3,years:30,reserve:3000,costRate:4,fixedCosts:1000,homeStatus:'none',purchaseHistory:'previous',creditStatus:'none',spouseincome:5000,spousecash:20000,spousetakeHome:350,spousedebtBalance:1000,spousedebtAnnual:300,spousedebtMonthly:25,spousecreditStatus:'none'};
const giftRaw=(g,prefix='giftSelf')=>Object.fromEntries(Object.entries(g).map(([k,v])=>[prefix+k,v]));
test('증여 입력을 지우거나 비정상 값을 넣어도 예외 없이 계산 보류',()=>{
  for(const key of ['amount','priorAmount','priorDeduction','priorSpecial','priorTax','usedDeduction','specialUsed'])for(const value of [NaN,undefined,Infinity,-1]){
    const g=calculateGift({...gift,[key]:value});assert.ok(g.issues.length);assert.equal(g.tax,null);
  }
});
test('부모 성년자 현금 1억원: 일반공제 5천만원, 세금 485만원',()=>{
  const g=calculateGift(gift);assert.equal(g.deduction,5000);assert.equal(g.tax,485);assert.equal(g.net,9515);
  assert.equal(calculateGift({...gift,onTime:false}).tax,500);
  assert.equal(calculateGift({...gift,amount:5000}).tax,0);
});
test('증여세 5개 누진구간과 과세최저한',()=>{
  for(const [base,tax] of [[10000,1000],[50000,9000],[100000,24000],[300000,104000],[400000,154000]])assert.equal(giftScale(base).tax,tax);
  assert.equal(calculateGift({...gift,relation:'other',amount:49}).tax,0);
  assert.equal(calculateGift({...gift,relation:'other',amount:50}).tax,4.85);
});
test('관계별 공제·혼인출산 통합 한도',()=>{
  assert.equal(calculateGift({...gift,relation:'spouse',amount:60000}).tax,0);
  assert.equal(calculateGift({...gift,relation:'relative',amount:2000}).tax,97);
  assert.equal(calculateGift({...gift,amount:15000,special:true}).tax,0);
  assert.equal(calculateGift({...gift,amount:15000,special:true,specialUsed:10000}).tax,970);
  assert.ok(calculateGift({...gift,relation:'spouse',special:true}).issues.length);
});
test('과거 증여 합산·기납부 산출세액 공제 및 다른 존속 공제 사용',()=>{
  const g=calculateGift({...gift,priorAmount:10000,priorDeduction:5000,usedDeduction:5000,priorTax:500});
  assert.equal(g.base,15000);assert.equal(g.calculated,2000);assert.equal(g.priorCredit,500);assert.equal(g.tax,1455);
  const other=calculateGift({...gift,usedDeduction:5000});assert.equal(other.deduction,0);assert.equal(other.tax,970);
  assert.equal(calculateGift({...gift,priorAmount:999,priorDeduction:999,usedDeduction:999}).priorBase,0);
  assert.ok(calculateGift({...gift,priorDeduction:6000,usedDeduction:5000}).issues.length);
});
test('단독 전환은 배우자 값 제외, 부부는 부채까지 합산하며 상한은 한번 적용',()=>{
  const solo=composeHousehold(raw),couple=composeHousehold({...raw,householdMode:'couple'});
  assert.equal(solo.income,7000);assert.equal(solo.cash,30000);
  assert.equal(couple.income,12000);assert.equal(couple.cash,50000);assert.equal(couple.debtAnnual,300);assert.equal(couple.takeHome,830);
  assert.equal(evaluate(140000,couple).limits[2].amount,60000);
  assert.ok(scenarioFor(couple).notes.some(x=>x.includes('부부')));
  assert.ok(budgetFor(couple)>budgetFor(solo));
});
test('본인·배우자 각각 증여 계산 후 순액만 반영',()=>{
  const p=composeHousehold({...raw,householdMode:'couple',...giftRaw(gift),...giftRaw(gift,'giftSpouse')});
  assert.equal(p.cash,69030);assert.equal(p.funding.giftTax,970);
  assert.equal(composeHousehold({...raw,...giftRaw(gift),...giftRaw(gift,'giftSpouse')}).cash,39515);
});
test('배우자 내부 증여는 자산 중복 증가 방지, 세금만 차감',()=>{
  const p=composeHousehold({...raw,householdMode:'couple',spousecash:100000,...giftRaw({...gift,relation:'spouse',amount:70000})});
  assert.equal(p.cash,129030);assert.equal(p.funding.giftAddition,-970);
  assert.ok(composeHousehold({...raw,householdMode:'couple',...giftRaw({...gift,relation:'spouse',amount:30000})}).inputIssues.length);
});
test('배우자 부채 누락·미지원 증여는 예산 계산 보류',()=>{
  const debt=composeHousehold({...raw,householdMode:'couple',spousedebtAnnual:0});
  assert.ok(validateProfile(debt).some(e=>e.includes('배우자')));assert.equal(budgetFor(debt),null);
  assert.equal(budgetFor(composeHousehold({...raw,...giftRaw({...gift,relation:'review'})})),null);
});
test('상환 완료는 조건부 계산, 활성·미확인 및 배우자 상태는 보류',()=>{
  for(const creditStatus of ['active','unknown'])assert.equal(budgetFor(composeHousehold({...raw,creditStatus})),null);
  const paid=composeHousehold({...raw,creditStatus:'repaid'});
  assert.ok(budgetFor(paid)>0);assert.equal(scenarioFor(paid).conditional,true);
  assert.equal(budgetFor(composeHousehold({...raw,householdMode:'couple',spousecreditStatus:'active'})),null);
  assert.equal(paid.debtBalance,0);
  const otherDebt=composeHousehold({...raw,creditStatus:'repaid',debtBalance:1000,debtAnnual:300,debtMonthly:25});assert.equal(otherDebt.debtAnnual,300);
});
