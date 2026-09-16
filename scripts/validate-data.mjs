export function validateDataset(data){
  if(!Array.isArray(data.apartments)||!data.apartments.length)throw Error('No apartments');
  const ids=new Set();
  for(const a of data.apartments){
    if(!a.id||ids.has(a.id))throw Error('Missing/duplicate apartment ID');ids.add(a.id);
    if(!['서울','경기'].includes(a.region)||!Number.isInteger(a.households)||a.households<400)throw Error(`Out of scope: ${a.id}`);
    if(!a.name||!a.address||!a.source?.startsWith('https://'))throw Error(`Missing provenance: ${a.id}`);
    for(const [area,p] of Object.entries(a.prices)){
      if(!['59','84'].includes(area))throw Error('Invalid area group');
      if(p&&(!(p.amount>0)||!p.date||!p.source?.startsWith('https://')||!p.kind))throw Error(`Invalid price: ${a.id}`);
      if(p?.area&&!(area==='59'?p.area>=58&&p.area<=60:p.area>=83&&p.area<=85))throw Error(`Area mismatch: ${a.id}`);
    }
  }
  return true;
}
