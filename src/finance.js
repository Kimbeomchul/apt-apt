// Money is consistently expressed in 만원. All outputs are scenario estimates.
export function payment(principal, rate, years) {
  if (principal <= 0) return 0;
  if (!Number.isFinite(principal) || !Number.isFinite(rate) || !Number.isFinite(years) || rate < 0 || years <= 0) throw new RangeError('Invalid amortization input');
  const n = years * 12, r = rate / 1200;
  return r === 0 ? principal / n : principal * r / -Math.expm1(-n * Math.log1p(r));
}
export function principalForPayment(monthly, rate, years) {
  return monthly <= 0 ? 0 : monthly / payment(1, rate, years);
}
export function policyCap(price) {
  return price <= 150000 ? 60000 : price <= 250000 ? 40000 : 20000;
}
export function validateProfile(p) {
  const errors = [];
  for (const name of ['income','cash','takeHome','living','debtBalance','debtAnnual','debtMonthly','deposit','rate','stress','reserve','costRate','fixedCosts']) {
    if (!Number.isFinite(p[name]) || p[name] < 0) errors.push('금액과 금리는 0 이상의 숫자로 입력해주세요.');
  }
  if (![10,15,20,30].includes(p.years)) errors.push('대출 기간을 확인해주세요.');
  if (p.debtBalance > 0 && p.debtAnnual <= 0) errors.push('기존 대출이 있으면 규정상 연 원리금을 입력해주세요.');
  if (p.debtBalance > 0 && p.debtMonthly <= 0) errors.push('기존 대출의 실제 월 납입액을 입력해주세요.');
  if (p.debtBalance === 0 && (p.debtAnnual > 0 || p.debtMonthly > 0)) errors.push('기존 대출 잔액과 상환액을 함께 확인해주세요.');
  if (p.cash + (p.depositReady ? p.deposit : 0) < p.reserve) errors.push('비상금이 사용 가능한 자산보다 큽니다.');
  return [...new Set(errors)];
}
export function cashAvailable(p) {
  return Math.max(0, p.cash + (p.depositReady ? p.deposit : 0) - p.reserve);
}
export function evaluate(price, p, options = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const regulated = options.regulated ?? true;
  const ltv = regulated ? 0.4 : 0.7;
  const dsr = principalForPayment(Math.max(0, p.income * 0.4 - p.debtAnnual) / 12, p.rate + p.stress, p.years);
  const limits = [
    {name:'담보비율 LTV', amount:(options.valuation ?? price) * ltv},
    {name:'소득·기존 부채 DSR', amount:dsr},
    {name:'주택가격별 정책 상한', amount:policyCap(options.policyPrice ?? price)}
  ];
  const supported = p.homeStatus === 'none' && !(p.creditRestriction && regulated);
  const maxLoan = Math.max(0, Math.min(...limits.map(x => x.amount)));
  const available = cashAvailable(p), costs = price * p.costRate / 100 + p.fixedCosts;
  const requiredLoan = Math.max(0, price + costs - available);
  const loan = Math.min(requiredLoan, maxLoan);
  const monthly = payment(loan, p.rate, p.years);
  const stressedMonthly = payment(loan, p.rate + 2, p.years);
  const left = p.takeHome - p.living - p.debtMonthly - monthly;
  const stressLeft = p.takeHome * 0.8 - p.living - p.debtMonthly - stressedMonthly;
  const shortage = Math.max(0, requiredLoan - maxLoan);
  const comfortable = shortage < 0.01 && monthly + p.debtMonthly <= p.takeHome * 0.35 && stressLeft >= 0;
  const status = !supported ? 'review' : shortage >= 0.01 ? 'short' : left < 0 ? 'burden' : comfortable ? 'safe' : 'stretch';
  return {price, costs, available, limits, maxLoan, loan, monthly, stressedMonthly, left, stressLeft, shortage, status, ltv, supported, binding:limits.reduce((a,b)=>a.amount<b.amount?a:b).name};
}
// Search each policy segment independently; the loan cap drops above 15억 and 25억.
export function budgetFor(p, stable = false, regulated = true) {
  if (p.homeStatus !== 'none' || (p.creditRestriction && regulated)) return null;
  const maxPrice = Math.max(0, (cashAvailable(p) + 60000 - p.fixedCosts) / (1+p.costRate/100));
  let result = 0;
  for (const [start, end] of [[0,150000],[150000.0001,250000],[250000.0001,Math.max(250000.0001,maxPrice)]]) {
    let lo = start, hi = Math.min(end,maxPrice);
    if (hi < lo) continue;
    const possible = value => {const e=evaluate(Math.max(value,0.00001),p,{regulated});return e.shortage<0.000001 && (stable ? e.status==='safe' : e.left>=0);};
    if (!possible(lo)) continue;
    for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(possible(mid))lo=mid;else hi=mid;}
    result=Math.max(result,lo);
  }
  return Math.floor(result);
}
export function priceTier(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  return price >= 200000 ? 1 : price >= 150000 ? 2 : price >= 100000 ? 3 : price >= 70000 ? 4 : 5;
}
export const statusLabels = {safe:'안정 예산 안',stretch:'최대 예산 안',short:'추가 자금 필요',burden:'월 상환 부담',review:'별도 상담 필요'};
