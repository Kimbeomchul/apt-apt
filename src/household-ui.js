const amount=(name,label,value=0,unit='만원')=>`<label class="field">${label}<span class="input-wrap"><input name="${name}" type="number" min="0" max="10000000" step="any" value="${value}" inputmode="decimal"><span>${unit}</span></span></label>`;
function giftFields(prefix,title){return `<details class="gift-section"><summary>${title}</summary><label class="checkbox"><input type="checkbox" name="${prefix}enabled" data-gift-enable="${prefix}">증여금을 구매 자금에 반영</label><fieldset data-gift-fields="${prefix}" disabled hidden>
  ${amount(prefix+'amount','이번에 받는 현금 증여액')}
  <label class="field">주는 사람과의 관계<select name="${prefix}relation"><option value="parent">부모 → 성년 자녀</option><option value="spouse">법률상 배우자</option><option value="child">자녀 → 부모</option><option value="relative">기타 친족 (공제 대상)</option><option value="other">그 외 사람</option><option value="review">조부모·기타 별도 검토</option></select></label>
  <p class="field-help">받는 사람 기준으로 선택하세요. 시부모·장인·장모는 기타 친족입니다. 성년 국내 거주자의 일반 현금 증여 기준입니다.</p>
  <label class="checkbox"><input type="checkbox" name="${prefix}onTime" checked>신고기한 내 신고 가정 (3% 공제)</label>
  <details class="gift-history"><summary>최근 10년 증여·공제 이력 입력</summary><p class="field-help">이전 증여·공제 이력이 없을 때만 0으로 두세요.</p>
    ${amount(prefix+'priorAmount','동일인에게 과거 받은 합산대상 증여액')}
    <p class="field-help">부모에게 받았다면 아버지·어머니를 합산하세요. 합계 1천만원 이상일 때 누진세 계산에 합산합니다.</p>
    ${amount(prefix+'usedDeduction','같은 관계 구분에서 사용한 일반공제 총액')}
    <p class="field-help">부모 증여는 다른 직계존속에게 사용한 공제까지 포함합니다. 아래 동일인 사용분도 포함한 총액입니다.</p>
    ${amount(prefix+'priorDeduction','위 동일인 과거 증여의 일반공제액')}
    ${amount(prefix+'priorSpecial','위 동일인 과거 증여의 혼인·출산 공제액')}
    ${amount(prefix+'priorTax','위 과거 증여분 산출세액')}
    <p class="field-help">신고서의 산출세액을 입력하세요. 3% 신고공제 후 실제 납부액과 다릅니다. 비현금·특례·할증·과거 신고 미확인은 별도 확인이 필요합니다.</p>
  </details>
  <details class="gift-history"><summary>혼인·출산 추가공제 가정</summary>
    <label class="checkbox"><input type="checkbox" name="${prefix}special">부모 증여의 추가공제 요건을 충족해요</label>
    <p class="field-help">2024년 이후 증여, 혼인신고일 전후 2년 또는 출생·입양신고일부터 2년 내 등 요건을 직접 확인한 경우만 선택하세요. 혼인·출산 합쳐 수증자별 통합 1억원 한도이며 날짜를 자동 판정하지 않습니다. <a href="https://www.nts.go.kr/webtv/na/ntt/selectNttList.do?bbsId=30148&mi=10675&nttSn=1335073" target="_blank" rel="noopener noreferrer">국세청 추가공제 안내 ↗</a></p>
    ${amount(prefix+'specialUsed','지금까지 사용한 혼인·출산 공제 총액')}
  </details>
  <div data-gift-result="${prefix}" class="gift-result" aria-live="polite"></div>
</fieldset></details>`;}

