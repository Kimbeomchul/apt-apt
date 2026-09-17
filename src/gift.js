// Adult Korean-resident recipient, ordinary cash gift, amounts in 만원.
export const giftPolicy={checkedAt:'2026-09-17',version:'2026-09-17-cash-v1',
  source:'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6533',
  specialSource:'https://www.nts.go.kr/webtv/na/ntt/selectNttList.do?bbsId=30148&mi=10675&nttSn=1335073',
  allowances:{parent:5000,spouse:60000,child:5000,relative:1000,other:0},
  brackets:[[10000,.1,0],[50000,.2,1000],[100000,.3,6000],[300000,.4,16000],[Infinity,.5,46000]]};
export function giftScale(base){
  if(base<=0)return {tax:0,rate:0,deduction:0};
  const [,rate,deduction]=giftPolicy.brackets.find(([limit])=>base<=limit);
  return {tax:base*rate-deduction,rate,deduction};
}
export function calculateGift(g){
  if(!g.enabled)return {enabled:false,issues:[],tax:0,net:0,amount:0};
  const issues=[];
  const keys=['amount','priorAmount','priorDeduction','priorSpecial','priorTax','usedDeduction','specialUsed'];
  for(const key of keys)if(!Number.isFinite(g[key])||g[key]<0||g[key]>10000000)issues.push(' 증여 금액·이력은 0~10,000,000만원으로 입력하세요.');
  const allowance=giftPolicy.allowances[g.relation];
  if(allowance===undefined)issues.push(' 조부모 증여·비거주자·미성년자·비현금·특례 증여는 별도 세무 확인이 필요합니다.');
  if(g.usedDeduction>allowance)issues.push(' 사용한 일반공제가 관계별 공제 한도를 초과합니다.');
  if(g.priorDeduction>g.usedDeduction)issues.push(' 동일인 과거 공제는 관계별 전체 사용 공제보다 클 수 없습니다.');
  if(g.priorDeduction+g.priorSpecial>g.priorAmount)issues.push(' 과거 공제 합계가 과거 증여액보다 큽니다.');
  if(g.specialUsed>10000||g.priorSpecial>g.specialUsed)issues.push(' 혼인·출산 기사용 공제는 통합 1억원 이내이며 과거 동일인 공제를 포함해야 합니다.');
  if(g.special&&g.relation!=='parent')issues.push(' 혼인·출산 추가공제는 이 계산에서 부모 증여에만 적용합니다.');
  if(g.priorTax>giftScale(Math.max(0,g.priorAmount-g.priorDeduction-g.priorSpecial)).tax+.001)issues.push(' 과거 산출세액이 입력된 과거 과세표준의 산출세액보다 큽니다. 신고서를 확인하세요.');
  if(issues.length)return {enabled:true,issues:[...new Set(issues)],tax:null,net:null,amount:g.amount};
  const included=g.priorAmount>=1000;
  const priorBase=included?Math.max(0,g.priorAmount-g.priorDeduction-g.priorSpecial):0;
  const deduction=Math.min(g.amount,Math.max(0,allowance-g.usedDeduction));
  const special=g.special?Math.min(Math.max(0,g.amount-deduction),10000-g.specialUsed):0;
  const base=Math.max(0,g.amount-deduction-special)+priorBase;
  const scale=giftScale(base);
  // 과세표준 50만원 미만 과세최저한; prior tax credit is capped proportionally.
  const calculated=base<50?0:scale.tax;
  const priorCredit=included&&base>0?Math.min(g.priorTax,calculated*priorBase/base):0;
  const beforeFiling=Math.max(0,calculated-priorCredit);
  const filingCredit=g.onTime?beforeFiling*.03:0;
  const tax=Math.round((beforeFiling-filingCredit)*10000)/10000;
  return {enabled:true,issues:[],amount:g.amount,allowance,deduction,special,priorBase,base,rate:scale.rate,progressiveDeduction:scale.deduction,calculated,priorCredit,filingCredit,tax,net:g.amount-tax,relation:g.relation};
}
