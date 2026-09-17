---
document_type: handoff
version: 4
for: next_agent_astra
input: docs/APARTMENT_RESEARCH_FULL.md
scope: 서울·경기 400세대 이상
current_candidate_rows: 4897
required_output: validated_inventory_with_1_to_10_tiers
---

# 아파트 수집 작업 인수인계

## 2026-09-17 앱 연결 완료

사용자 요청으로 공식 마스터 4,860개 전체를 앱에 연결했다. `node scripts/export-app.mjs`로 재생성한다. 실제 원장 검증과 20개 단지 표본 대조 통과 후 연결했으며, 미확인 가격은 null이고 급지는 미발행이다. 24개 단위 페이지 탐색과 전체 검색을 제공한다. 최근 12개월 참고가격 연결은 3,274개다. 아래의 ‘앱은 초기 7개 유지’는 이전 상태 기록이다. 이번 변경도 로컬 구현이며 미배포.

## 2026-09-16 최신 작업 — 여기를 먼저 읽기

1. [ROADMAP](./ROADMAP.md)의 완료/미완료와 우선순위를 확인한다.
2. [APARTMENT_BIGDATA](./APARTMENT_BIGDATA.md)의 실제 수량·검수 결과를 읽는다.
3. [공식 단지 MD](./APARTMENT_RESEARCH_OFFICIAL.md) 또는 `research/regions/*.json`을 필요한 지역만 읽는다. 4,897행의 기존 후보를 처음부터 다시 수집하지 않는다.

공식 파일 기반 마스터 4,860개(서울 1,339 / 경기 3,521), 국토부 매매 CSV 447,834행(2024-09-17~2026-09-16)을 확보했다. 59/84㎡ 거래 이력이 연결된 단지는 3,286개이며, 정확한 전용면적별 월 집계는 150,498개다. 3개 단지 23개 커뮤니티 시설의 공식 근거도 기록했다. 운영시간·요금·나머지 단지 시설은 미확인이다.

**C드라이브 공간 부족으로 원본과 DB를 D드라이브에 보관한다.** 아래 명령으로 재현한다. 기본 명령의 C드라이브 경로로 대용량 파일을 다시 받지 않는다.

```powershell
node scripts/download-master.mjs D:/apt-research-work/reb-complexes.csv
node scripts/download-official.mjs --from=2024-09-17 --to=2025-09-16 --output-dir=D:/apt-research-work/molit
node scripts/download-official.mjs --from=2025-09-17 --to=2026-09-16 --output-dir=D:/apt-research-work/molit
python scripts/build-research.py --master D:/apt-research-work/reb-complexes.csv --raw-dir D:/apt-research-work/molit --database D:/apt-research-work/apartments.sqlite
python scripts/validate-research.py
python scripts/report-research.py
```

- 원본 다운로드는 국토부 웹 CSV 폼과 한국부동산원 파일 첨부를 사용한다. OpenAPI 호출·인증키는 사용하지 않는다.
- `research/manifest.json`: 출처, 기간, SHA-256, 상태별 수량, 실제 DB 경로.
- `research/review-queue.json`: 주소·명칭 불일치, 중복 식별자, 건축연도 충돌. 400세대 미만 또는 공식 마스터 범위 밖 단지 거래도 포함되어 있으므로 모두 매칭 오류로 세지 않는다.
- `research/apartments.sqlite`는 기본 경로일 뿐 이번 실제 위치는 `D:/apt-research-work/apartments.sqlite`이다. 스키마: `complexes`, `trades`, `sources`, `facilities`.
- `.cache/official-matches.json`의 과거 `verified_name_households`는 주소를 검증한 확정 매칭이 아니다. 공식 ID로 자동 승격하거나 이번 가격에 합치지 않는다.
- 민간 사이트 약관의 대량 수집 제한을 확인해 해당 수집을 중단했다. `.cache/collect-a99.mjs` 재실행 금지. 중간 스냅샷은 `research/snapshots/`에 로컬 보존하고 Git/앱 산출물에 포함하지 않는다.
- 앱은 초기 7개 단지를 유지한다. 연구 원장을 연결할 때는 거래 갱신·단지 동일성·급지 발행 검증을 별도로 통과시킨다.

다음 우선 작업: 금융 계약/실행일 경과규정 → 디딤돌/보금자리론 자격 모델 → 3단계 UX. 데이터는 공식 단지명 이력·행정구역 개편과 K-apt ID 연결을 병행한다. 원본 CSV에 없는 현재 시설 운영·관리비·주차 수치를 추정하지 않는다.

