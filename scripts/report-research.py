"""Render the actual research exports as a compact, reviewable Markdown inventory."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'research/manifest.json').read_text(encoding='utf-8'))
records=[]
for region in ('seoul','gyeonggi'):
    records.extend(json.loads((ROOT/f'research/regions/{region}.json').read_text(encoding='utf-8'))['apartments'])


def money(value):
    return '미확인' if value is None else f'{value/10000:.2f}억'


def price(record, area):
    w=record['price_windows'][area]['12']
    return f'{money(w["median_manwon"])} / {w["count"]}건'


def change(record,area):
    values=[record['price_windows'][area][m]['change_pct'] for m in ('3','6','12')]
    return ' / '.join('보류' if v is None else f'{v:+.2f}%' for v in values)


def cell(value):
    return str(value).replace('|','/').replace('\n',' ')


lines=['---','document_type: official_research_inventory',f'as_of: {manifest["as_of"]}',
       'read_first: APARTMENT_BIGDATA.md','tier_status: pending','---','',
       '# 서울·경기 공식 단지 목록 · 연식과 가격 추이','',
       '기존 민간 후보를 대체 확정한 목록이 아니라, 공식 기본정보 파일 중 아파트·400세대 이상을 추린 별도 모집단이다.',
       '연식은 사용승인일 기준 만 연수. 금액은 최근 12개월 유효거래 중위값이며 호가가 아니다. 59㎡=58~60㎡, 84㎡=83~85㎡ 범위.',
       '변화율은 각 3/6/12개월 구간과 바로 이전 같은 길이 구간 비교. 양쪽 각 3건 미만이면 보류한다. 서로 다른 타입·층 구성의 영향이 남는다.',
       '전체 출처·제외 규칙·파일 위치는 [구축 현황](./APARTMENT_BIGDATA.md), 개별 시설 출처는 [시설 근거 JSON](../research/community-evidence.json)을 확인한다.',
       '단지 출처: [한국부동산원 기본정보](https://www.data.go.kr/data/15106861/fileData.do) · 거래 출처: [국토부 CSV](https://rt.molit.go.kr/pt/xls/xls.do).','']
for region in ('서울','경기'):
    lines += [f'## {region}','', '| 공식 ID | 시·군·구 | 단지 | 세대 | 사용승인 | 만 연식 | 59㎡ 12개월 / 표본 | 59㎡ 변화 3/6/12개월 | 84㎡ 12개월 / 표본 | 84㎡ 변화 3/6/12개월 | 시설 근거 |',
              '|---|---|---|---:|---|---:|---|---|---|---|---|']
    for r in records:
        if r['region']!=region:
            continue
        facilities=' · '.join(f for e in r['community'] for f in e['facilities']) or '미수집'
        if r['community']:
            facilities += ' (운영 미확인)'
        values=[r['id'],r['district'],r['name'],r['households'],r['approved_date'],r['age_years'],price(r,'59'),change(r,'59'),price(r,'84'),change(r,'84'),facilities]
        lines.append('| '+' | '.join(cell(v) for v in values)+' |')
    lines.append('')
(ROOT/'docs/APARTMENT_RESEARCH_OFFICIAL.md').write_text('\n'.join(lines),encoding='utf-8')
print(f'Markdown rows: {len(records)}')
