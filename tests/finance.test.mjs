import test from 'node:test';
import assert from 'node:assert/strict';
import {payment,principalForPayment,policyCap,validateProfile,evaluate,budgetFor,cashAvailable,priceTier,scenarioFor} from '../src/finance.js';
const profile={income:7000,cash:30000,takeHome:480,living:200,debtBalance:0,debtAnnual:0,debtMonthly:0,deposit:0,depositReady:false,rate:4.5,stress:3,years:30,reserve:3000,costRate:4,fixedCosts:1000,homeStatus:'none',creditRestriction:false};
test('원리금균등: 1억원·연 4.5%·30년의 월 납입액 약 50.67만원',()=>assert.ok(Math.abs(payment(10000,4.5,30)-50.6685)<.001));
test('무이자와 원금 역산',()=>{assert.equal(payment(3600,0,30),10);assert.ok(Math.abs(principalForPayment(payment(12345,7.5,30),7.5,30)-12345)<.00001);});
test('15억·25억 경계에서 절대한도 변경',()=>{assert.equal(policyCap(150000),60000);assert.equal(policyCap(150001),40000);assert.equal(policyCap(250000),40000);assert.equal(policyCap(250001),20000);});
test('보증금 반환 확정 시에만 순액을 반영',()=>{assert.equal(cashAvailable({...profile,deposit:20000}),27000);assert.equal(cashAvailable({...profile,deposit:20000,depositReady:true}),47000);});
test('기존 부채 상환액 누락은 계산 거부',()=>assert.ok(validateProfile({...profile,debtBalance:3000}).length));
test('부채 원리금이 DSR 여력을 소진하면 신규 한도 0',()=>{const e=evaluate(70000,{...profile,debtBalance:5000,debtAnnual:3000,debtMonthly:250});assert.equal(e.maxLoan,0);assert.ok(e.shortage>0);});
test('기존 부채의 잔액을 현금에서 이중 차감하지 않음',()=>assert.equal(cashAvailable({...profile,debtBalance:5000}),cashAvailable(profile)));
test('이자 심사용 스트레스 금리와 실제 월 납입액 구별',()=>{const a=evaluate(140000,profile),b=evaluate(140000,{...profile,stress:0});assert.ok(a.maxLoan<b.maxLoan);assert.equal(a.monthly,payment(a.loan,profile.rate,profile.years));});
test('필요자금이 적으면 최대한도가 아닌 필요한 대출만 사용',()=>{const e=evaluate(30000,{...profile,cash:40000});assert.equal(e.loan,0);assert.equal(e.monthly,0);assert.equal(e.shortage,0);});
test('가격·상태 미확인에 0원 구매 가능 표시 안 함',()=>{assert.equal(evaluate(undefined,profile),null);assert.equal(evaluate(0,profile),null);assert.equal(priceTier(undefined),null);});
test('주택 보유·기존 혼합 입력·신용취득제한은 별도 검토',()=>{for(const homeStatus of ['first','sell','keep']){assert.equal(evaluate(60000,{...profile,homeStatus}).status,'review');assert.equal(budgetFor({...profile,homeStatus}),null);}assert.equal(evaluate(60000,{...profile,creditRestriction:true}).status,'review');});

test('생애최초는 규제지역에서 LTV만 변경하고 DSR은 유지',()=>{
  const p={...profile,income:30000,takeHome:2000,purchaseHistory:'first'};
  const first=evaluate(60000,p),general=evaluate(60000,{...p,purchaseHistory:'previous'});
  assert.equal(first.ltv,.7);assert.equal(general.ltv,.4);
  assert.equal(first.maxLoan,42000);assert.equal(general.maxLoan,24000);
  assert.equal(first.limits[1].amount,general.limits[1].amount);
  assert.ok(first.shortage<general.shortage);
  assert.ok(budgetFor(p)>budgetFor({...p,purchaseHistory:'previous'}));
});
test('생애최초도 소득 한도가 작으면 LTV 증가 효과 없음',()=>{
  const a=evaluate(90000,{...profile,purchaseHistory:'first'}),b=evaluate(90000,profile);
  assert.equal(a.maxLoan,b.maxLoan);assert.equal(a.binding,'소득·기존 부채 DSR');
});
test('무주택과 생애최초 불확실·모순 조합은 계산 보류',()=>{
  for(const p of [{...profile,purchaseHistory:'unknown'},{...profile,homeStatus:'keep',purchaseHistory:'first'}]){
    assert.equal(budgetFor(p),null);assert.equal(evaluate(60000,p).supported,false);
    assert.ok(scenarioFor(p).reasons.length);
  }
  assert.ok(validateProfile({...profile,homeStatus:'sell',purchaseHistory:'first'}).some(x=>x.includes('모순')));
});
test('생애최초·규제 여부·6/9/15/25억 경계에서 상한 유지',()=>{
  const p={...profile,purchaseHistory:'first',income:100000,takeHome:10000};
  for(const regulated of [true,false])for(const price of [60000,90000,150000,150001,250000,250001]){
    const e=evaluate(price,p,{regulated});
    assert.equal(e.maxLoan,Math.min(price*.7,policyCap(price)));
    assert.equal(e.scenario.moveInMonths,6);assert.ok(e.scenario.policyVersion);
  }
});
test('최대 예산이 비용·현금·대출 및 월 현금흐름 조건 충족',()=>{const max=budgetFor(profile),e=evaluate(max,profile);assert.ok(max>0);assert.ok(e.shortage<1);assert.ok(e.left>=0);assert.ok(budgetFor(profile,true)<=max);});
test('불연속 구간을 건너서 가능한 구매 예산을 찾음',()=>{const p={...profile,cash:210000,income:100000,takeHome:10000,costRate:0,fixedCosts:0,reserve:0};assert.equal(budgetFor(p),250000);assert.ok(evaluate(250001,p).shortage>0);});
test('비상금이 자산 초과면 오류',()=>assert.ok(validateProfile({...profile,reserve:50000}).length));
test('거액 자기자금에서도 하드코딩한 집값 상한 없음',()=>{const p={...profile,cash:1000000,reserve:0,fixedCosts:0,costRate:0,income:100000,takeHome:10000};assert.ok(budgetFor(p)>1000000);});
