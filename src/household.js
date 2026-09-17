import {calculateGift} from './gift.js';
export function giftInput(raw,prefix){
  const g={};for(const key of ['enabled','amount','relation','priorAmount','priorDeduction','priorSpecial','priorTax','usedDeduction','special','specialUsed','onTime'])g[key]=raw[prefix+key];
  return g;
}
export function composeHousehold(raw){
  const couple=raw.householdMode==='couple',issues=[];
  const fields=['income','cash','takeHome','debtBalance','debtAnnual','debtMonthly'];
  const p={...raw,householdMode:couple?'couple':'single'};
  for(const field of fields){
    const own=raw[field],spouse=couple?raw['spouse'+field]:0;
    if(!Number.isFinite(own)||own<0)issues.push('본인 소득·현금·부채를 0 이상의 숫자로 입력하세요.');
    if(!Number.isFinite(spouse)||spouse<0)issues.push('배우자 소득·현금·부채를 0 이상의 숫자로 입력하세요.');
    p[field]=own+spouse;
  }
  for(const [label,prefix] of [['본인',''],...(couple?[['배우자','spouse']]:[])]){
    const balance=raw[prefix+'debtBalance'],annual=raw[prefix+'debtAnnual'],monthly=raw[prefix+'debtMonthly'];
    if(balance>0&&(annual<=0||monthly<=0))issues.push(label+'의 남은 부채가 있으면 연 원리금과 월 납입액도 입력하세요.');
    if(balance===0&&(annual>0||monthly>0))issues.push(label+'의 부채 잔액과 상환액을 함께 확인하세요.');
  }
  const gifts=[calculateGift(giftInput(raw,'giftSelf')),...(couple?[calculateGift(giftInput(raw,'giftSpouse'))]:[])];
  const baseCash=p.cash;
  let giftAddition=0;
  gifts.forEach((g,i)=>{
    if(g.issues.length){issues.push(...g.issues.map(e=>(i?'배우자':'본인')+e));return;}
    if(!g.enabled)return;
    const internal=couple&&g.relation==='spouse';
    const donorCash=i===0?raw.spousecash:raw.cash;
    if(internal&&g.amount>donorCash)issues.push('배우자 간 증여액이 증여자의 증여 전 현금보다 큽니다.');
    giftAddition+=internal?-g.tax:g.net;
  });
  p.cash+=giftAddition;
  p.creditStatus=raw.creditStatus||'none';
  if(couple){
    const statuses=[p.creditStatus,raw.spousecreditStatus||'none'];
    p.creditStatus=statuses.includes('unknown')?'unknown':statuses.includes('active')?'active':statuses.includes('repaid')?'repaid':'none';
  }
  p.inputIssues=[...new Set(issues)];
  p.funding={ownIncome:raw.income,spouseIncome:couple?raw.spouseincome:0,ownCash:raw.cash,spouseCash:couple?raw.spousecash:0,baseCash,giftAddition,giftTax:gifts.reduce((n,g)=>n+(g.tax||0),0),gifts};
  return p;
}
