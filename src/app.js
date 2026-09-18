import {fundingTimeline} from './timeline.js';
import {payment,evaluate,budgetFor,cashAvailable,priceTier,statusLabels,validateProfile,profileIssues,scenarioFor} from './finance.js';
import {districtKey,districtOptions,matchesQuality,readSearchParams,sharedSearchUrl,windowComparison} from './explore.js';
import {composeHousehold} from './household.js';
import {setupHousehold,syncHousehold} from './household-ui.js';
import {priceBands,matchesPriceBand} from './filters.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,rounded=false)=>v===null||v===undefined?'확인 필요':v>=10000?`${(v/10000).toLocaleString('ko-KR',{maximumFractionDigits:rounded?1:2})}억`:`${Math.round(v).toLocaleString('ko-KR')}만원`;
const taxMoney=v=>v===null||v===undefined?'확인 필요':v.toLocaleString('ko-KR',{maximumFractionDigits:4})+'만원';
const monthly=v=>`${Math.round(v).toLocaleString('ko-KR')}만원`;
const safeUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const link=(url,title,cls='source-link')=>`<a class="${cls}" href="${escape(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a>`;
const form=$('#finance-form');
setupHousehold(form);
for(const input of form.querySelectorAll('input[type=number]'))input.step='any';
const PAGE_SIZE=24;
let applied=false,appliedFields=null,returnToDetail=null;
const state={district:'all',quality:'all',page:1,listKey:'',priceBand:'all',data:null,policy:null,region:'all',area:'84',search:'',sort:'match',affordable:false,favoritesOnly:false,compared:[],favorites:new Set(),profile:null};
let scenarios=[];
try{const savedScenarios=JSON.parse(localStorage.getItem('jip-scenarios')||'[]');if(Array.isArray(savedScenarios))scenarios=savedScenarios.slice(0,5);}catch{}
try{const favorites=JSON.parse(localStorage.getItem('jip-favorites')||'[]');if(Array.isArray(favorites))state.favorites=new Set(favorites.filter(v=>typeof v==='string'));}catch{}
function readProfile(){
  const f=new FormData(form),p={};
  for(const [k,v] of f)p[k]=['homeStatus','purchaseHistory','creditStatus','spousecreditStatus','householdMode'].includes(k)||k.endsWith('relation')?v:v==='on'?true:v.trim()===''?NaN:Number(v);
  p.depositReady=f.has('depositReady');
  for(const prefix of ['giftSelf','giftSpouse'])for(const key of ['enabled','special','onTime'])p[prefix+key]=f.has(prefix+key);
  const result=composeHousehold(p);
  result.inputIssues=validateProfile(result);
  return result;
}
state.profile=readProfile();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
function naver(a){return a.naverUrl||`https://search.naver.com/search.naver?query=${encodeURIComponent(a.address+' '+a.name+' 네이버 부동산')}`;}
function naverLabel(a){return a.naverUrl?'네이버 매물 보기':'네이버에서 매물 찾기';}
function getApartment(id){return state.data.apartments.find(a=>a.id===id);}
function result(a,price=a.prices[state.area]?.amount){return evaluate(price,state.profile,{regulated:a.regulated??true});}
function renderCreditHelp(){
  const value=state.profile.creditStatus||'none';
  $('#credit-help').textContent={none:'실행 이력과 현재 부채를 구분합니다. 여러 건이면 해당 대출을 모두 확인해주세요.',active:'잔액 또는 대출 한도가 남아 있어 약정 확인이 필요합니다. 아파트 탐색은 계속할 수 있습니다.',unknown:'현재 상환·약정 상태를 확인해주세요. 확인 전에도 목록 탐색은 가능합니다.',repaid:'전액 상환·한도 해지와 약정 제한 종료를 가정해 계산합니다. 다른 대출 입력값은 자동 삭제하지 않습니다. 실제 약정의 제한 종료 여부는 대출 금융사에 확인하세요.'}[value];
}
function renderFunding(){
  const p=state.profile,f=p.funding;
  if(!f)return;
  for(const [i,prefix] of ['giftSelf','giftSpouse'].entries()){
    const g=f.gifts[i],target=$(`[data-gift-result="${prefix}"]`);
    if(!g?.enabled){target.innerHTML='';continue;}
    if(g.issues.length){target.innerHTML=`<p class="error">${escape(g.issues.join(' '))}</p>`;continue;}
    target.innerHTML=`<div><span>예상 증여세</span><strong>${taxMoney(g.tax)}</strong></div><div><span>세금 차감 후 증여금</span><strong>${taxMoney(g.net)}</strong></div><details><summary>계산 내역 보기</summary><p>일반공제 ${taxMoney(g.deduction)} · 혼인·출산 추가공제 ${taxMoney(g.special)}<br>합산 과세표준 ${taxMoney(g.base)} · 세율 ${g.rate*100}%<br>산출세액 ${taxMoney(g.calculated)} · 과거 납부세액공제 ${taxMoney(g.priorCredit)}<br>신고세액공제 ${taxMoney(g.filingCredit)}<br>2026-09-17 확인 · 일반 현금 증여 참고 계산. 증여 이력이 있으면 과거 공제·산출세액을 정확히 입력해야 합니다.</p></details>${p.householdMode==='couple'&&g.relation==='spouse'?'<p>부부 내부 이전: 원금은 가구 자산에 추가하지 않고 증여세만 차감합니다.</p>':''}`;
  }
  $('#funding-summary').innerHTML=p.inputIssues.length?'<p>입력값을 확인하면 합산 자금과 예산을 계산합니다.</p>':`<h3>${p.householdMode==='couple'?'우리 집':'나의'} 자금 요약</h3><dl><div><dt>세전 연소득 합계</dt><dd>${money(p.income)}</dd></div><div><dt>보유 현금 합계</dt><dd>${money(f.baseCash)}</dd></div><div><dt>증여 반영액 (세금 차감)</dt><dd>${money(f.giftAddition)}</dd></div><div><dt>예상 증여세 합계</dt><dd>${taxMoney(f.giftTax)}</dd></div><div class="funding-total"><dt>증여 반영 후 현금</dt><dd>${money(p.cash)}</dd></div></dl><p>비상금·부대비용은 구매 예산 계산에서 별도로 반영해요.</p>`;
}
function renderBudget(){
  if(!applied){$('#mobile-budget-value').textContent='예산 미설정';$('#budget-summary').innerHTML='<div class="budget-welcome"><span>내 예산으로 비교하고 싶다면</span><button class="text-button" data-action="finance">자금 조건 설정 →</button></div>';return;}
  renderCreditHelp();
  renderFunding();
  const p=state.profile,stable=budgetFor(p,true),max=budgetFor(p,false),scenario=scenarioFor(p);
  $('#mobile-budget-value').textContent=stable===null?'예산 확인 필요':'안정 '+money(stable,true);
  const previous=p.purchaseHistory==='first'&&scenario.supported?budgetFor({...p,purchaseHistory:'previous'}):null;
  $('#budget-summary').innerHTML=`<div class="budget-overview"><div><span>생활비·비상금을 지키는 예산</span><strong>${stable===null?'추가 확인 필요':money(stable,true)}</strong></div><button class="outline-button" data-action="finance">조건 수정</button></div><details class="budget-assumptions"><summary>${scenario.conditional?'조건부 계산 · ':''}${p.householdMode==='couple'?'부부 합산 · ':''}최대 예산과 계산 근거</summary><p>최대 예산 ${max===null?'추가 확인 필요':money(max,true)} · 가용 자기자금 ${money(cashAvailable(p))}</p><p>${escape(scenario.product)} · 규제지역 LTV ${scenario.ltv*100}% · DSR 40% 가정${previous!==null?`<br>일반 → 생애최초: ${money(previous)} → ${money(max)}`:''}</p>${scenario.notes.length?'<p>'+escape(scenario.notes.join(' '))+'</p>':''}${scenario.reasons.length?'<p>'+escape(scenario.reasons.join(' '))+'</p>':''}<button class="text-button" data-action="policy">계산 가정 확인</button></details>${!scenario.supported?`<p class="budget-review">${escape(scenario.reasons[0]||'추가 조건을 확인해주세요.')} 아파트 탐색은 계속할 수 있어요.</p>`:''}`;
}
function priceCell(a,area){const p=a.prices[area];return `<div class="price-cell ${state.area===area?'focus':''}"><small>전용 ${area}㎡급 ${area==='84'?'· 국평':''}</small><strong>${p?'약 '+money(p.amount,true):'미확인'}</strong>${trustBadge(p)}<span class="date">${p?`${escape(p.date)} 기준 · ${p.sampleCount||''}건`:'단지 상세에서 확인'}</span></div>`;}
function dataTrust(p){
  if(!p)return {label:'가격 미확인',className:'unknown',detail:'선택한 면적의 확인된 거래 자료가 없습니다.'};
  if((p.sampleCount||0)>=5)return {label:'최근·5건 이상',className:'strong',detail:`${p.date} 기준 ${p.sampleCount}건을 집계한 참고가격입니다.`};
  if((p.sampleCount||0)>0)return {label:'소표본·해석 주의',className:'limited',detail:`${p.date} 기준 ${p.sampleCount}건만 확인되어 변동성이 큽니다.`};
  return {label:'거래 자료 확인 필요',className:'unknown',detail:'가격을 확정할 거래 표본이 부족합니다.'};
}
function trustBadge(p){const trust=dataTrust(p);return `<span class="trust-badge ${trust.className}">${trust.label}</span>`;}
function card(a){
  const p=a.prices[state.area],e=applied?result(a):null,tier=priceTier(p?.amount);
  const saved=state.favorites.has(a.id),compared=state.compared.includes(a.id);
  const reason=!applied?'자금 설정 후 가능 여부 확인':!e?'가격 자료 확인 필요':e.status==='safe'?'생활비·비상금을 지키는 범위':e.status==='stretch'?'최대 예산 안이지만 여유 확인':e.status==='short'?`${money(e.shortage,true)} 추가 필요`:statusLabels[e.status];
  return `<article class="apartment-card"><div class="card-top"><span class="area-name">${escape(a.region+' · '+a.district+' '+a.dong)}</span><button class="favorite ${saved?'saved':''}" data-favorite="${escape(a.id)}" aria-label="${escape(a.name)} 관심 ${saved?'해제':'저장'}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><div class="card-main"><button class="card-title" data-detail="${escape(a.id)}">${escape(a.name)}</button><div class="card-meta"><span>${a.households.toLocaleString()}세대</span><span>·</span><span>${a.year}년 준공</span><span>·</span><span>${a.region==='서울'?'서울':'경기'}</span></div><div class="card-tags">${a.tags.slice(0,2).map(t=>`<span class="tag">${escape(t)}</span>`).join('')}</div><div class="prices">${priceCell(a,state.area)}</div><div class="affordability ${e?.status||''}"><span>${!applied?'내 예산 설정 후 비교':e?(e.scenario.conditional?'조건부 · ':'')+statusLabels[e.status]:'가격 확인 필요'}</span><span>${reason}</span></div></div><div class="card-actions"><button data-compare="${escape(a.id)}" aria-pressed="${compared}">${compared?'✓ 비교함에 담김':'＋ 비교하기'}</button>${link(naver(a),naverLabel(a),'naver-link')}</div></article>`;
}
function recommendationScore(a){
  const p=a.prices[state.area],e=applied&&p?result(a):null;
  if(!p)return -100000000;
  if(!e)return -(p.amount||0);
  const status={safe:4000000,stretch:3000000,burden:1500000,short:500000,review:0}[e.status]||0;
  const quality=Math.min(300000,p.sampleCount||0)*100;
  const burden=Math.max(0,100000-e.monthly)*5;
  return status+quality+burden-(p.amount||0)*0.02;
}
function alternativeHtml({baseCount,relax=[]}){
  if(baseCount)return '';
  const items=relax.filter(x=>x.count>0).slice(0,4);
  if(!items.length)return '<p class="empty-hint">현재 범위에서 확인 가능한 후보가 없습니다. 지역이나 면적을 넓혀보세요.</p>';
  return `<div class="alternatives"><strong>조건을 하나만 완화하면 찾을 수 있어요</strong><div>${items.map(x=>`<button class="outline-button" data-relax="${x.key}">${escape(x.label)} <b>${x.count.toLocaleString()}개</b></button>`).join('')}</div></div>`;
}
function renderDistricts(){
  const options=districtOptions(state.data.apartments,state.region);
  if(state.district!=='all'&&!options.includes(state.district))state.district='all';
  const select=$('#district');
  if(select.dataset.region!==state.region){select.innerHTML='<option value="all">전체 시·군·구</option>'+options.map(d=>`<option value="${escape(d)}">${escape(d.replace('|',' · '))}</option>`).join('');select.dataset.region=state.region;}
  select.value=state.district;
}
function shareSearch(){
  const url=sharedSearchUrl(location.href,state);
  openModal('이 검색 조건 공유하기',`<p>지역·평형·가격대·정렬·검색어·가격 자료 조건을 공유합니다. 소득·현금·부채·증여 입력, 예산 필터와 관심 단지는 포함하지 않습니다.</p><label class="field">공유 링크<input class="share-url" id="share-url" type="text" readonly value="${escape(url)}"></label><button class="primary" id="copy-search">링크 복사</button><p id="copy-status" role="status"></p>`,'SHARE SEARCH');
  const input=$('#share-url'),status=$('#copy-status');
  input.addEventListener('focus',e=>e.target.select());
  $('#copy-search').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url);if(status.isConnected)status.textContent='링크를 복사했어요.';}catch{if(input.isConnected&&$('#modal').open){input.focus();input.select();status.textContent='선택된 링크를 복사해주세요.';}}});
}
const historyCache=new Map();
async function loadPriceHistory(a,target,area){
  if(!a.priceHistoryAvailable){target.textContent='이 단지의 기간별 통계는 아직 연결되지 않았습니다.';return;}
  const region=a.region==='서울'?'seoul':'gyeonggi';
  try{
    if(!historyCache.has(region))historyCache.set(region,fetch(`./data/price-history/${region}.json`,{cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json();}).catch(error=>{historyCache.delete(region);throw error;}));
    const data=await historyCache.get(region);if(!target.isConnected)return;
    if(data.asOf!==state.data.updatedAt)throw Error('기준일 불일치');
    const windows=data.apartments[a.id]?.[area];if(!windows)throw Error('통계 미연결');
    const maximum=Math.max(...Object.values(windows).map(w=>w.median_manwon||0),1);
    target.innerHTML=`<h3>전용 ${area}㎡급 · 기간별 거래 비교</h3><p>동일 기준일(${escape(data.asOf)})까지 최근 3·6·12개월을 비교합니다. 기간이 서로 겹치며 월별 가격 추이를 뜻하지 않습니다.</p><div class="period-chart" role="img" aria-label="기간별 중위가격 비교. 정확한 값과 거래 수는 아래 표에 표시됩니다.">${['3','6','12'].map(months=>{const w=windows[months];return `<div><span>${months}개월</span><div class="period-track"><span style="width:${(w.median_manwon||0)/maximum*100}%"></span></div><strong>${w.count?money(w.median_manwon):'거래 없음'}</strong></div>`;}).join('')}</div><div class="table-scroll"><table class="history-table"><caption>대표가격으로 사용한 기간은 ‘카드 기준’으로 표시합니다.</caption><thead><tr><th>기간</th><th>중위가격 / 거래 수</th><th>거래 범위</th><th>직전 같은 길이 기간 대비</th></tr></thead><tbody>${['3','6','12'].map(months=>{const w=windows[months],quality=windowComparison(w);return `<tr><th>${months}개월${a.prices[area]?.periodMonths===Number(months)?'<br>카드 기준':''}<small>${escape(w.from_exclusive)} 이후</small></th><td>${w.count?money(w.median_manwon):'미확인'}<br>${w.count}건 · ${quality.label}</td><td>${w.count?money(w.min_manwon)+' ~ '+money(w.max_manwon):'—'}</td><td>${quality.change===null?'비교 표본 부족':(quality.change>0?'+':'')+quality.change+'%'}<br><small>직전 ${w.previous_count}건</small></td></tr>`;}).join('')}</tbody></table></div><p class="field-help">변화율은 현재·직전 구간 모두 3건 이상일 때만 표시합니다. 같은 면적급 안에서도 거래 면적·동·층 구성과 신고 지연에 따라 값이 달라질 수 있습니다.</p>`;
  }catch{historyCache.delete(region);if(target.isConnected){target.innerHTML='<p>기간별 자료를 불러오지 못했습니다. 기존 참고가격은 그대로 확인할 수 있어요.</p><button class="outline-button">다시 불러오기</button>';target.querySelector('button').addEventListener('click',()=>{target.textContent='기간별 자료를 불러오는 중…';loadPriceHistory(a,target,area);});}}
}
function renderCompareTray(){
  let tray=document.getElementById('compare-tray');
  if(!state.compared.length){tray?.remove();return;}
  if(!tray){tray=document.createElement('aside');tray.id='compare-tray';tray.className='compare-tray';tray.setAttribute('aria-live','polite');document.body.append(tray);}
  const homes=state.compared.map(id=>getApartment(id)).filter(Boolean);
  tray.innerHTML=`<div class="compare-tray-copy"><strong>비교함 ${homes.length}/3</strong><span>${homes.map(a=>escape(a.name)).join(' · ')}</span></div><div class="compare-tray-actions">${homes.map(a=>`<button type="button" class="compare-remove" data-remove-tray="${a.id}" aria-label="${escape(a.name)} 비교에서 제외">×</button>`).join('')}<button type="button" class="compare-open" data-action="comparison">비교하기 <span aria-hidden="true">→</span></button></div>`;
}
function renderList(){
  if(!state.data)return;
  renderDistricts();
  const query=state.search.trim().toLowerCase().replace(/\s/g,'');
  const key=JSON.stringify([state.region,state.area,state.search,state.sort,state.affordable,state.favoritesOnly,state.profile,state.priceBand,state.district,state.quality]);
  if(key!==state.listKey){state.page=1;state.listKey=key;}
  let list=state.data.apartments.filter(a=>a.households>=400&&(state.region==='all'||a.region===state.region)&&(!query||(a.name+a.address+(a.aliases||[]).join('')).toLowerCase().replace(/\s/g,'').includes(query))&&(!state.favoritesOnly||state.favorites.has(a.id)));
  list=list.filter(a=>(state.district==='all'||districtKey(a)===state.district)&&matchesQuality(a.prices[state.area],state.quality));
  const beforeBudget=list.slice();
  const scenario=scenarioFor(state.profile),suspended=state.affordable&&(!applied||!scenario.supported);
  const filterNotice=$('#budget-filter-notice');
  filterNotice.hidden=!suspended;
  filterNotice.textContent=suspended?'예산 필터 적용 보류 · '+(!applied?'먼저 내 자금을 설정해주세요.':scenario.reasons.join(' '))+' 예산 조건으로 단지를 제외하지 않고, 지역·평형·가격대 등 나머지 검색 조건의 목록을 표시합니다. 상태를 확인하면 예산 필터가 다시 적용됩니다.':'';
  if(state.affordable&&!suspended)list=list.filter(a=>['safe','stretch'].includes(result(a)?.status));
  const beforeBand=list.slice();
  const counts=priceBands.map(b=>list.filter(a=>matchesPriceBand(a.prices[state.area]?.amount,b.id)).length);
  $('#price-bands').innerHTML=priceBands.map((b,i)=>`<button type="button" data-price-band="${b.id}" aria-pressed="${state.priceBand===b.id}" class="${state.priceBand===b.id?'selected':''}">${b.label}<span>${counts[i].toLocaleString()}개</span></button>`).join('');
  $('#price-band-help').textContent=`전용 ${state.area}㎡급 참고가격 기준 · 6·8·11억은 다음 구간, 15억은 마지막 구간에 포함됩니다. 가격 미확인·15억 초과는 전체에서 볼 수 있어요.`;
  list=list.filter(a=>matchesPriceBand(a.prices[state.area]?.amount,state.priceBand));
  list.sort((a,b)=>{if(state.sort==='match')return recommendationScore(b)-recommendationScore(a);if(state.sort==='households')return b.households-a.households;if(state.sort==='newest')return b.year-a.year;const av=a.prices[state.area]?.amount,bv=b.prices[state.area]?.amount;if(!av)return bv?1:0;if(!bv)return -1;return state.sort==='price-desc'?bv-av:av-bv;});
  const known=list.filter(a=>a.prices[state.area]).length;
  $('#coverage-summary').textContent=`검색 결과 중 가격 확인 ${known.toLocaleString()}개 · 미확인 ${(list.length-known).toLocaleString()}개 · ${state.data.updatedAt} 기준`;
  $('#result-count').innerHTML=`<strong>${list.length.toLocaleString()}개</strong> 단지 · 전체 ${state.data.apartments.length.toLocaleString()}개 중`;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE;
  $('#pagination').innerHTML=list.length?`<button class="outline-button" data-page="${state.page-1}" ${state.page===1?'disabled':''}>이전</button><span aria-live="polite">${state.page} / ${pages} 페이지 · ${start+1}–${Math.min(start+PAGE_SIZE,list.length)}</span><button class="outline-button" data-page="${state.page+1}" ${state.page===pages?'disabled':''}>다음</button>`:'';
  renderFilterSummary();
  const relax=[
    {key:'budget',label:'예산 필터 해제',count:beforeBudget.filter(a=>matchesPriceBand(a.prices[state.area]?.amount,state.priceBand)).length},
    {key:'band',label:'가격대 전체 보기',count:beforeBand.length},
    {key:'district',label:'시·군·구 전체 보기',count:state.data.apartments.filter(a=>a.households>=400&&(state.region==='all'||a.region===state.region)&&(!query||(a.name+a.address).toLowerCase().replace(/\s/g,'').includes(query))&&matchesQuality(a.prices[state.area],state.quality)).length},
    {key:'region',label:'서울·경기 전체 보기',count:state.data.apartments.filter(a=>a.households>=400&&(!query||(a.name+a.address).toLowerCase().replace(/\s/g,'').includes(query))&&matchesQuality(a.prices[state.area],state.quality)).length},
    {key:'favorites',label:'관심 단지 해제',count:state.favoritesOnly?beforeBudget.length:0}
  ];
  $('#apartments').innerHTML=list.length?list.slice(start,start+PAGE_SIZE).map(card).join(''):`<div class="empty-state"><strong>조건에 맞는 단지가 없어요.</strong><br>현재 조건: ${escape($('#filter-summary').textContent)}<br>${alternativeHtml({baseCount:list.length,relax})}<br>${state.affordable?'<button class="outline-button" data-action="relax-budget">예산 필터만 해제</button>':''}<button class="outline-button" data-action="clear-filters">검색 조건 초기화</button></div>`;
  $('#compare-count').textContent=state.compared.length;
  renderCompareTray();
  persistExplore();
}
function renderFilterSummary(){
  const parts=[];
  if(state.region!=='all')parts.push(state.region);
  if(state.district!=='all')parts.push(state.district.split('|')[1]);
  if(state.quality!=='all')parts.push(state.quality==='known'?'가격 확인':'거래 5건 이상');
  parts.push(`전용 ${state.area}㎡`);
  if(state.priceBand!=='all')parts.push(priceBands.find(b=>b.id===state.priceBand).label);
  if(state.affordable)parts.push(applied&&scenarioFor(state.profile).supported?'예산 안':'예산 필터 보류');
  if(state.favoritesOnly)parts.push('관심 단지');
  if(state.search.trim())parts.push(`'${state.search.trim()}' 검색`);
  $('#filter-summary').innerHTML=parts.map(text=>`<span>${escape(text)}</span>`).join('');
  const chips=[['region',state.region!=='all','지역'],['district',state.district!=='all','시·군·구'],['quality',state.quality!=='all','자료'],['priceBand',state.priceBand!=='all','가격대'],['search',!!state.search.trim(),'검색어'],['affordable',state.affordable,'예산'],['favoritesOnly',state.favoritesOnly,'관심']];
  $('#filter-summary').innerHTML+=chips.filter(([,active])=>active).map(([key,,label])=>`<button type="button" data-clear-filter="${key}" aria-label="${label} 조건 해제">${label} ×</button>`).join('');
}
function openModal(title,html,kicker='JIP STANDARD'){ $('#modal-kicker').textContent=kicker;$('#modal-body').innerHTML=`<h2 id="modal-title">${escape(title)}</h2>${html}`;if(!$('#modal').open){trackOverlay();$('#modal').showModal();}$('#modal').scrollTop=0; }
function priceDetail(a,area){const p=a.prices[area],trust=dataTrust(p);return `<div><small>전용 ${area}㎡급</small><strong>${p?'약 '+money(p.amount,true):'가격 확인 필요'}</strong>${trustBadge(p)}<p>${p?'원자료 '+p.amount.toLocaleString('ko-KR')+'만원<br>'+escape(p.kind):escape(a.missing?.[area]||'확인된 거래 자료가 없습니다.')}<br>${p?`${escape(p.date)}${p.area?' · '+p.area+'㎡':''}${p.floor?' · '+p.floor+'층':''}`:''}${p?.sampleCount?'<br>'+p.sampleCount+'건 · '+p.periodDays+'일 집계<br>'+escape(p.fromExclusive||'')+' 이후 ~ '+escape(p.date):''}</p><p class="trust-detail">${escape(trust.detail)}</p>${p?link(p.source,'가격 출처'):''}</div>`;}
function reportChecks(id){try{return JSON.parse(localStorage.getItem(`jip-report-${id}`)||'{}')||{};}catch{return {};}}
function saveReportCheck(id,key,value){const checks=reportChecks(id);checks[key]=value;try{localStorage.setItem(`jip-report-${id}`,JSON.stringify(checks));}catch{}}
function contractReport(id){
  const a=getApartment(id),p=a?.prices[state.area],e=applied&&p?result(a):null,checks=reportChecks(id);
  if(!a)return;
  const item=(key,label,status,detail,action='')=>`<li class="report-item ${status}"><label><input type="checkbox" data-report-check="${key}" ${checks[key]?'checked':''}><span><strong>${label}</strong><small>${detail}</small></span></label>${action?`<button class="text-button" data-section="${action}">확인하기</button>`:''}</li>`;
  const priceStatus=!p?'missing':(p.sampleCount||0)>=5?'confirmed':'review';
  const priceDetailText=!p?'선택 평형 거래 자료가 없습니다. 현재 가격을 확정하지 마세요.':`${p.date} 기준 ${p.sampleCount||0}건 · ${dataTrust(p).label}. 현재 매물 호가와 다릅니다.`;
  const financeStatus=!applied?'review':!e?'missing':e.shortage>0?'review':'confirmed';
  const financeText=!applied?'내 자금 조건을 적용한 뒤 부족 자금과 월 부담을 확인하세요.':e?`${statusLabels[e.status]} · ${e.shortage>0?money(e.shortage,true)+' 부족':'추가 자금 부족 없음'} · 월 ${monthly(e.monthly)}.`:'가격 자료를 먼저 확인하세요.';
  const creditStatus=!applied?'review':['none','repaid'].includes(state.profile.creditStatus)?'confirmed':'review';
  const creditText=!applied?'최근 대출·한도 상태를 입력하세요.':state.profile.creditStatus==='repaid'?'전액 상환·한도 해지 가정입니다. 금융사에 약정 종료를 확인하세요.':state.profile.creditStatus==='none'?'최근 1억원 초과 신용대출 실행 이력 없음을 입력했습니다.':'잔액·한도·약정 제한을 금융사에 확인해야 합니다.';
  const giftEnabled=applied&&(state.profile.gifts||[]).some(g=>g?.enabled),giftStatus=!giftEnabled?'confirmed':state.profile.inputIssues.length?'review':'confirmed';
  const giftText=!giftEnabled?'증여 없음 또는 자금 설정 전입니다.':`증여세 ${taxMoney(state.profile.funding.giftTax)}를 반영했습니다. 신고·공제 조건은 세무 확인이 필요합니다.`;
  openModal('계약 전 점검 리포트',`<div class="report-meta"><span>${escape(a.name)}</span><span>전용 ${state.area}㎡급 · 자료 기준 ${escape(state.data.updatedAt)}</span></div><p class="notice">체크한 항목은 이 브라우저에만 저장됩니다. 확인 완료 표시는 금융기관·중개사·세무사의 확인을 대신하지 않습니다.</p><ul class="contract-report">${item('price','가격 자료 확인',priceStatus,priceDetailText,'detail-prices')}${item('finance','구매 자금 계산',financeStatus,financeText,'detail-calculator')}${item('credit','기존 대출·약정 확인',creditStatus,creditText)}${item('gift','증여·세금 확인',giftStatus,giftText)}${item('schedule','계약금·중도금·잔금 일정', 'review','수령일·지급일을 일정표에 입력하고 각 시점의 부족 자금을 확인하세요.','detail-calculator')}${item('field','현장 확인 항목', 'review',a.checks.slice(0,2).join(' · '),'detail-grid')}</ul><section class="report-questions"><h3>확인할 질문</h3><ul><li>은행: 현재 대출 약정과 주택 취득 제한이 종료됐나요?</li><li>중개사: 계약 대상 가격과 최근 실거래의 차이는 무엇인가요?</li><li>관리사무소: 최근 관리비·장기수선충당금·대규모 공사 계획은 무엇인가요?</li><li>세무사: 증여공제·신고기한·세금 납부 주체가 입력 조건과 일치하나요?</li></ul></section><button class="outline-button report-print" data-action="print-report">이 리포트 인쇄 / PDF 저장</button>`,'CONTRACT CHECK');
  document.querySelectorAll('[data-report-check]').forEach(input=>input.addEventListener('change',()=>{saveReportCheck(id,input.dataset.reportCheck,input.checked);}));
  document.querySelector('.report-questions')?.insertAdjacentHTML('beforeend',`<p class="report-source">${link('https://www.k-apt.go.kr/web/main/index.do','K-apt에서 관리비·장기수선 확인')}</p>`);
}
function detail(id){
  const a=getApartment(id);if(!a)return;
  const p=a.prices[state.area];
  $('#modal').dataset.apartment=id;
  openModal(a.name,`<nav class="detail-navigation" aria-label="단지 상세 항목"><button data-section="detail-prices">가격·거래</button><button data-section="detail-calculator">내 자금</button><button data-section="detail-grid">단지 정보</button></nav><p class="detail-meta">${escape(a.address)} · ${a.households.toLocaleString()}세대 · ${a.year}년 준공</p><div class="detail-prices">${priceDetail(a,'59')}${priceDetail(a,'84')}</div><p class="notice">참고가격은 현재 매물 가격이 아닙니다. ${escape(state.data.priceMethod)}</p><section id="price-history" class="price-history" aria-live="polite"><p>기간별 거래 자료를 불러오는 중…</p></section><div class="detail-grid"><section><h3>확인된 단지 정보</h3><ul>${a.facts.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>${link(a.factSource||a.source,'단지 정보 출처')}</section><section><h3>현장에서 살펴볼 점</h3><ul>${a.checks.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></section></div><h3>급지 · 커뮤니티</h3><div class="score-empty">${p?`선택 평형의 <strong>가격 ${priceTier(p.amount)}군</strong>입니다. `:''}가격군은 금액 구간 분류이며 입지 급지가 아닙니다. 입지·단지 품질 점수는 교통·학교·시설 자료 검증 후 제공됩니다.<br>커뮤니티: ${escape(a.facilities)}</div><section class="detail-calculator"><h3 style="margin-top:0">이 집, 내 조건으로 계산하면?</h3><p style="margin-bottom:12px">실제 보신 매물 가격으로 바꿔 계산할 수 있어요.</p><div class="two-fields"><label class="field">예상 매매가 (만원)<span class="input-wrap"><input id="detail-price" type="number" min="1" max="10000000" step="100" value="${p?.amount||''}" placeholder="가격 입력"><span>만원</span></span></label><label class="field">지역 규제 조건<select id="detail-regulation"><option value="true">규제지역 · LTV 40% 가정</option><option value="false">비규제지역 · LTV 70% 가정</option></select></label></div><p class="field-help" style="margin:0 0 14px">${a.regulated===null?'지역 지정 상태 미검증: 보수적으로 규제지역을 가정합니다.':'초기 조사 기준 규제지역을 가정합니다. 현재 지정·경과조건은 은행 확인이 필요합니다.'} 담보평가액=매매가 가정.</p><div id="detail-result" aria-live="polite"></div></section><div class="detail-actions">${link(naver(a),naverLabel(a),'primary')}${link('https://rt.molit.go.kr/','국토부에서 재확인','outline-button')}<button class="outline-button" data-action="contract-report">계약 전 점검</button><button class="outline-button" data-compare="${a.id}">비교함에 담기</button></div>`,'APARTMENT REPORT');
  $('#modal-body .detail-prices')?.insertAdjacentHTML('afterend',`<section class="data-confidence"><h3>가격 자료 신뢰도</h3><p>종합 점수가 아니라 기준일·표본 수를 그대로 보여드려요. 참고가격은 현재 매물 호가가 아닙니다.</p><div><span>59㎡급 ${trustBadge(a.prices['59'])}</span><span>84㎡급 ${trustBadge(a.prices['84'])}</span></div></section>`);
  loadPriceHistory(a,$('#price-history'),state.area);
  const update=()=>{const value=Number($('#detail-price').value);const container=$('#detail-result');if(!$('#detail-price').value||value<=0||!Number.isFinite(value)||value>10000000){container.innerHTML='<p>1~10,000,000만원 범위로 예상 매매가를 입력해주세요.</p>';return;}const e=evaluate(value,state.profile,{regulated:$('#detail-regulation').value==='true'});container.innerHTML=applied?calculationHtml(e):'<p>내 자금을 설정하면 부족한 현금과 월 상환액을 확인할 수 있어요.</p><button class="primary" data-action="finance">내 예산 알아보기</button>';if(applied){renderSensitivity(e);renderGapPlan(e);renderPlanner(e);}};
  $('#detail-price').addEventListener('input',update);$('#detail-regulation').addEventListener('change',update);update();
}
function calculationHtml(e){
  if(!e.supported)return `<p class="notice">${escape(e.scenario.reasons.join(' '))}</p>`;
  const creditNotice=e.scenario.notes.length?`<p class="notice">${escape(e.scenario.notes.join(' '))}</p>`:'';
  const stat=(label,value)=>`<div class="detail-stat"><span>${label}</span><strong>${value}</strong></div>`;
  const previous=state.profile.purchaseHistory==='first'?evaluate(e.price,{...state.profile,purchaseHistory:'previous'},{regulated:$('#detail-regulation')?.value!=='false'}):null;
  const comparison=previous?`<h3>일반 → 생애최초 비교</h3><div class="table-scroll"><table><thead><tr><th>항목</th><th>일반</th><th>생애최초</th></tr></thead><tbody>${[['LTV 담보 한도',previous.limits[0].amount,e.limits[0].amount],['최대 주담대',previous.maxLoan,e.maxLoan],['부족 현금',previous.shortage,e.shortage],['월 상환액',previous.monthly,e.monthly]].map(([name,a,b])=>`<tr><th>${name}</th><td>${money(a)}</td><td>${money(b)}</td></tr>`).join('')}</tbody></table></div><p>DSR·정책상한이 먼저 제한하면 LTV가 올라도 대출액은 같을 수 있어요.</p>`:'';
  const stable=budgetFor(state.profile,true),maximum=budgetFor(state.profile,false);
  const maxLine=Math.max(maximum||e.price,stable||0,e.price,1),pos=value=>Math.max(0,Math.min(100,value/maxLine*100));
  const statusMessage=e.shortage>=.01?`현금 ${money(e.shortage,true)}가 더 필요해요.`:e.status==='burden'?'대출은 가능하지만 월 부담이 높아요.':e.status==='stretch'?'대출은 가능하지만 여유 자금을 확인하세요.':'입력한 조건에서 필요한 자금을 감당할 수 있어요.';
  const line=`<section class="affordability-explain"><h3>이 집은 왜 이렇게 계산됐나요?</h3><p class="status-head ${e.status}"><strong>${statusLabels[e.status]}</strong><span>${statusMessage}</span></p><ul><li><b>가장 먼저 제한한 기준</b> ${escape(e.binding)}</li><li><b>사용 가능한 현금</b> ${money(e.available)} · <b>필요한 대출</b> ${money(e.loan)}</li><li><b>월 부담</b> ${monthly(e.monthly)} · 생활비 후 ${monthly(e.left)}${e.stressLeft<0?' · 금리·소득 스트레스에서 부족':''}</li></ul><div class="budget-line" aria-label="안정 예산, 최대 예산, 현재 집값 비교"><span class="line-base"></span>${stable!==null?`<i class="marker stable" style="left:${pos(stable)}%"><b>안정 ${money(stable,true)}</b></i>`:''}${maximum!==null?`<i class="marker maximum" style="left:${pos(maximum)}%"><b>최대 ${money(maximum,true)}</b></i>`:''}<i class="marker current" style="left:${pos(e.price)}%"><b>현재 ${money(e.price,true)}</b></i></div><div class="line-legend"><span>안정 예산</span><span>최대 예산</span><span>현재 집값</span></div></section>`;
  return `${creditNotice}${line}<p>${escape(e.scenario.product)} · LTV ${e.ltv*100}% · 정책 확인일 ${escape(e.scenario.policyDate)}<br>대출 후 ${e.scenario.moveInMonths}개월 내 전입을 가정합니다.</p><div class="detail-result">${stat('참고 시나리오 최대 주담대',money(e.maxLoan))}${stat('구매에 사용할 추정 주담대',money(e.loan))}${stat('추가로 필요한 현금',money(e.shortage))}${stat('월 원리금 상환액',monthly(e.monthly))}${stat('매월 생활비 후 잔여',monthly(e.left))}${stat('소득 −20% · 금리 +2%p 잔여',monthly(e.stressLeft))}</div><div class="limits">${e.limits.map(l=>`<div class="limit-row"><span>${l.name}</span><strong>${money(l.amount)}</strong><meter min="0" max="${Math.max(...e.limits.map(x=>x.amount),1)}" value="${l.amount}" aria-label="${l.name} ${money(l.amount)}"></meter></div>`).join('')}<div class="limit-row"><span>취득·이사 등 비용 예산</span><strong>${money(e.costs)}</strong></div></div><p style="margin-top:12px">${statusLabels[e.status]} · ${e.binding}가 가장 낮아 대출 한도를 제한합니다.<br>필요한 자금이 최대한도보다 적으면 실제 사용할 대출을 줄여 계산합니다.</p>${comparison}<details><summary>계산 근거와 추가 확인 조건</summary><p>정책 버전 ${escape(e.scenario.policyVersion)} · 연소득 ${money(state.profile.income)} · 약정금리 ${state.profile.rate}% · 심사 가산 ${state.profile.stress}%p · ${state.profile.years}년</p><p>${escape(e.scenario.unverifiedConditions.join(' · '))}</p></details><p class="notice">정책 예외·DTI·담보평가·방공제·전입의무·취득 제한 및 은행별 심사는 별도입니다. 이 결과는 승인 가능한 한도를 보장하지 않습니다.</p>`;
}
function comparison(){
  const list=state.compared.map(getApartment).filter(Boolean);
  if(!list.length){openModal('나란히 놓고, 더 분명하게.', '<p>아파트 카드에서 ‘비교하기’를 눌러 최대 3개 단지를 담아보세요. 가격, 세대수, 예상 대출과 월 부담을 비교할 수 있어요.</p>','COMPARE HOMES');return;}
  const row=(title,fn)=>`<tr><th>${title}</th>${list.map(a=>`<td>${fn(a)}</td>`).join('')}</tr>`;
  openModal('아파트 비교',`<button class="outline-button" data-action="print-report">인쇄 / PDF 저장</button><p>작성일 ${new Date().toLocaleDateString('ko-KR')} · 자료 기준 ${escape(state.data.updatedAt)}</p><p>선택 평형: 전용 ${state.area}㎡급 · 입력한 재무 조건을 공통 적용합니다.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>비교 항목</th>${list.map(a=>`<th>${escape(a.name)}<br><button data-remove-compare="${a.id}">제외</button></th>`).join('')}</tr></thead><tbody>${row('참고가격',a=>a.prices[state.area]?'<strong>약 '+money(a.prices[state.area].amount,true)+'</strong><br>'+escape(a.prices[state.area].date):'가격 미확인')}${row('세대 / 준공',a=>`${a.households.toLocaleString()}세대<br>${a.year}년`)}${row('집계 기간 · 표본',a=>a.prices[state.area]?`${a.prices[state.area].periodMonths||'—'}개월 · ${a.prices[state.area].sampleCount||0}건<br>${a.prices[state.area].sampleCount>=5?'5건 이상':'소표본 · 해석 주의'}`:'거래 자료 미확인')}${row('구매 시나리오',a=>!applied?'자금 설정 필요':result(a)?(result(a).scenario.conditional?'조건부 · ':'')+statusLabels[result(a).status]:'가격 미확인')}${row('최대 주담대',a=>applied&&result(a)?.supported?money(result(a).maxLoan):'확인 필요')}${row('부족한 현금',a=>applied&&result(a)?.supported?money(result(a).shortage):'확인 필요')}${row('월 상환액',a=>applied&&result(a)?.supported?monthly(result(a).monthly):'확인 필요')}${row('현장 확인',a=>escape(a.checks[0]))}${row('매물 확인',a=>link(naver(a),'네이버'))}</tbody></table></div><p class="notice">거래 집계 기간과 표본 수는 단지별로 다를 수 있습니다. 같은 시점의 매물 비교가 아닙니다. 규제지역 정보 미검증 시 LTV 40% 가정이며 미확인 데이터는 0으로 취급하지 않습니다.</p>`,'COMPARE HOMES');
}
function method(){openModal('좋은 집을 판단하는 기준',`<p>가격과 생활의 질은 서로 다른 기준입니다. 초기 버전에서는 확인된 가격 구간과 현장 확인 항목을 제공하며, 검증하지 않은 점수는 만들지 않습니다.</p><h3>현재 제공: 평형별 가격군</h3><div class="table-scroll"><table><thead><tr><th>가격군</th><th>선택 평형 참고가격</th></tr></thead><tbody><tr><td>1군</td><td>20억원 이상</td></tr><tr><td>2군</td><td>15억 이상 ~ 20억 미만</td></tr><tr><td>3군</td><td>10억 이상 ~ 15억 미만</td></tr><tr><td>4군</td><td>7억 이상 ~ 10억 미만</td></tr><tr><td>5군</td><td>7억 미만</td></tr></tbody></table></div><p>서비스가 정한 탐색용 금액 구간입니다. 공식 급지나 투자 등급이 아니며, 59㎡와 84㎡는 각각 분류합니다.</p><h3>입지 평가 설계 · 자료 검증 후 제공</h3><p>일자리 접근 30 · 교통 20 · 교육환경 20 · 생활 인프라 15 · 주거환경 10 · 거래 안정성 5점. 학교 접근성과 실제 통학구역은 구별합니다.</p><h3>단지 품질과 커뮤니티</h3><p>건물·구조, 주차, 유지관리, 커뮤니티 운영, 조경을 확인합니다. 시설이 있다는 사실과 현재 운영 중인지는 구별하며, 미확인 시설을 ‘없음’으로 처리하지 않습니다.</p><h3>안정 예산의 기준</h3><p>서비스 제안 기준으로, 기존·신규 월 상환액 합계가 월 실수령의 35% 이내이고, 소득이 20% 감소하면서 금리가 2%p 올라도 입력한 생활비를 충당하는 범위입니다. 최대 예산도 입력한 비상금과 현재 월 생활비는 유지합니다.</p>`,'OUR METHODOLOGY');}
function policy(){const p=state.policy;openModal('대출 계산, 이렇게 가정했어요.',`<p class="notice">${escape(p.notice)}</p><p>정책 자료 조사일 ${escape(p.checkedAt)} · 계산 버전 ${escape(p.version)}</p><h3>기본 시나리오</h3><ul><li>무주택 일반·생애최초 은행 주담대 · 원리금균등 · 최대 30년</li><li>DSR 40%, 일반 LTV 규제지역 40% / 비규제지역 70%; 생애최초 서울·경기 LTV 70%</li><li>주택가격 15억 이하: 상한 6억 / 15억 초과~25억 이하: 4억 / 25억 초과: 2억</li><li>한도 심사 금리: 약정금리 가정 + 입력한 스트레스 가산금리. 실제 월 납입액은 약정금리로 계산</li><li>일반 시나리오는 단지 규제 상태 미확인 시 LTV 40%를 가정. 생애최초는 세대 전체 보유 이력 없음과 6개월 내 전입을 가정</li></ul><h3>추가 심사가 필요한 경우</h3><p>생애최초 인정 예외·디딤돌·보금자리론·기존주택 처분·다주택·경과규정은 별도 확인 대상입니다. 생애최초 선택만으로 DSR이 완화되지 않습니다. 최근 1년 내 1억원 초과 신용대출은 실행 이력과 상환 상태를 구분합니다. 잔액·한도가 남거나 상태 미확인이면 규제지역 계산을 보류하고, 전액 상환·해지 완료는 약정 제한 종료를 가정한 참고 계산을 제공합니다. 금융사 약정에 따라 종료 조건이 다르며 전액 상환만으로 모든 주택 관련 심사를 통과하는 것은 아닙니다. 전세대출 상환과 전입·주택취득 제한도 은행에서 확인해야 합니다.</p><h3>부대비용과 자기자금</h3><p>기본 4%는 세법 계산값이 아닌 비용 예산입니다. 세금·중개·등기 비용에 맞춰 수정하세요. 보증금은 잔금 전 반환 확정분 중 대출 상환 후 순액만 자기자금에 포함합니다.</p><h3>확인한 공식 자료</h3>${p.sources.map(s=>`<p>${escape(s.date)} · ${link(s.url,s.title)}</p>`).join('')}<p>금융기관의 담보가액·DTI·소액임차보증금 공제·취급 한도 및 최신 법령 전체 검증은 완료되지 않았습니다.</p>`,'LENDING POLICY');}
function sources(){openModal('가격과 데이터의 출처',`<p>${escape(state.data.coverage)}</p><p class="notice">공식 단지 마스터 전체와 주소·명칭으로 연결한 국토부 CSV 거래를 제공합니다. 실시간 매물이나 모든 현존 단지의 전수 검증 결과는 아닙니다.</p><h3>대략적인 가격은 어떻게 표시하나요?</h3><p>${escape(state.data.priceMethod)} 카드 금액은 0.1억원 단위로 반올림합니다. 상세에서 집계 기간·건수·출처를 확인할 수 있습니다.</p><h3>네이버 연결</h3><p>단지 식별자가 확인된 곳은 직접 연결합니다. 나머지는 단지명과 주소를 포함한 네이버 검색으로 연결하므로 검색 결과에서 네이버 부동산을 선택해주세요. 로그인이나 서비스 상태에 따라 외부 화면은 달라질 수 있습니다.</p><h3>정식 데이터 연동</h3><p>공식 ID를 기준으로 단지를 수록했습니다. 해제·직거래·중복 의심·단지 식별 충돌 거래는 가격 집계에서 제외합니다. 최근 신고 지연과 정정은 이후 갱신 시 반영됩니다.</p>${link('https://www.data.go.kr/data/15126468/openapi.do','국토부 아파트 실거래가 API')}${link('https://www.data.go.kr/data/15106861/fileData.do','한국부동산원 단지 식별정보')}<h3>자료별 링크</h3><p>각 단지 상세에서 단지 정보와 가격 출처를 확인할 수 있습니다.</p><p>데이터 조사일: ${escape(state.data.updatedAt)}. 취소·정정과 신고 지연에 따라 값이 바뀔 수 있습니다.</p>`,'DATA & SOURCES');}
function privacy(){openModal('금융정보는 내 브라우저 안에',`<p>연봉·자산·부채 입력은 현재 브라우저에서 계산하고 서버로 전송하거나 URL에 포함하지 않습니다. 기본적으로 새로고침하면 초기화됩니다. ‘이 기기에 자금 조건 저장’을 선택하면 이 브라우저에 보관합니다. 아래에서 삭제할 수 있습니다.</p><p>최근 검색 조건과 관심·비교 단지 식별자도 이 브라우저에 저장합니다. 외부 링크를 열면 해당 서비스의 정책이 적용됩니다. 화면 글꼴은 Google Fonts에서 불러오며 금융정보를 보내지 않습니다.</p><button class="outline-button" data-action="clear-profile">저장한 자금 조건 삭제</button><button class="outline-button" style="margin-top:20px" data-action="clear-saved">저장한 관심 단지 삭제</button>`,'PRIVACY');}
function setPressed(attr,value){document.querySelectorAll(`[${attr}]`).forEach(b=>{const selected=b.getAttribute(attr)===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
function clearFilters(){state.district='all';state.quality='all';$('#price-quality').value='all';state.priceBand='all';state.region='all';state.area='84';state.search='';state.sort='match';state.affordable=false;state.favoritesOnly=false;$('#search').value='';$('#sort').value='match';$('#affordable').checked=false;$('#favorites-only').checked=false;setPressed('data-region','all');setPressed('data-area','84');renderList();}
function saveFavorites(){try{localStorage.setItem('jip-favorites',JSON.stringify([...state.favorites]));}catch{toast('이 브라우저에서는 관심 단지를 저장할 수 없어요.');}}
function persistScenarios(){try{localStorage.setItem('jip-scenarios',JSON.stringify(scenarios.slice(0,5)));}catch{}}
function renderScenarioList(){
  const target=$('#scenario-list');if(!target)return;
  if(!scenarios.length){target.innerHTML='<p class="field-help">혼자·부부·증여 포함 조건을 저장해 비교할 수 있어요.</p>';return;}
  target.innerHTML='<div class="scenario-list-head"><p>저장한 조건</p><button type="button" class="text-button" data-action="compare-scenarios">나란히 비교</button></div>'+scenarios.map((s,i)=>`<div class="scenario-row"><button type="button" data-load-scenario="${i}"><strong>${escape(s.name)}</strong><small>${escape(s.summary)}</small></button><button type="button" data-delete-scenario="${i}" aria-label="${escape(s.name)} 삭제">×</button></div>`).join('');
}
function saveScenario(){
  const fields=snapshot(),mode=form.elements.householdMode.value==='couple'?'부부 합산':'나 혼자',gift=form.elements.giftSelfenabled.checked||form.elements.giftSpouseenabled.checked?' · 증여 포함':'';
  scenarios=[{name:`${mode}${gift}`,summary:`연봉 ${money(Number(form.elements.income.value)||0)} · 현금 ${money(Number(form.elements.cash.value)||0)}`,fields,createdAt:new Date().toISOString()},...scenarios.filter(s=>s.name!==`${mode}${gift}`)].slice(0,5);persistScenarios();renderScenarioList();toast('현재 자금 조건을 저장했어요.');
}
function loadScenario(index){const scenario=scenarios[index];if(!scenario)return;restore(scenario.fields);draftChanged();toast(`${scenario.name} 조건을 불러왔어요.`);}
function deleteScenario(index){scenarios.splice(index,1);persistScenarios();renderScenarioList();}
function compareScenarios(){
  if(!scenarios.length){toast('먼저 저장한 조건이 필요해요.');return;}
  const current=snapshot(),rows=[];
  for(const scenario of scenarios){restore(scenario.fields);const p=readProfile();const stable=budgetFor(p,true),max=budgetFor(p,false);rows.push(`<tr><th>${escape(scenario.name)}</th><td>${stable===null?'추가 확인':money(stable,true)}</td><td>${max===null?'추가 확인':money(max,true)}</td><td>${p.householdMode==='couple'?'부부 합산':'나 혼자'}</td></tr>`);}
  restore(current);draftChanged();openModal('저장한 자금 조건 비교',`<p>같은 정책 가정으로 저장된 조건을 비교합니다. 실제 대출 승인 결과가 아닙니다.</p><div class="table-scroll"><table class="scenario-table"><thead><tr><th>조건</th><th>안정 예산</th><th>최대 예산</th><th>기준</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`,'SCENARIO COMPARE');
}
function relaxFilter(key){
  if(key==='budget'){state.affordable=false;$('#affordable').checked=false;}
  if(key==='band')state.priceBand='all';
  if(key==='district')state.district='all';
  if(key==='region'){state.region='all';state.district='all';}
  if(key==='favorites'){state.favoritesOnly=false;$('#favorites-only').checked=false;}
  setPressed('data-region',state.region);renderList();
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.clearFilter){const key=b.dataset.clearFilter;const defaults={region:'all',district:'all',quality:'all',priceBand:'all',search:'',affordable:false,favoritesOnly:false};state[key]=defaults[key];if(key==='region')state.district='all';$('#search').value=state.search;$('#price-quality').value=state.quality;$('#affordable').checked=state.affordable;$('#favorites-only').checked=state.favoritesOnly;setPressed('data-region',state.region);renderList();}
  if(b.dataset.relax)relaxFilter(b.dataset.relax);
  if(b.dataset.loadScenario)loadScenario(Number(b.dataset.loadScenario));
  if(b.dataset.deleteScenario){deleteScenario(Number(b.dataset.deleteScenario));}
  if(b.dataset.region){state.district='all';state.region=b.dataset.region;setPressed('data-region',state.region);renderList();}
  if(b.dataset.area){state.area=b.dataset.area;setPressed('data-area',state.area);renderList();}
  if(b.dataset.priceBand){state.priceBand=b.dataset.priceBand;renderList();$(`[data-price-band="${state.priceBand}"]`).focus({preventScroll:true});}
  if(b.dataset.cardInsight){const panel=b.nextElementSibling;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));panel?.classList.toggle('open');return;}
  if(b.dataset.section){const section=$('#modal .'+b.dataset.section);section?.scrollIntoView({block:'start',behavior:'smooth'});}
  if(b.dataset.detail)detail(b.dataset.detail);
  if(b.dataset.favorite){const id=b.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites();renderList();}
  if(b.dataset.page){state.page=Number(b.dataset.page);renderList();$('#result-count').scrollIntoView({block:'start'});$('#pagination button:not(:disabled)')?.focus({preventScroll:true});}
  if(b.dataset.compare){const id=b.dataset.compare;if(state.compared.includes(id)){state.compared=state.compared.filter(x=>x!==id);toast('비교함에서 제외했어요.');}else if(state.compared.length>=3){toast('최대 3개 단지를 비교할 수 있어요.');}else{state.compared.push(id);toast('비교함에 담았어요. 상단 비교함에서 확인하세요.');}renderList();}
  if(b.dataset.removeCompare){state.compared=state.compared.filter(x=>x!==b.dataset.removeCompare);renderList();comparison();}
  if(b.dataset.removeTray){state.compared=state.compared.filter(x=>x!==b.dataset.removeTray);renderList();}
  if(b.dataset.cardReport){contractReport(b.dataset.cardReport);return;}
  if(b.dataset.action==='contract-report'){contractReport($('#modal').dataset.apartment);return;}
  const actions={method,policy,sources,comparison,privacy,finance:openFinance,'save-scenario':saveScenario,'compare-scenarios':compareScenarios,'relax-budget':()=>{state.affordable=false;$('#affordable').checked=false;renderList();},'print-report':()=>window.print(),'clear-profile':()=>{localStorage.removeItem('jip-profile');$('#remember-finance').checked=false;toast('이 기기의 자금 저장을 삭제했어요.');},'share-search':shareSearch,'clear-filters':clearFilters,'clear-saved':()=>{state.favorites.clear();saveFavorites();renderList();toast('관심 단지를 삭제했어요.');}};
  if(b.dataset.action&&actions[b.dataset.action]){if(!state.data||!state.policy){toast('자료를 불러온 후 다시 시도해주세요.');return;}actions[b.dataset.action]();}
});
$('#district').addEventListener('change',e=>{state.district=e.target.value;renderList();});
$('#price-quality').addEventListener('change',e=>{state.quality=e.target.value;renderList();});
$('#search').addEventListener('input',e=>{state.search=e.target.value;renderList();});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;renderList();});
$('#affordable').addEventListener('change',e=>{state.affordable=e.target.checked;renderList();});
$('#favorites-only').addEventListener('change',e=>{state.favoritesOnly=e.target.checked;renderList();});
function snapshot(){return [...form.elements].filter(e=>e.name).map(e=>({name:e.name,value:e.value,checked:e.checked}));}
function restore(fields){for(const x of fields||[]){const e=form.elements.namedItem(x.name);if(e&&typeof x.value==='string'){e.value=x.value;if(e.type==='checkbox')e.checked=!!x.checked;}}syncHousehold(form);}
function draftChanged(){
  syncHousehold(form);
  const saved=state.profile;state.profile=readProfile();renderCreditHelp();renderFunding();
  $('#form-error').textContent=state.profile.inputIssues.join(' ');
  $('#history-error').textContent=state.profile.inputIssues.filter(e=>e.includes('모순')).join(' ');
  state.profile=saved;
  for(const input of form.querySelectorAll('input[type=number]')){
    const unit=input.parentElement.querySelector('span')?.textContent||'';
    if(!unit.includes('만원'))continue;
    let hint=input.closest('label').querySelector('.amount-preview');
    if(!hint){hint=document.createElement('small');hint.className='amount-preview';input.closest('label').append(hint);}
    hint.textContent=input.value!==''&&Number.isFinite(Number(input.value))?money(Number(input.value)):'';
  }
}
function openFinance(){
  if($('#finance-dialog').open)return;
  if($('#modal').open){returnToDetail=$('#detail-price')?$('#modal').dataset.apartment:null;$('#modal').close();}
  appliedFields=snapshot();draftChanged();renderScenarioList();trackOverlay();$('#finance-dialog').showModal();$('#finance-dialog').scrollTop=0;
}
function closeFinance(){restore(appliedFields);$('#finance-dialog').close();if(returnToDetail){const id=returnToDetail;returnToDetail=null;detail(id);}}
$('#close-finance').addEventListener('click',closeFinance);
$('#finance-dialog').addEventListener('cancel',e=>{e.preventDefault();closeFinance();});
form.addEventListener('submit',e=>{
  e.preventDefault();syncHousehold(form);const next=readProfile();
  if(next.inputIssues.length){draftChanged();$('#form-error').focus();return;}
  state.profile=next;applied=true;appliedFields=snapshot();
  try{if($('#remember-finance').checked)localStorage.setItem('jip-profile',JSON.stringify(appliedFields));else localStorage.removeItem('jip-profile');}catch{toast('이 기기에 저장하지 못했어요. 이번 계산에는 반영합니다.');}
  renderBudget();renderList();$('#finance-dialog').close();
  if(returnToDetail){const id=returnToDetail;returnToDetail=null;detail(id);}else toast('자금 조건을 결과에 적용했어요.');
});
form.addEventListener('input',draftChanged);form.addEventListener('change',draftChanged);
form.addEventListener('reset',()=>setTimeout(()=>{form.elements.householdMode.value='single';draftChanged();},0));
document.querySelectorAll('[data-household]').forEach(b=>b.addEventListener('click',()=>{form.elements.householdMode.value=b.dataset.household;draftChanged();}));
function persistExplore(){try{localStorage.setItem('jip-explore',JSON.stringify({region:state.region,area:state.area,search:state.search,sort:state.sort,priceBand:state.priceBand,district:state.district,quality:state.quality,compared:state.compared,page:state.page}));}catch{}}
try{const saved=JSON.parse(localStorage.getItem('jip-profile')||'null');if(Array.isArray(saved)){restore(saved);const next=readProfile();if(!next.inputIssues.length){state.profile=next;applied=true;$('#remember-finance').checked=true;}}}catch{}
let overlayEntry=false;
function trackOverlay(){if(!overlayEntry){history.pushState({jipOverlay:true},'',location.href);overlayEntry=true;}}
for(const dialog of [$('#modal'),$('#finance-dialog')])dialog.addEventListener('close',()=>{
  if($('#modal').open||$('#finance-dialog').open)return;
  if(overlayEntry&&history.state?.jipOverlay){overlayEntry=false;history.back();}
});
window.addEventListener('popstate',()=>{
  overlayEntry=false;returnToDetail=null;
  if($('#finance-dialog').open){restore(appliedFields);$('#finance-dialog').close();}
  if($('#modal').open)$('#modal').close();
});
$('#close-modal').addEventListener('click',()=>$('#modal').close());
$('#modal').addEventListener('click',e=>{if(e.target!==$('#modal'))return;const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();});
try{
  const [data,policyData]=await Promise.all(['./data/apartments.json','./data/policy.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}));
  state.data=data;state.policy=policyData;let saved={};try{saved=JSON.parse(localStorage.getItem('jip-explore')||'{}')||{};}catch{}
  const search=location.search||new URL(sharedSearchUrl(location.href,saved)).search;Object.assign(state,readSearchParams(search));state.compared=Array.isArray(saved.compared)?[...new Set(saved.compared.filter(id=>typeof id==='string'&&getApartment(id)))].slice(0,3):[];$('#search').value=state.search;$('#sort').value=state.sort;$('#price-quality').value=state.quality;setPressed('data-region',state.region);setPressed('data-area',state.area);renderBudget();renderList();if(!location.search&&Number.isInteger(saved.page)&&saved.page>1){state.page=saved.page;renderList();}
}catch(error){$('#apartments').innerHTML='<div class="empty-state">자료를 불러오지 못했어요.<br>인터넷 연결을 확인하고 새로고침해주세요.</div>';$('#result-count').textContent='데이터 로드 실패';console.error('Dataset load failed:',error.message);}

function renderPlanner(e){
  if(!e?.supported)return;
  const target=$('#detail-result');
  const date=days=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};
  const input=(id,label,value,type='number')=>`<label>${label}<input id="plan-${id}" type="${type}" value="${value}" ${type==='number'?'min="0" step="any"':''}></label>`;
  target.insertAdjacentHTML('beforeend',`<details class="planner"><summary>계약부터 잔금까지 자금 일정 확인</summary><p>위 예산과 별도로, 실제 사용할 돈의 도착 날짜를 점검해요. 증여·보증금은 현재 현금에 중복 입력하지 마세요. 주담대는 잔금일에만 실행된다고 가정합니다.</p><div class="planner-inputs">${input('cash','현재 사용 가능 현금 (비상금 제외, 만원)',Math.max(0,state.profile.funding.baseCash+Math.min(0,state.profile.funding.giftAddition)-state.profile.reserve))}${input('gift','앞으로 받을 외부 자금 (세후 증여 등, 만원)',Math.max(0,state.profile.funding.giftAddition))}${input('gift-date','외부 자금 수령일',date(60),'date')}${input('deposit','보증금 반환 순액 (만원)',state.profile.depositReady?state.profile.deposit:0)}${input('deposit-date','보증금 반환일',date(60),'date')}${input('contract','계약금 비율 (%)',10)}${input('middle','중도금 비율 (%)',0)}${input('contract-date','계약일',date(7),'date')}${input('middle-date','중도금일',date(30),'date')}${input('closing-date','잔금일',date(60),'date')}</div><div class="planner-output" aria-live="polite"></div><p class="field-help">날짜와 비율은 예시입니다. 부대비용은 잔금일에 합산합니다. 조기 지급·추가 차입·증여세 별도 납부는 자동 반영하지 않습니다. 실제 계약 일정에 맞춰 수정하세요.</p></details><button class="outline-button report-print" data-action="print-report">이 단지 보고서 인쇄 / PDF 저장</button>`);
  const update=()=>{
    const number=id=>{const value=$('#plan-'+id).value;return value===''?NaN:Number(value);};
    const date=id=>$('#plan-'+id).value;
    try{
      const rows=fundingTimeline({price:e.price,costs:e.costs,loan:e.loan,cash:number('cash'),contractRate:number('contract'),middleRate:number('middle'),dates:[date('contract-date'),date('middle-date'),date('closing-date')],receipts:[{amount:number('gift'),date:date('gift-date')},{amount:number('deposit'),date:date('deposit-date')}]});
      $('.planner-output').innerHTML='<table><thead><tr><th>시점</th><th>이번 지출</th><th>지급 후 잔액</th></tr></thead><tbody>'+rows.map(r=>`<tr><th>${r.label}<br><small>${r.date}</small></th><td>${money(r.due)}</td><td>${r.shortage>0?'부족 '+money(r.shortage):'잔여 '+money(r.balance)}</td></tr>`).join('')+'</tbody></table><p>'+(rows.some(r=>r.shortage>0)?'부족한 시점이 있습니다. 자금 수령일 또는 계약 일정을 확인하세요.':'입력한 일정에서는 자금 부족이 없습니다.')+'</p>';
    }catch(error){$('.planner-output').textContent=error.message;}
  };
  $('.planner').addEventListener('input',update);update();
}

function renderSensitivity(e){
  if(!e?.supported)return;
  $('#detail-result').insertAdjacentHTML('beforeend',`<details class="sensitivity"><summary>금리·소득이 바뀌면 얼마나 남을까요?</summary><p>위에서 계산한 대출 원금을 고정한 가계 현금흐름 비교입니다. 대출 승인 한도를 다시 심사하는 계산은 아닙니다.</p><label class="field">금리 상승 <select id="scenario-rate"><option value="0">변화 없음</option><option value="1">+1%p</option><option value="2" selected>+2%p</option><option value="3">+3%p</option></select></label><label class="field">월 실수령 변화 <select id="scenario-income"><option value="0">변화 없음</option><option value="-10">−10%</option><option value="-20" selected>−20%</option><option value="-30">−30%</option></select></label><div id="scenario-output" aria-live="polite"></div></details>`);
  const update=()=>{const monthlyLoan=payment(e.loan,state.profile.rate+Number($('#scenario-rate').value),state.profile.years);const income=state.profile.takeHome*(1+Number($('#scenario-income').value)/100);const left=income-state.profile.living-state.profile.debtMonthly-monthlyLoan;$('#scenario-output').innerHTML=`<p>월 주담대 상환액 <strong>${monthly(monthlyLoan)}</strong><br>생활비·기존 대출 납부 후 <strong>${left<0?'부족 '+monthly(-left):'잔여 '+monthly(left)}</strong></p>`;};
  $('#scenario-rate').addEventListener('change',update);$('#scenario-income').addEventListener('change',update);update();
}
function renderGapPlan(e){
  if(!e?.supported||e.shortage<0.01)return;
  const target=$('#detail-result');
  target.insertAdjacentHTML('beforeend',`<details class="gap-plan"><summary>부족한 ${money(e.shortage,true)}를 줄이는 방법</summary><p>아래 값은 선택한 집의 가격·현금 조건을 바꿔 보는 참고 시뮬레이션입니다. 실제 승인이나 계약 조건을 보장하지 않습니다.</p><div class="gap-controls"><label>추가 현금<input id="gap-cash" type="number" min="0" step="100" value="0"><span>만원</span></label><label>집값 조정<input id="gap-price" type="number" min="0" max="100" step="1" value="0"><span>% 낮춤</span></label></div><div id="gap-output" aria-live="polite"></div></details>`);
  const update=()=>{
    const extra=Math.max(0,Number($('#gap-cash').value)||0),cut=Math.min(100,Math.max(0,Number($('#gap-price').value)||0));
    const nextPrice=e.price*(1-cut/100),next={...state.profile,cash:state.profile.cash+extra};
    const nextResult=evaluate(nextPrice,next,{regulated:$('#detail-regulation').value==='true'});
    $('#gap-output').innerHTML=nextResult?.shortage<0.01?`<p class="gap-good">이 조합이면 부족 자금이 없어집니다. 예상 월 상환액은 <strong>${monthly(nextResult.monthly)}</strong>입니다.</p>`:`<p>남은 부족 자금 <strong>${money(nextResult?.shortage??e.shortage,true)}</strong><br>추가 현금 ${money(extra)} · 집값 ${cut}% 조정 후 ${money(nextPrice,true)}</p>`;
  };
  $('#gap-cash').addEventListener('input',update);$('#gap-price').addEventListener('input',update);update();
}
let printDetails=[];
window.addEventListener('beforeprint',()=>{printDetails=[...$('#modal').querySelectorAll('details')].map(el=>[el,el.open]);for(const [el] of printDetails)el.open=true;});
window.addEventListener('afterprint',()=>{for(const [el,open] of printDetails)el.open=open;printDetails=[];});

// Keep list and budget updates calm but alive: the content changes in place without a jarring redraw.
const softMotionObserver=new MutationObserver(records=>{
  for(const record of records){
    if(!record.addedNodes.length)continue;
    [...record.addedNodes].filter(node=>node.nodeType===1).forEach((node,index)=>{
      node.classList.add('soft-enter');
      node.style.setProperty('--motion-delay',`${Math.min(index,8)*35}ms`);
      node.addEventListener('animationend',()=>node.classList.remove('soft-enter'),{once:true});
      if(node.matches('.apartment-card')&&!node.querySelector('.card-insight-toggle')){
        const actions=node.querySelector('.card-actions'),cardId=node.querySelector('[data-detail]')?.dataset.detail,price=node.querySelector('.price-cell strong')?.textContent||'가격 확인 필요',status=node.querySelector('.affordability span')?.textContent||'추가 확인 필요',trust=node.querySelector('.trust-badge')?.textContent||'자료 확인 필요';
        const toggle=document.createElement('button');toggle.type='button';toggle.className='card-insight-toggle';toggle.dataset.cardInsight='true';toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<b>판단 근거 보기</b><span aria-hidden="true">＋</span>';
        const panel=document.createElement('div');panel.className='card-insight';panel.innerHTML=`<div><dl><dt>현재 상태</dt><dd>${status}</dd><dt>참고 가격</dt><dd>${price}</dd><dt>자료 신뢰도</dt><dd>${trust}</dd></dl><div class="card-insight-actions"><button type="button" data-detail="${cardId||''}">상세 판단</button><button type="button" data-card-report="${cardId||''}">계약 전 점검</button></div></div>`;
        actions?.insertAdjacentElement('beforebegin',toggle);actions?.insertAdjacentElement('beforebegin',panel);
      }
      if(node.matches('.budget-overview')&&!document.querySelector('#budget-summary .next-action')){
        const first=document.querySelector('#apartments [data-detail]'), compared=state.compared.length;
        const action=!applied?{label:'자금 조건 설정',text:'예산을 설정하면 내 조건에 맞는 단지만 추려볼 수 있어요.',action:'finance'}:compared?{label:'비교 결과 보기',text:`${compared}개 단지를 골랐어요. 차이를 한눈에 확인해보세요.`,action:'comparison'}:first?{label:'첫 추천 확인',text:'현재 조건에서 가장 먼저 살펴볼 단지를 골랐어요.',detail:first.dataset.detail}:{label:'조건 다시 보기',text:'필터를 조금 완화하면 후보를 더 찾을 수 있어요.',action:'clear-filters'};
        const next=document.createElement('div');next.className='next-action';next.innerHTML=`<div><strong>다음으로 할 일</strong><span>${action.text}</span></div>${action.detail?`<button type="button" data-detail="${action.detail}">${action.label}<span aria-hidden="true">→</span></button>`:`<button type="button" data-action="${action.action}">${action.label}<span aria-hidden="true">→</span></button>`}`;
        node.parentElement?.append(next);
      }
    });
  }
});
['apartments','budget-summary','price-bands'].forEach(id=>{const target=document.getElementById(id);if(target)softMotionObserver.observe(target,{childList:true});});