export function setupHousehold(form){
  const first=form.querySelector('.form-group-label');
  first.insertAdjacentHTML('beforebegin',`<input type="hidden" name="householdMode" value="single"><div class="household-tabs" role="group" aria-label="구매 자금 계산 기준"><button type="button" data-household="single" aria-pressed="true" class="selected">나 혼자</button><button type="button" data-household="couple" aria-pressed="false">부부 합산</button></div><p id="household-help" class="field-help">본인 소득과 자금으로 계산해요.</p>`);
  form.querySelector('[name=homeStatus]').closest('label').insertAdjacentHTML('beforebegin',`<fieldset id="spouse-fields" class="person-fields" disabled hidden><legend>배우자 소득과 자금</legend>${amount('spouseincome','배우자 세전 연봉',0,'만원 / 년')}${amount('spousecash','배우자가 가진 현금')}${amount('spousetakeHome','배우자 월 실수령액',0,'만원 / 월')}<details class="gift-history"><summary>배우자 부채와 신용대출 상태</summary>${amount('spousedebtBalance','배우자 현재 대출 잔액')}${amount('spousedebtAnnual','배우자 규정상 연 원리금',0,'만원 / 년')}${amount('spousedebtMonthly','배우자 실제 월 납입액',0,'만원 / 월')}<label class="field">최근 1년 내 1억원 초과 신용대출<select name="spousecreditStatus"><option value="none">해당 실행 이력 없음</option><option value="active">잔액 또는 대출 한도 남아 있음</option><option value="repaid">전액 상환·한도 해지 완료</option><option value="unknown">상환·약정 상태 확인 필요</option></select></label></details></fieldset>
  <section class="gifts-panel" aria-labelledby="gifts-title"><h3 id="gifts-title">증여받는 돈</h3><p class="field-help">현금 칸에는 아래 외부 증여금을 제외한 돈을 입력하세요. 배우자 간 증여는 이체 전 현금을 입력하며 부부 총자금에 두 번 더하지 않습니다.</p>${giftFields('giftSelf','내가 받는 증여')}<div id="spouse-gift" hidden>${giftFields('giftSpouse','배우자가 받는 증여')}</div><p class="field-help">각자 이번 증여자 1개 그룹을 계산합니다. 세금은 받는 사람이 부담하고 구매 자금에서 미리 빼둡니다. 여러 그룹의 동시 증여·증여자의 세금 대납·기한 후 가산세는 별도 계산 대상입니다. <a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6533" target="_blank" rel="noopener noreferrer">국세청 계산 기준 ↗</a></p></section><div id="funding-summary" class="funding-summary" aria-live="polite"></div>`);
  // Rename existing fields without changing their stable names used by the calculator.
  form.elements.income.closest('label').firstChild.textContent='내 세전 연봉 ';
  form.elements.cash.closest('label').firstChild.textContent='내가 가진 현금 ';
  form.elements.takeHome.closest('label').firstChild.textContent='내 월 실수령액';
  form.elements.living.closest('label').firstChild.textContent='가구 월 생활·주거비';
  form.querySelector('#cash-help').textContent='신용대출 상환 후 남은 현금. 아래 증여 입력과 중복하지 마세요.';
  syncHousehold(form);
}
export function syncHousehold(form){
  const couple=form.elements.householdMode.value==='couple';
  const spouse=document.querySelector('#spouse-fields');spouse.hidden=!couple;spouse.disabled=!couple;
  document.querySelector('#spouse-gift').hidden=!couple;
  form.elements.giftSpouseenabled.disabled=!couple;
  document.querySelectorAll('[data-household]').forEach(b=>{const selected=b.dataset.household===(couple?'couple':'single');b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
  document.querySelector('#household-help').textContent=couple?'부부 소득·현금·부채를 함께 계산합니다. 소득·부채 합산 심사가 가능한 은행 주담대 가정이며 대출한도를 두 배로 늘리지 않습니다. 생활비·보증금·비상금은 가구 합계로 한 번만 입력하세요.':'본인 소득과 자금으로 계산해요. 배우자 입력값은 보관되지만 계산에 포함하지 않습니다.';
  for(const prefix of ['giftSelf','giftSpouse']){
    const enabled=form.elements[prefix+'enabled'].checked&&(prefix==='giftSelf'||couple);
    const fields=document.querySelector(`[data-gift-fields="${prefix}"]`);fields.disabled=!enabled;fields.hidden=!enabled;
  }
}
