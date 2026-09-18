import {priceBands} from './filters.js';
export const districtKey=a=>`${a.region}|${a.district}`;
export function districtOptions(apartments,region='all'){
  return [...new Set(apartments.filter(a=>region==='all'||a.region===region).map(districtKey))].sort((a,b)=>a.localeCompare(b,'ko'));
}
export function matchesQuality(price,quality){return quality==='all'||(quality==='known'?!!price:quality==='sufficient'?price?.sampleCount>=5:false);}
export function readSearchParams(search){
  const p=new URLSearchParams(search),allowed=(key,values,fallback)=>values.includes(p.get(key))?p.get(key):fallback;
  return {region:allowed('region',['all','서울','경기'],'all'),district:(p.get('district')||'all').slice(0,80),area:allowed('area',['59','84'],'84'),priceBand:allowed('band',priceBands.map(b=>b.id),'all'),sort:allowed('sort',['match','price','price-desc','households','newest'],'match'),quality:allowed('quality',['all','known','sufficient'],'all'),search:(p.get('q')||'').slice(0,100)};
}
// Deliberately allow only public search criteria; never serialize financial inputs.
export function sharedSearchUrl(base,state){
  const url=new URL(base);url.search='';url.hash='explore';
  for(const [key,value,defaultValue] of [['region',state.region,'all'],['district',state.district,'all'],['area',state.area,'84'],['band',state.priceBand,'all'],['sort',state.sort,'match'],['quality',state.quality,'all'],['q',state.search,'']])if(value&&value!==defaultValue)url.searchParams.set(key,value);
  return url.href;
}
export function windowComparison(w){
  if(!w||w.count===0)return {label:'거래 없음',change:null};
  const change=w.count>=3&&w.previous_count>=3&&Number.isFinite(w.change_pct)?w.change_pct:null;
  return {label:w.count<5?'소표본':'5건 이상',change};
}