## 이전 수집 단계 기록 (이번 공식 원장과 구분)

`APARTMENT_RESEARCH_FULL.md`에 서울 1,383개와 경기 3,514개, 총 4,897개 후보가 들어 있다. 각 행에는 잠정 급지, 지역, 단지명, 생활권, 세대수, 준공연도, 원문 상세 URL이 있다. 공식 기본정보 1차 대조에서는 이름·세대수가 동시에 일치한 1,640개, 생활권 제한 퍼지 검토 1,274개, 미매칭 1,873개가 확인됐다. 상세 수치는 [수집 커버리지 감사](./APARTMENT_RESEARCH_COVERAGE.md)에 있다.

후보는 아구구의 공개 sitemap과 상세 페이지 메타 설명에서 추출했다. 세대수 400 이상이라는 1차 필터는 적용했지만, 공식 단지 식별자와 주소 매칭은 아직 완료하지 않았다.

## 다음 작업의 고정 순서

1. 공식 식별자 매칭: 한국부동산원 공동주택 단지 식별정보 또는 K-apt를 기준으로 `source_id`, 도로명주소, 법정동코드를 채운다.
2. 중복 정리: 이름이 아니라 공식 ID와 주소로 동명이인·통합단지·주상복합을 판정한다.
3. 자격 상태: `verified`, `needs_review`, `excluded` 중 하나를 단지마다 부여한다. 공식 세대수가 400 미만이면 `excluded`다.
4. 거래 연결: 국토부 실거래 원자료에서 59㎡급은 58~60㎡, 84㎡급은 83~85㎡로만 연결한다. 자료가 없으면 `null`이다.
5. 급지 산정: 교통·일자리 30, 대중교통 20, 교육 20, 생활 인프라 15, 주거환경 10, 거래 안정성 5를 원시값과 함께 저장한다.
6. 발행 조건: 필수 지표 충족률 80% 이상인 단지만 1~10급지를 발행한다. 그 미만은 `tier: null`, `tier_status: pending`이다.

## 권장 레코드 계약

검증 결과는 기존 앱 JSON에 바로 덮어쓰지 말고 별도 검증 산출물로 만든다. 최소 필드는 다음과 같다.

```yaml
id: official-complex-id
source_url: https://...
region: 서울|경기
district: 시·군·구
name: 단지명
address: 도로명주소
households: 400
completed_year: 2020
verification_status: verified|needs_review|excluded
tier: 1-10|null
tier_status: published|pending
data_completeness: 0.0
prices:
  area_59: null
  area_84: null
sources: []
checked_at: YYYY-MM-DD
```

Astra가 이 문서를 처음 읽을 때는 `status`, `quality`, `handoff` YAML을 먼저 읽고, 본문 표는 후보 입력으로만 취급한다. 검증 전에는 `data/apartments.json`을 수정하지 않는다.

## 금지할 처리

- 잠정 급지를 공인 등급이나 투자 추천으로 표현하지 않는다.
- 세대수·가격·면적을 이름만 보고 다른 단지에 연결하지 않는다.
- 확인되지 않은 59㎡·84㎡ 가격을 비례 환산하지 않는다.
- 네이버·커뮤니티·블로그 내용을 대량 복제하거나 원문 후기처럼 재게시하지 않는다.
- 검증 전 후보를 `data/apartments.json`에 바로 넣지 않는다.

## 완료 판정

- [ ] 서울·경기 후보 4,897개 각각에 공식 ID 또는 `needs_review` 사유가 있다.
- [ ] 공식 ID 기준 중복이 0건이다.
- [ ] 400세대 경계에서 제외·보류·포함 수가 보고된다.
- [ ] 59㎡·84㎡ 거래 연결률과 미확인 수가 지역별로 보고된다.
- [ ] 1~10급지별 단지 수, 자료 충족률, 산정 버전이 보고된다.
- [ ] 표본 단지 원문과 결과를 대조하는 자동 테스트가 통과한다.

## 관련 파일

- 전체 후보: [APARTMENT_RESEARCH_FULL.md](./APARTMENT_RESEARCH_FULL.md)
- 수집 감사: [APARTMENT_RESEARCH_COVERAGE.md](./APARTMENT_RESEARCH_COVERAGE.md)
- 1차 수동 조사 60개: [APARTMENT_RESEARCH.md](./APARTMENT_RESEARCH.md)
- 제품 계획: [PRODUCT_PLAN.md](./PRODUCT_PLAN.md)
- 현재 앱 데이터: [../data/apartments.json](../data/apartments.json)
