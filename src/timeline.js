// Amounts in 만원. Loan availability is an assumption, never an approval.
export function fundingTimeline({price,costs,loan,cash,contractRate,middleRate,dates,receipts}) {
  const amounts=[price,costs,loan,cash,contractRate,middleRate];
  if(amounts.some(v=>!Number.isFinite(v)||v<0)||price<=0||contractRate+middleRate>100)throw Error('금액과 계약금·중도금 비율을 확인해주세요.');
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(dates.length!==3||dates.some(d=>!validDate(d))||dates[0]>dates[1]||dates[1]>dates[2])throw Error('계약일 ≤ 중도금일 ≤ 잔금일 순서로 입력해주세요.');
  if(receipts.some(r=>!Number.isFinite(r.amount)||r.amount<0||(r.amount>0&&!validDate(r.date))))throw Error('추가 자금의 금액과 수령일을 확인해주세요.');
  const due=[price*contractRate/100,price*middleRate/100,price*(100-contractRate-middleRate)/100+costs];
  let spent=0;
  return dates.map((date,i)=>{spent+=due[i];const available=cash+receipts.filter(r=>r.date<=date).reduce((sum,r)=>sum+r.amount,0)+(i===2?loan:0);return {date,label:['계약금','중도금','잔금·부대비용'][i],due:due[i],available,spent,balance:available-spent,shortage:Math.max(0,spent-available)};});
}
