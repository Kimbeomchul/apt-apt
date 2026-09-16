# 집의 기준

서울·경기 400세대 이상 아파트의 참고가격과 개인별 구매 예산을 비교하는 정적 웹사이트입니다.

**[공개 사이트](https://kimbeomchul.github.io/apt-apt/)** · [GitHub 저장소](https://github.com/Kimbeomchul/apt-apt)

## 실행

Node.js 22 이상에서 별도 패키지 설치 없이 실행합니다.

```powershell
npm.cmd run dev
```

브라우저: http://127.0.0.1:4173

```powershell
npm.cmd run check
python -m unittest discover -s tests -p 'test_*.py'
```

`npm run build`는 배포 파일을 `dist/`에 생성합니다. `index.html`을 파일 탐색기에서 바로 열면 JSON fetch가 제한되므로 로컬 서버를 사용하세요.

## 구현 범위

- 모바일·데스크톱 탐색, 지역·평형·가격 정렬·관심·예산 필터
- 공개 페이지에서 확인한 초기 7개 실명 단지, 세대수, 평형별 참고가격·기준일·출처
- 확인된 네이버 단지 직접 링크 또는 주소·단지명으로 네이버 검색 링크
- 단지 상세, 예상 매매가 수정, 규제·비규제 시나리오, 최대 3개 비교
- 소득·현금·기존부채·보증금·비상금·부대비용·생활비 기반 예산
- LTV/DSR/정책 절대한도 비교, 월 상환·금리상승·소득감소 시나리오
- 공공데이터 CSV/API 수집기와 Pages 배포·갱신 워크플로

**전수 분석과 검증된 입지 급지 평가는 아직 아닙니다.** 초기 자료를 실제 현재 매물이나 공인 평가로 표현하지 않습니다. 가격군은 선택 평형의 금액 구간이며 입지 등급이 아닙니다. 정책 엔진은 일반 무주택자 은행 주담대 참고 시나리오이며 현행 규정 전체 검증·은행 승인 판단을 대체하지 않습니다.

프런트엔드는 배포·유지관리 부담을 줄이기 위해 프레임워크 의존성 없는 ES modules로 구현했습니다. 금융정보는 브라우저 메모리에만 남습니다. 관심 단지 ID만 localStorage에 저장합니다.

## GitHub Pages 배포

1. 대상 GitHub 저장소를 만들고 이 프로젝트를 `main`에 push합니다.
2. 저장소 Settings → Pages → Source를 **GitHub Actions**로 선택합니다.
3. `Test and deploy website` 워크플로가 테스트·빌드 후 공개합니다.
4. 기본 주소는 `https://계정명.github.io/저장소명/`입니다. 상대 경로를 사용하여 프로젝트 하위 경로에서도 동작합니다.

외부 패키지·빌드 API 키가 필요하지 않습니다. 소스 및 정적 결과에 금융정보나 공공데이터 키를 넣지 마세요. 실제 저장소가 연결되지 않으면 Actions 파일만으로 공개 URL이 만들어지지는 않습니다.

## 데이터 확장

현재 초기 JSON은 수작업으로 출처를 확인한 조사 자료입니다. 소수의 거래 사실만 기록하고 제3자 사이트를 자동 수집하지 않습니다. 검색 자료의 시차·동일 단지 매칭·거래 취소를 국토부 원본으로 재확인해야 합니다.

### CSV 가져오기

`data/master.example.csv` 및 `data/trades.example.csv`의 헤더에 맞춰 UTF-8 CSV를 준비합니다. 금액 단위는 모두 **만원**, 면적은 **전용㎡**, 날짜는 `YYYY-MM-DD`입니다. 단지 마스터의 `id`와 거래의 `id`는 공식 식별자와 주소로 검증하여 연결하세요. 이름만으로 결합하지 않습니다.

```powershell
python scripts/ingest.py --master data/master.csv --trades data/trades.csv --as-of 2026-09-16
npm.cmd run check
```

`source`는 단지 세대수 등의 확인 출처입니다. `regulated`는 검증한 경우에만 `true` 또는 `false`, 미확인이면 공란입니다. `naver_url`은 확인된 HTTPS 단지 링크만 입력합니다. `cancelled`는 Y/true/1이면 해제 처리합니다. `trade_type`이 직거래면 대표가격에서 제외합니다.

### 국토부 API

[국토부 상세 실거래 API](https://www.data.go.kr/data/15126468/openapi.do) 이용 승인 후 `MOLIT_API_KEY` 환경변수를 설정합니다. 마스터에 검증된 시군구 5자리 코드 `lawd_cd`와 해당 API의 `aptSeq` 값인 `apt_seq`를 채웁니다. K-apt ID와 aptSeq는 서로 다르므로 그대로 대입하지 마세요.

```powershell
python scripts/ingest.py --master data/master.csv
```

최근 13개 계약월을 다시 조회하여 해제·정정 내용을 반영합니다. 90일에 5건 미만이면 180일로 확대하고, 최근 180일 거래가 없으면 최대 365일 참고자료를 제공합니다. 소표본은 명시하며 365일 거래가 없으면 가격은 null입니다. API 실패 시 기존 JSON을 덮어쓰지 않습니다.

매일 자동 갱신은 GitHub Actions Secret `MOLIT_API_KEY`와 `data/master.csv`가 모두 있을 때만 실행됩니다. 둘 중 하나라도 없으면 기존 자료를 사용하며 실행 요약에 이유를 남깁니다. 소스 push·수동 실행·일일 예약이 모두 같은 수집→테스트→빌드→배포 절차를 사용합니다. 수집에 실패하면 배포를 중단하여 마지막 정상 배포본을 유지합니다. 새 자료는 배포 산출물에 저장하며 저장소의 기존 JSON은 수정하지 않습니다.

## 정책 관리 및 출시 전 조건

`data/policy.json`은 조사 기준일·공식 출처를 보관합니다. 현재 계산 수치는 `src/finance.js`에 있어 정책 변경 시 두 파일 및 경계 테스트를 함께 갱신해야 합니다. JSON 변경만으로 계산식을 자동 변경하지 않습니다.

- 확인 자료: 2025-10-15 대책, 2026-04-01 관리방안, 2026-06-30 규제지역 추가 지정.
- DTI, 담보평가·방공제, 생애최초·정책모기지, 보유주택 처분, 전입·취득 제한 및 경과규정은 별도 검토.
- 기존 부채는 규정상 연 원리금과 실제 월 상환액을 구별하여 입력.
- 기본 부대비용 4%는 세율이 아닌 예산 가정.
- 정책 자료 전체 최신성·특례를 검증하기 전 결과는 참고 시뮬레이션으로만 제공.

상세 기획: [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md)
