export const priceBands=[
  {id:'all',label:'전체',min:0,max:Infinity},
  {id:'under6',label:'6억 미만',min:0,max:60000},
  {id:'6to8',label:'6~8억',min:60000,max:80000},
  {id:'8to11',label:'8~11억',min:80000,max:110000},
  {id:'11to15',label:'11~15억',min:110000,max:150000,inclusive:true},
];
export function matchesPriceBand(amount,id){
  if(id==='all')return true;
  const band=priceBands.find(b=>b.id===id);
  return !!band&&Number.isFinite(amount)&&amount>0&&amount>=band.min&&(band.inclusive?amount<=band.max:amount<band.max);
}
