import {evaluate,budgetFor,cashAvailable,priceTier,statusLabels,validateProfile,profileIssues,scenarioFor} from './finance.js';
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
const PAGE_SIZE=24;
const state={district:'all',quality:'all',page:1,listKey:'',priceBand:'all',data:null,policy:null,region:'all',area:'84',search:'',sort:'price',affordable:false,favoritesOnly:false,compared:[],favorites:new Set(),profile:null};
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
  renderCreditHelp();
  renderFunding();
  const p=state.profile,stable=budgetFor(p,true),max=budgetFor(p,false),scenario=scenarioFor(p);
  $('#mobile-budget-value').textContent=stable===null?'예산 확인 필요':'안정 '+money(stable,true);
  const previous=p.purchaseHistory==='first'&&scenario.supported?budgetFor({...p,purchaseHistory:'previous'}):null;
  $('#budget-summary').innerHTML=`<div class="budget-cell"><span class="budget-label">비상금과 생활을 지키는</span><div class="budget-value">${stable===null?'별도 심사':money(stable,true)} <span>${stable===null?'':'까지'}</span></div><p>안정 예산 · 소득 감소와 금리 상승 고려</p></div><div class="budget-cell"><span class="budget-label">현재 조건으로 계산한</span><div class="budget-value">${max===null?'별도 심사':money(max,true)} <span>${max===null?'':'까지'}</span></div><p>최대 예산 · 가용 자기자금 ${money(cashAvailable(p))}</p></div><div class="budget-foot"><span>${scenario.conditional?'조건부 참고 계산 · ':''}${p.householdMode==='couple'?'부부 합산 · ':''}${escape(scenario.product)} · 규제지역 LTV ${scenario.ltv*100}% · DSR 40% 가정${previous!==null?`<br>일반 → 생애최초 최대 구매가: ${money(previous)} → ${money(max)}`:''}${scenario.notes.length?'<br>'+escape(scenario.notes.join(' ')):''}${scenario.reasons.length?'<br>'+escape(scenario.reasons.join(' ')):''}</span><button data-action="policy">계산 가정 확인 ↗</button></div>`;
}
function priceCell(a,area){const p=a.prices[area];return `<div class="price-cell ${state.area===area?'focus':''}"><small>전용 ${area}㎡급 ${area==='84'?'· 국평':''}</small><strong>${p?'약 '+money(p.amount,true):'미확인'}</strong><span class="date">${p?`${escape(p.date)} 기준 · ${p.sampleCount||''}건`:'단지 상세에서 확인'}</span></div>`;}
function card(a){
  const p=a.prices[state.area],e=result(a),tier=priceTier(p?.amount);
  const saved=state.favorites.has(a.id),compared=state.compared.includes(a.id);
  return `<article class="apartment-card"><div class="card-top"><span class="area-name">${escape(a.region+' · '+a.district+' '+a.dong)}</span><button class="favorite ${saved?'saved':''}" data-favorite="${escape(a.id)}" aria-label="${escape(a.name)} 관심 ${saved?'해제':'저장'}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><div class="card-main"><button class="card-title" data-detail="${escape(a.id)}">${escape(a.name)}</button><div class="card-meta"><span>${a.households.toLocaleString()}세대</span><span>·</span><span>${a.year}년 준공</span><span>·</span><span>${a.region==='서울'?'서울':'경기'}</span></div><div class="card-tags">${tier?`<span class="tag tier">가격 ${tier}군 · ${state.area}㎡</span>`:''}${a.tags.slice(0,2).map(t=>`<span class="tag">${escape(t)}</span>`).join('')}</div><div class="prices">${priceCell(a,'59')}${priceCell(a,'84')}</div><p class="card-analysis">${escape(a.summary)}</p><div class="affordability ${e?.status||''}"><span>${e?(e.scenario.conditional?'조건부 · ':'')+statusLabels[e.status]:'가격 확인 필요'}</span><span>${!e?'평형 선택 확인':!e.supported?'상세 조건 확인':e.shortage>=.01?money(e.shortage,true)+' 부족':'월 '+monthly(e.monthly)}</span></div></div><div class="card-actions"><button data-compare="${escape(a.id)}" aria-pressed="${compared}">${compared?'✓ 비교함에 담김':'＋ 비교하기'}</button>${link(naver(a),naverLabel(a),'naver-link')}</div></article>`;
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
function renderList(){
  if(!state.data)return;
  renderDistricts();
  const query=state.search.trim().toLowerCase().replace(/\s/g,'');
  const key=JSON.stringify([state.region,state.area,state.search,state.sort,state.affordable,state.favoritesOnly,state.profile,state.priceBand,state.district,state.quality]);
  if(key!==state.listKey){state.page=1;state.listKey=key;}
  let list=state.data.apartments.filter(a=>a.households>=400&&(state.region==='all'||a.region===state.region)&&(!query||(a.name+a.address+(a.aliases||[]).join('')).toLowerCase().replace(/\s/g,'').includes(query))&&(!state.favoritesOnly||state.favorites.has(a.id)));
  list=list.filter(a=>(state.district==='all'||districtKey(a)===state.district)&&matchesQuality(a.prices[state.area],state.quality));
  const scenario=scenarioFor(state.profile),suspended=state.affordable&&!scenario.supported;
  const filterNotice=$('#budget-filter-notice');
  filterNotice.hidden=!suspended;
  filterNotice.textContent=suspended?'예산 필터 적용 보류 · '+scenario.reasons.join(' ')+' 예산 조건으로 단지를 제외하지 않고, 지역·평형·가격대 등 나머지 검색 조건의 목록을 표시합니다. 상태를 확인하면 예산 필터가 다시 적용됩니다.':'';
  if(state.affordable&&!suspended)list=list.filter(a=>['safe','stretch'].includes(result(a)?.status));
  const counts=priceBands.map(b=>list.filter(a=>matchesPriceBand(a.prices[state.area]?.amount,b.id)).length);
  $('#price-bands').innerHTML=priceBands.map((b,i)=>`<button type="button" data-price-band="${b.id}" aria-pressed="${state.priceBand===b.id}" class="${state.priceBand===b.id?'selected':''}">${b.label}<span>${counts[i].toLocaleString()}개</span></button>`).join('');
  $('#price-band-help').textContent=`전용 ${state.area}㎡급 참고가격 기준 · 6·8·11억은 다음 구간, 15억은 마지막 구간에 포함됩니다. 가격 미확인·15억 초과는 전체에서 볼 수 있어요.`;
  list=list.filter(a=>matchesPriceBand(a.prices[state.area]?.amount,state.priceBand));
  list.sort((a,b)=>{if(state.sort==='households')return b.households-a.households;if(state.sort==='newest')return b.year-a.year;const av=a.prices[state.area]?.amount,bv=b.prices[state.area]?.amount;if(!av)return bv?1:0;if(!bv)return -1;return state.sort==='price-desc'?bv-av:av-bv;});
  const known=list.filter(a=>a.prices[state.area]).length;
  $('#coverage-summary').textContent=`검색 결과 중 가격 확인 ${known.toLocaleString()}개 · 미확인 ${(list.length-known).toLocaleString()}개 · ${state.data.updatedAt} 기준`;
  $('#result-count').innerHTML=`<strong>${list.length.toLocaleString()}개</strong> 단지 · 전체 ${state.data.apartments.length.toLocaleString()}개 중`;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE;
  $('#pagination').innerHTML=list.length?`<button class="outline-button" data-page="${state.page-1}" ${state.page===1?'disabled':''}>이전</button><span aria-live="polite">${state.page} / ${pages} 페이지 · ${start+1}–${Math.min(start+PAGE_SIZE,list.length)}</span><button class="outline-button" data-page="${state.page+1}" ${state.page===pages?'disabled':''}>다음</button>`:'';
  renderFilterSummary();
  $('#apartments').innerHTML=list.length?list.slice(start,start+PAGE_SIZE).map(card).join(''):`<div class="empty-state"><strong>조건에 맞는 단지가 없어요.</strong><br>지역·평형·예산 필터를 바꿔보세요.<br><button class="outline-button" data-action="clear-filters">검색 조건 초기화</button></div>`;
  $('#compare-count').textContent=state.compared.length;
}
function renderFilterSummary(){
  const parts=[];
  if(state.region!=='all')parts.push(state.region);
  if(state.district!=='all')parts.push(state.district.split('|')[1]);
  if(state.quality!=='all')parts.push(state.quality==='known'?'가격 확인':'거래 5건 이상');
  parts.push(`전용 ${state.area}㎡`);
  if(state.priceBand!=='all')parts.push(priceBands.find(b=>b.id===state.priceBand).label);
  if(state.affordable)parts.push(scenarioFor(state.profile).supported?'예산 안':'예산 필터 보류');
  if(state.favoritesOnly)parts.push('관심 단지');
  if(state.search.trim())parts.push(`'${state.search.trim()}' 검색`);
  $('#filter-summary').textContent=parts.join(' · ');
}
function openModal(title,html,kicker='JIP STANDARD'){ $('#modal-kicker').textContent=kicker;$('#modal-body').innerHTML=`<h2 id="modal-title">${escape(title)}</h2>${html}`;if(!$('#modal').open)$('#modal').showModal();$('#modal').scrollTop=0; }
function priceDetail(a,area){const p=a.prices[area];return `<div><small>전용 ${area}㎡급</small><strong>${p?'약 '+money(p.amount,true):'가격 확인 필요'}</strong><p>${p?'원자료 '+p.amount.toLocaleString('ko-KR')+'만원<br>'+escape(p.kind):escape(a.missing?.[area]||'확인된 거래 자료가 없습니다.')}<br>${p?`${escape(p.date)}${p.area?' · '+p.area+'㎡':''}${p.floor?' · '+p.floor+'층':''}`:''}${p?.sampleCount?'<br>'+p.sampleCount+'건 · '+p.periodDays+'일 집계<br>'+escape(p.fromExclusive||'')+' 이후 ~ '+escape(p.date):''}</p>${p?link(p.source,'가격 출처'):''}</div>`;}
function detail(id){
  const a=getApartment(id);if(!a)return;
  const p=a.prices[state.area];
  openModal(a.name,`<p class="detail-meta">${escape(a.address)} · ${a.households.toLocaleString()}세대 · ${a.year}년 준공</p><div class="detail-prices">${priceDetail(a,'59')}${priceDetail(a,'84')}</div><p class="notice">참고가격은 현재 매물 가격이 아닙니다. ${escape(state.data.priceMethod)}</p><section id="price-history" class="price-history" aria-live="polite"><p>기간별 거래 자료를 불러오는 중…</p></section><div class="detail-grid"><section><h3>확인된 단지 정보</h3><ul>${a.facts.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>${link(a.factSource||a.source,'단지 정보 출처')}</section><section><h3>현장에서 살펴볼 점</h3><ul>${a.checks.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></section></div><h3>급지 · 커뮤니티</h3><div class="score-empty">${p?`선택 평형의 <strong>가격 ${priceTier(p.amount)}군</strong>입니다. `:''}가격군은 금액 구간 분류이며 입지 급지가 아닙니다. 입지·단지 품질 점수는 교통·학교·시설 자료 검증 후 제공됩니다.<br>커뮤니티: ${escape(a.facilities)}</div><section class="detail-calculator"><h3 style="margin-top:0">이 집, 내 조건으로 계산하면?</h3><p style="margin-bottom:12px">실제 보신 매물 가격으로 바꿔 계산할 수 있어요.</p><div class="two-fields"><label class="field">예상 매매가 (만원)<span class="input-wrap"><input id="detail-price" type="number" min="1" max="10000000" step="100" value="${p?.amount||''}" placeholder="가격 입력"><span>만원</span></span></label><label class="field">지역 규제 조건<select id="detail-regulation"><option value="true">규제지역 · LTV 40% 가정</option><option value="false">비규제지역 · LTV 70% 가정</option></select></label></div><p class="field-help" style="margin:0 0 14px">${a.regulated===null?'지역 지정 상태 미검증: 보수적으로 규제지역을 가정합니다.':'초기 조사 기준 규제지역을 가정합니다. 현재 지정·경과조건은 은행 확인이 필요합니다.'} 담보평가액=매매가 가정.</p><div id="detail-result" aria-live="polite"></div></section><div class="detail-actions">${link(naver(a),naverLabel(a),'primary')}${link('https://rt.molit.go.kr/','국토부에서 재확인','outline-button')}<button class="outline-button" data-compare="${a.id}">비교함에 담기</button></div>`,'APARTMENT REPORT');
  loadPriceHistory(a,$('#price-history'),state.area);
  const update=()=>{const value=Number($('#detail-price').value);const container=$('#detail-result');if(!$('#detail-price').value||value<=0||!Number.isFinite(value)||value>10000000){container.innerHTML='<p>1~10,000,000만원 범위로 예상 매매가를 입력해주세요.</p>';return;}const e=evaluate(value,state.profile,{regulated:$('#detail-regulation').value==='true'});container.innerHTML=calculationHtml(e);};
  $('#detail-price').addEventListener('input',update);$('#detail-regulation').addEventListener('change',update);update();
}
function calculationHtml(e){
  if(!e.supported)return `<p class="notice">${escape(e.scenario.reasons.join(' '))}</p>`;
  const creditNotice=e.scenario.notes.length?`<p class="notice">${escape(e.scenario.notes.join(' '))}</p>`:'';
  const stat=(label,value)=>`<div class="detail-stat"><span>${label}</span><strong>${value}</strong></div>`;
  const previous=state.profile.purchaseHistory==='first'?evaluate(e.price,{...state.profile,purchaseHistory:'previous'},{regulated:$('#detail-regulation')?.value!=='false'}):null;
  const comparison=previous?`<h3>일반 → 생애최초 비교</h3><div class="table-scroll"><table><thead><tr><th>항목</th><th>일반</th><th>생애최초</th></tr></thead><tbody>${[['LTV 담보 한도',previous.limits[0].amount,e.limits[0].amount],['최대 주담대',previous.maxLoan,e.maxLoan],['부족 현금',previous.shortage,e.shortage],['월 상환액',previous.monthly,e.monthly]].map(([name,a,b])=>`<tr><th>${name}</th><td>${money(a)}</td><td>${money(b)}</td></tr>`).join('')}</tbody></table></div><p>DSR·정책상한이 먼저 제한하면 LTV가 올라도 대출액은 같을 수 있어요.</p>`:'';
  return `${creditNotice}<p>${escape(e.scenario.product)} · LTV ${e.ltv*100}% · 정책 확인일 ${escape(e.scenario.policyDate)}<br>대출 후 ${e.scenario.moveInMonths}개월 내 전입을 가정합니다.</p><div class="detail-result">${stat('참고 시나리오 최대 주담대',money(e.maxLoan))}${stat('구매에 사용할 추정 주담대',money(e.loan))}${stat('추가로 필요한 현금',money(e.shortage))}${stat('월 원리금 상환액',monthly(e.monthly))}${stat('매월 생활비 후 잔여',monthly(e.left))}${stat('소득 −20% · 금리 +2%p 잔여',monthly(e.stressLeft))}</div><div class="limits">${e.limits.map(l=>`<div class="limit-row"><span>${l.name}</span><strong>${money(l.amount)}</strong><meter min="0" max="${Math.max(...e.limits.map(x=>x.amount),1)}" value="${l.amount}" aria-label="${l.name} ${money(l.amount)}"></meter></div>`).join('')}<div class="limit-row"><span>취득·이사 등 비용 예산</span><strong>${money(e.costs)}</strong></div></div><p style="margin-top:12px">${statusLabels[e.status]} · ${e.binding}가 가장 낮아 대출 한도를 제한합니다.<br>필요한 자금이 최대한도보다 적으면 실제 사용할 대출을 줄여 계산합니다.</p>${comparison}<details><summary>계산 근거와 추가 확인 조건</summary><p>정책 버전 ${escape(e.scenario.policyVersion)} · 연소득 ${money(state.profile.income)} · 약정금리 ${state.profile.rate}% · 심사 가산 ${state.profile.stress}%p · ${state.profile.years}년</p><p>${escape(e.scenario.unverifiedConditions.join(' · '))}</p></details><p class="notice">정책 예외·DTI·담보평가·방공제·전입의무·취득 제한 및 은행별 심사는 별도입니다. 이 결과는 승인 가능한 한도를 보장하지 않습니다.</p>`;
}
function comparison(){
  const list=state.compared.map(getApartment).filter(Boolean);
  if(!list.length){openModal('나란히 놓고, 더 분명하게.', '<p>아파트 카드에서 ‘비교하기’를 눌러 최대 3개 단지를 담아보세요. 가격, 세대수, 예상 대출과 월 부담을 비교할 수 있어요.</p>','COMPARE HOMES');return;}
  const row=(title,fn)=>`<tr><th>${title}</th>${list.map(a=>`<td>${fn(a)}</td>`).join('')}</tr>`;
  openModal('아파트 비교',`<p>선택 평형: 전용 ${state.area}㎡급 · 입력한 재무 조건을 공통 적용합니다.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>비교 항목</th>${list.map(a=>`<th>${escape(a.name)}<br><button data-remove-compare="${a.id}">제외</button></th>`).join('')}</tr></thead><tbody>${row('참고가격',a=>a.prices[state.area]?'<strong>약 '+money(a.prices[state.area].amount,true)+'</strong><br>'+escape(a.prices[state.area].date):'가격 미확인')}${row('세대 / 준공',a=>`${a.households.toLocaleString()}세대<br>${a.year}년`)}${row('가격군',a=>priceTier(a.prices[state.area]?.amount)?`${priceTier(a.prices[state.area].amount)}군 · 입지 등급 아님`:'미분류')}${row('구매 시나리오',a=>result(a)?(result(a).scenario.conditional?'조건부 · ':'')+statusLabels[result(a).status]:'가격 미확인')}${row('최대 주담대',a=>result(a)?.supported?money(result(a).maxLoan):'확인 필요')}${row('부족한 현금',a=>result(a)?.supported?money(result(a).shortage):'확인 필요')}${row('월 상환액',a=>result(a)?.supported?monthly(result(a).monthly):'확인 필요')}${row('현장 확인',a=>escape(a.checks[0]))}${row('매물 확인',a=>link(naver(a),'네이버'))}</tbody></table></div><p class="notice">단지별 규제지역 정보가 미검증이면 LTV 40%를 가정합니다. 미확인 데이터는 0으로 취급하지 않습니다.</p>`,'COMPARE HOMES');
}
function method(){openModal('좋은 집을 판단하는 기준',`<p>가격과 생활의 질은 서로 다른 기준입니다. 초기 버전에서는 확인된 가격 구간과 현장 확인 항목을 제공하며, 검증하지 않은 점수는 만들지 않습니다.</p><h3>현재 제공: 평형별 가격군</h3><div class="table-scroll"><table><thead><tr><th>가격군</th><th>선택 평형 참고가격</th></tr></thead><tbody><tr><td>1군</td><td>20억원 이상</td></tr><tr><td>2군</td><td>15억 이상 ~ 20억 미만</td></tr><tr><td>3군</td><td>10억 이상 ~ 15억 미만</td></tr><tr><td>4군</td><td>7억 이상 ~ 10억 미만</td></tr><tr><td>5군</td><td>7억 미만</td></tr></tbody></table></div><p>서비스가 정한 탐색용 금액 구간입니다. 공식 급지나 투자 등급이 아니며, 59㎡와 84㎡는 각각 분류합니다.</p><h3>입지 평가 설계 · 자료 검증 후 제공</h3><p>일자리 접근 30 · 교통 20 · 교육환경 20 · 생활 인프라 15 · 주거환경 10 · 거래 안정성 5점. 학교 접근성과 실제 통학구역은 구별합니다.</p><h3>단지 품질과 커뮤니티</h3><p>건물·구조, 주차, 유지관리, 커뮤니티 운영, 조경을 확인합니다. 시설이 있다는 사실과 현재 운영 중인지는 구별하며, 미확인 시설을 ‘없음’으로 처리하지 않습니다.</p><h3>안정 예산의 기준</h3><p>서비스 제안 기준으로, 기존·신규 월 상환액 합계가 월 실수령의 35% 이내이고, 소득이 20% 감소하면서 금리가 2%p 올라도 입력한 생활비를 충당하는 범위입니다. 최대 예산도 입력한 비상금과 현재 월 생활비는 유지합니다.</p>`,'OUR METHODOLOGY');}
function policy(){const p=state.policy;openModal('대출 계산, 이렇게 가정했어요.',`<p class="notice">${escape(p.notice)}</p><p>정책 자료 조사일 ${escape(p.checkedAt)} · 계산 버전 ${escape(p.version)}</p><h3>기본 시나리오</h3><ul><li>무주택 일반·생애최초 은행 주담대 · 원리금균등 · 최대 30년</li><li>DSR 40%, 일반 LTV 규제지역 40% / 비규제지역 70%; 생애최초 서울·경기 LTV 70%</li><li>주택가격 15억 이하: 상한 6억 / 15억 초과~25억 이하: 4억 / 25억 초과: 2억</li><li>한도 심사 금리: 약정금리 가정 + 입력한 스트레스 가산금리. 실제 월 납입액은 약정금리로 계산</li><li>일반 시나리오는 단지 규제 상태 미확인 시 LTV 40%를 가정. 생애최초는 세대 전체 보유 이력 없음과 6개월 내 전입을 가정</li></ul><h3>추가 심사가 필요한 경우</h3><p>생애최초 인정 예외·디딤돌·보금자리론·기존주택 처분·다주택·경과규정은 별도 확인 대상입니다. 생애최초 선택만으로 DSR이 완화되지 않습니다. 최근 1년 내 1억원 초과 신용대출은 실행 이력과 상환 상태를 구분합니다. 잔액·한도가 남거나 상태 미확인이면 규제지역 계산을 보류하고, 전액 상환·해지 완료는 약정 제한 종료를 가정한 참고 계산을 제공합니다. 금융사 약정에 따라 종료 조건이 다르며 전액 상환만으로 모든 주택 관련 심사를 통과하는 것은 아닙니다. 전세대출 상환과 전입·주택취득 제한도 은행에서 확인해야 합니다.</p><h3>부대비용과 자기자금</h3><p>기본 4%는 세법 계산값이 아닌 비용 예산입니다. 세금·중개·등기 비용에 맞춰 수정하세요. 보증금은 잔금 전 반환 확정분 중 대출 상환 후 순액만 자기자금에 포함합니다.</p><h3>확인한 공식 자료</h3>${p.sources.map(s=>`<p>${escape(s.date)} · ${link(s.url,s.title)}</p>`).join('')}<p>금융기관의 담보가액·DTI·소액임차보증금 공제·취급 한도 및 최신 법령 전체 검증은 완료되지 않았습니다.</p>`,'LENDING POLICY');}
function sources(){openModal('가격과 데이터의 출처',`<p>${escape(state.data.coverage)}</p><p class="notice">공식 단지 마스터 전체와 주소·명칭으로 연결한 국토부 CSV 거래를 제공합니다. 실시간 매물이나 모든 현존 단지의 전수 검증 결과는 아닙니다.</p><h3>대략적인 가격은 어떻게 표시하나요?</h3><p>${escape(state.data.priceMethod)} 카드 금액은 0.1억원 단위로 반올림합니다. 상세에서 집계 기간·건수·출처를 확인할 수 있습니다.</p><h3>네이버 연결</h3><p>단지 식별자가 확인된 곳은 직접 연결합니다. 나머지는 단지명과 주소를 포함한 네이버 검색으로 연결하므로 검색 결과에서 네이버 부동산을 선택해주세요. 로그인이나 서비스 상태에 따라 외부 화면은 달라질 수 있습니다.</p><h3>정식 데이터 연동</h3><p>공식 ID를 기준으로 단지를 수록했습니다. 해제·직거래·중복 의심·단지 식별 충돌 거래는 가격 집계에서 제외합니다. 최근 신고 지연과 정정은 이후 갱신 시 반영됩니다.</p>${link('https://www.data.go.kr/data/15126468/openapi.do','국토부 아파트 실거래가 API')}${link('https://www.data.go.kr/data/15106861/fileData.do','한국부동산원 단지 식별정보')}<h3>자료별 링크</h3><p>각 단지 상세에서 단지 정보와 가격 출처를 확인할 수 있습니다.</p><p>데이터 조사일: ${escape(state.data.updatedAt)}. 취소·정정과 신고 지연에 따라 값이 바뀔 수 있습니다.</p>`,'DATA & SOURCES');}
function privacy(){openModal('금융정보는 내 브라우저 안에',`<p>연봉·자산·부채 입력은 현재 브라우저 메모리에서만 계산하고 서버로 전송하거나 URL에 포함하지 않습니다. 새로고침하면 입력값은 초기화됩니다.</p><p>관심 아파트의 단지 식별자만 이 브라우저에 저장합니다. 외부 링크를 열면 해당 서비스의 정책이 적용됩니다. 화면 글꼴은 Google Fonts에서 불러오며 금융정보를 보내지 않습니다.</p><button class="outline-button" style="margin-top:20px" data-action="clear-saved">저장한 관심 단지 삭제</button>`,'PRIVACY');}
function setPressed(attr,value){document.querySelectorAll(`[${attr}]`).forEach(b=>{const selected=b.getAttribute(attr)===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
function clearFilters(){state.district='all';state.quality='all';$('#price-quality').value='all';state.priceBand='all';state.region='all';state.area='84';state.search='';state.sort='price';state.affordable=false;state.favoritesOnly=false;$('#search').value='';$('#sort').value='price';$('#affordable').checked=false;$('#favorites-only').checked=false;setPressed('data-region','all');setPressed('data-area','84');renderList();}
function saveFavorites(){try{localStorage.setItem('jip-favorites',JSON.stringify([...state.favorites]));}catch{toast('이 브라우저에서는 관심 단지를 저장할 수 없어요.');}}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.region){state.district='all';state.region=b.dataset.region;setPressed('data-region',state.region);renderList();}
  if(b.dataset.area){state.area=b.dataset.area;setPressed('data-area',state.area);renderList();}
  if(b.dataset.priceBand){state.priceBand=b.dataset.priceBand;renderList();$(`[data-price-band="${state.priceBand}"]`).focus({preventScroll:true});}
  if(b.dataset.detail)detail(b.dataset.detail);
  if(b.dataset.favorite){const id=b.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites();renderList();}
  if(b.dataset.page){state.page=Number(b.dataset.page);renderList();$('#result-count').scrollIntoView({block:'start'});$('#pagination button:not(:disabled)')?.focus({preventScroll:true});}
  if(b.dataset.compare){const id=b.dataset.compare;if(state.compared.includes(id)){state.compared=state.compared.filter(x=>x!==id);toast('비교함에서 제외했어요.');}else if(state.compared.length>=3){toast('최대 3개 단지를 비교할 수 있어요.');}else{state.compared.push(id);toast('비교함에 담았어요. 상단 비교함에서 확인하세요.');}renderList();}
  if(b.dataset.removeCompare){state.compared=state.compared.filter(x=>x!==b.dataset.removeCompare);renderList();comparison();}
  const actions={method,policy,sources,comparison,privacy,'share-search':shareSearch,'clear-filters':clearFilters,'clear-saved':()=>{state.favorites.clear();saveFavorites();renderList();toast('관심 단지를 삭제했어요.');}};
  if(b.dataset.action&&actions[b.dataset.action]){if(!state.data||!state.policy){toast('자료를 불러온 후 다시 시도해주세요.');return;}actions[b.dataset.action]();}
});
$('#district').addEventListener('change',e=>{state.district=e.target.value;renderList();});
$('#price-quality').addEventListener('change',e=>{state.quality=e.target.value;renderList();});
$('#search').addEventListener('input',e=>{state.search=e.target.value;renderList();});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;renderList();});
$('#affordable').addEventListener('change',e=>{state.affordable=e.target.checked;renderList();});
$('#favorites-only').addEventListener('change',e=>{state.favoritesOnly=e.target.checked;renderList();});
let financeTimer;
function refreshFinance(){
  clearTimeout(financeTimer);syncHousehold(form);state.profile=readProfile();
  const issues=state.profile.inputIssues;
  $('#form-error').textContent=issues.join(' ');
  $('#history-error').textContent=issues.filter(e=>e.includes('모순')).join(' ');
  form.elements.purchaseHistory.setAttribute('aria-invalid',String(issues.some(e=>e.includes('모순'))));
  renderBudget();renderList();
}
form.addEventListener('submit',e=>{e.preventDefault();refreshFinance();if(state.profile.inputIssues.length){$('#form-error').focus();return;}toast('입력한 조건으로 다시 계산했어요.');});
form.addEventListener('input',()=>{clearTimeout(financeTimer);financeTimer=setTimeout(refreshFinance,220);});
form.addEventListener('change',refreshFinance);
form.addEventListener('reset',()=>{clearTimeout(financeTimer);setTimeout(()=>{form.elements.householdMode.value='single';refreshFinance();},0);});
document.querySelectorAll('[data-household]').forEach(button=>button.addEventListener('click',()=>{form.elements.householdMode.value=button.dataset.household;refreshFinance();}));
const inputSteps=[...document.querySelectorAll('.input-steps li')],detailSections=[...form.querySelectorAll('.form-details')];
function updateInputStep(){const openIndex=detailSections.findIndex(section=>section.open);const active=openIndex<0?0:openIndex+1;inputSteps.forEach((step,index)=>step.classList.toggle('current',index===active));}
detailSections.forEach(section=>section.addEventListener('toggle',updateInputStep));
$('#close-modal').addEventListener('click',()=>$('#modal').close());
$('#modal').addEventListener('click',e=>{if(e.target!==$('#modal'))return;const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();});
try{
  const [data,policyData]=await Promise.all(['./data/apartments.json','./data/policy.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}));
  state.data=data;state.policy=policyData;Object.assign(state,readSearchParams(location.search));$('#search').value=state.search;$('#sort').value=state.sort;$('#price-quality').value=state.quality;setPressed('data-region',state.region);setPressed('data-area',state.area);renderBudget();renderList();
}catch(error){$('#apartments').innerHTML='<div class="empty-state">자료를 불러오지 못했어요.<br>인터넷 연결을 확인하고 새로고침해주세요.</div>';$('#result-count').textContent='데이터 로드 실패';console.error('Dataset load failed:',error.message);}
