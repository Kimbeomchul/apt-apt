"""Build a local apartment warehouse from official downloadable CSVs (no API).

Only unambiguous address + name matches enter price summaries. Raw trade rows
and exclusion reasons remain queryable in SQLite. Outputs never replace app data.
"""
import argparse
import calendar
from collections import Counter, defaultdict
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import statistics
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
MASTER_SOURCE = 'https://www.data.go.kr/data/15106861/fileData.do'
TRADE_SOURCE = 'https://rt.molit.go.kr/pt/xls/xls.do'


def norm(value):
    return re.sub(r'[^0-9a-z가-힣]', '', unicodedata.normalize('NFKC', value or '').lower())


def address_key(value):
    # Both spellings occur in the official files. Retain all lower address parts.
    value = re.sub(r'(수원|성남|고양|용인|안양|안산|부천)시?\s*([가-힣]+구)', r'\1\2', value)
    return norm(value)


def name_key(value):
    return norm(value).replace('아파트', '')


def age_years(approved, as_of):
    try:
        date = dt.date.fromisoformat(approved)
    except (ValueError, TypeError):
        return None
    if date > as_of:
        return None
    return as_of.year - date.year - ((as_of.month, as_of.day) < (date.month, date.day))


def months_before(date, months):
    year, month = divmod(date.year * 12 + date.month - 1 - months, 12)
    return dt.date(year, month + 1, min(date.day, calendar.monthrange(year, month + 1)[1]))


def area_group(area):
    return '59' if 58 <= area <= 60 else '84' if 83 <= area <= 85 else None


def price_windows(trades, as_of):
    """Strict adjacent calendar windows (start, end], all money in KRW 10,000."""
    result = {}
    for months in (3, 6, 12):
        start, prior = months_before(as_of, months), months_before(as_of, months * 2)
        current = [t['amount'] for t in trades if start < t['date'] <= as_of]
        previous = [t['amount'] for t in trades if prior < t['date'] <= start]
        median = statistics.median(current) if current else None
        old = statistics.median(previous) if previous else None
        result[str(months)] = {'from_exclusive':start.isoformat(), 'through':as_of.isoformat(),
            'count':len(current), 'median_manwon':median,
            'min_manwon':min(current) if current else None, 'max_manwon':max(current) if current else None,
            'previous_count':len(previous), 'previous_median_manwon':old,
            'change_pct':round((median / old - 1) * 100, 2) if len(current) >= 3 and len(previous) >= 3 and old else None,
            'status':'no_recent_trade' if not current else 'low_sample' if len(current) < 3 else 'observed',
            'comparison_status':'sufficient_samples' if len(current) >= 3 and len(previous) >= 3 else 'insufficient_samples'}
    return result


def load_master(path, as_of):
    records = []
    counts = Counter()
    ids = set()
    with path.open(encoding='cp949', newline='') as f:
        for raw in csv.DictReader(f):
            counts['raw_rows'] += 1
            r = {k:v.strip() for k,v in raw.items()}
            if r['단지종류'] != '1' or not r['주소'].startswith(('서울특별시 ', '경기도 ')):
                continue
            counts['regional_apartment_rows'] += 1
            if int(r['세대수'] or 0) < 400:
                counts['under_400'] += 1
                continue
            identity = r['단지고유번호']
            if identity in ids:
                raise ValueError('Duplicate official ID: ' + identity)
            ids.add(identity)
            parts = r['주소'].split()
            district = ' '.join(parts[1:3]) if len(parts)>2 and parts[2].endswith('구') else parts[1]
            names = list(dict.fromkeys(r[k] for k in ('단지명_공시가격','단지명_건축물대장','단지명_도로명주소') if r[k]))
            records.append({'id':identity, 'id_namespace':'reb_complex', 'name':names[0] if names else None,
                'aliases':names, 'region':'서울' if parts[0]=='서울특별시' else '경기', 'district':district,
                'address':r['주소'], 'road_address_raw':r['도로명주소'] or None,
                'parcel_id':r['필지고유번호'] or None, 'legal_dong_code':r['필지고유번호'][:10] or None,
                'households':int(r['세대수']), 'buildings':int(r['동수']) if r['동수'] else None,
                'approved_date':r['사용승인일'] or None, 'age_years':age_years(r['사용승인일'],as_of),
                'age_as_of':as_of.isoformat(), 'housing_type':'apartment', 'mixed_use_status':'unknown',
                'verification_status':'official_source_record', 'tier':None, 'tier_status':'pending',
                'parking_spaces':None, 'heating':None, 'management_cost':None,
                'source_url':MASTER_SOURCE, 'source_version':'2026-08-31',
                'community_status':'not_collected', 'community':[]})
    return sorted(records,key=lambda r:r['id']), dict(counts)


def make_indexes(master):
    parcel, road = defaultdict(list), defaultdict(list)
    for r in master:
        parcel[address_key(r['address'])].append(r)
        if r['road_address_raw']:
            province = r['address'].split()[0]
            road[address_key(province+' '+r['district']+' '+r['road_address_raw'])].append(r)
    return parcel, road


def match_trade(raw, indexes):
    parcel, road = indexes
    addr = raw['시군구']+' '+raw['번지']
    parts = raw['시군구'].split()
    # Remove 읍/면/리/동 from the full legal address to get city/district prefix.
    district_parts = []
    for part in parts:
        if part.endswith(('동','읍','면','리')):
            break
        district_parts.append(part)
    road_addr = ' '.join(district_parts)+' '+raw.get('도로명','')
    name = name_key(raw['단지명'])
    candidates = {r['id']:r for r in parcel.get(address_key(addr),[])+road.get(address_key(road_addr),[])}
    exact = [r for r in candidates.values() if name and name in {name_key(n) for n in r['aliases']}]
    if len(exact) != 1:
        return None, 'ambiguous_identity' if len(exact)>1 else 'unmatched_identity'
    r = exact[0]
    built = raw.get('건축년도','')
    if built.isdigit() and r['approved_date'] and abs(int(built)-int(r['approved_date'][:4]))>1:
        return None, 'construction_year_conflict'
    return r['id'], 'address_and_name'


def read_trade_csv(path):
    text = path.read_text(encoding='cp949')
    lines = text.splitlines()
    start = next((i for i,line in enumerate(lines) if line.startswith('"NO","시군구"')),None)
    if start is None:
        raise ValueError('Trade CSV header missing: '+str(path))
    return csv.DictReader(io.StringIO('\n'.join(lines[start:])))


def flag_trade_conflicts(db):
    db.execute("UPDATE trades SET status='cancellation_conflict' WHERE status='valid' AND fingerprint IN (SELECT fingerprint FROM trades WHERE status='cancelled')")
    db.execute("UPDATE trades SET status='duplicate_candidate' WHERE status='valid' AND fingerprint IN (SELECT fingerprint FROM trades WHERE status='valid' GROUP BY fingerprint HAVING count(*)>1)")


def dump(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master',default='.cache/official_complexes.bin')
    parser.add_argument('--as-of',default='2026-09-16')
    parser.add_argument('--raw-dir',default='data/raw/molit')
    parser.add_argument('--database',default='research/apartments.sqlite')
    args = parser.parse_args()
    as_of = dt.date.fromisoformat(args.as_of)
    master_path = ROOT/args.master
    master, audit = load_master(master_path,as_of)
    if not master:
        raise ValueError('No eligible official complexes')
    folder = ROOT/'research'
    folder.mkdir(exist_ok=True)
    db_path = ROOT/args.database
    db_path.parent.mkdir(parents=True,exist_ok=True)
    temp = db_path.with_suffix('.build.sqlite')
    if temp.exists():
        raise ValueError('Incomplete build exists; inspect research/apartments.build.sqlite before retry')
    db = sqlite3.connect(temp)
    db.execute('PRAGMA temp_store=MEMORY')
    db.executescript('''CREATE TABLE complexes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE sources(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE trades(id TEXT PRIMARY KEY, complex_id TEXT, date TEXT, area REAL, amount INTEGER,
        status TEXT NOT NULL, fingerprint TEXT NOT NULL, source_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE facilities(complex_id TEXT, data TEXT NOT NULL);
      CREATE INDEX trade_complex ON trades(complex_id,date,area);
      CREATE INDEX trade_fingerprint ON trades(fingerprint);''')
    indexes = make_indexes(master)
    source_manifest = []
    unmatched = Counter()
    files = sorted((ROOT/args.raw_dir).glob('*.csv'))
    if not files:
        raise ValueError('No official trade CSVs; supply --raw-dir')
    for file in files:
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        metadata = json.loads(file.with_suffix('.csv.metadata.json').read_text(encoding='utf-8'))
        if metadata['sha256'] != digest:
            raise ValueError('Source hash mismatch: '+str(file))
        if metadata['from'] > metadata['to'] or metadata['to'] > args.as_of:
            raise ValueError('Trade snapshot period outside research date')
        source_manifest.append({**metadata,'path':str(file.relative_to(ROOT)) if file.is_relative_to(ROOT) else str(file)})
        db.execute('INSERT INTO sources VALUES (?,?)',(digest,json.dumps(metadata,ensure_ascii=False)))
        for raw in read_trade_csv(file):
            identity, match_status = match_trade(raw,indexes)
            date = dt.date(int(raw['계약년월'][:4]),int(raw['계약년월'][4:]),int(raw['계약일']))
            if not metadata['from'] <= date.isoformat() <= metadata['to']:
                raise ValueError('CSV returned a date outside the requested period')
            expected='서울특별시 ' if metadata['region']=='서울특별시' else '경기도 '
            if not raw['시군구'].startswith(expected):
                raise ValueError('CSV returned a different region')
            amount = int(raw['거래금액(만원)'].replace(',',''))
            area = float(raw['전용면적(㎡)'])
            cancelled = raw.get('해제사유발생일','').strip() not in ('','-')
            trade_type = raw.get('거래유형','').strip()
            status = ('cancelled' if cancelled else 'direct_trade' if trade_type=='직거래' else
                      'unknown_trade_type' if trade_type!='중개거래' else
                      'invalid_amount' if amount<=0 else 'future_date' if date>as_of else
                      match_status if identity is None else 'valid')
            if identity is None:
                unmatched[(raw['시군구'],raw['번지'],raw['단지명'],match_status)] += 1
            fingerprint = hashlib.sha256(json.dumps([identity or raw['시군구']+' '+raw['번지'],name_key(raw['단지명']),date.isoformat(),area,amount,raw.get('동'),raw.get('층')],ensure_ascii=False).encode()).hexdigest()
            row_id = digest+':'+raw['NO']
            db.execute('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?)',(row_id,identity,date.isoformat(),area,amount,status,fingerprint,digest,json.dumps({'raw':raw,'match_status':match_status},ensure_ascii=False)))
        db.commit()
        print(json.dumps({'loaded':file.name,'trade_rows':db.execute('SELECT count(*) FROM trades').fetchone()[0]}),flush=True)
    # Without a public unique transaction ID, identical units cannot be safely
    # distinguished. Retain every row and exclude ambiguous groups from summaries.
    flag_trade_conflicts(db)
    groups = defaultdict(list)
    monthly = defaultdict(list)
    for identity,date,area,amount in db.execute("SELECT complex_id,date,area,amount FROM trades WHERE status='valid'"):
        group = area_group(area)
        if group:
            groups[(identity,group)].append({'date':dt.date.fromisoformat(date),'amount':amount})
        monthly[(identity,date[:7],area)].append(amount)
    evidence_path = folder/'community-evidence.json'
    evidence = json.loads(evidence_path.read_text(encoding='utf-8')) if evidence_path.exists() else []
    by_id = {r['id']:r for r in master}
    for item in evidence:
        record = by_id.get(item['complex_id'])
        if not record or name_key(item['complex_name']) not in {name_key(n) for n in record['aliases']}:
            raise ValueError('Facility identity not verified: '+str(item))
        record['community'].append(item)
        record['community_status']='source_documented_operation_unverified'
        db.execute('INSERT INTO facilities VALUES (?,?)',(item['complex_id'],json.dumps(item,ensure_ascii=False)))
    for r in master:
        r['price_windows']={g:price_windows(groups[(r['id'],g)],as_of) for g in ('59','84')}
        r['price_source']=TRADE_SOURCE
        r['price_quality_note']='주소·명칭 일치 거래. 해제·직거래·중복 의심 제외. 원본 신고지연/정정 가능. 동일 면적 그룹의 구성 변화가 포함될 수 있음.'
        db.execute('INSERT INTO complexes VALUES (?,?)',(r['id'],json.dumps(r,ensure_ascii=False)))
    db.commit()
    audit.update({'as_of':args.as_of,'official_complexes':len(master),'by_region':dict(Counter(r['region'] for r in master)),
        'age_known':sum(r['age_years'] is not None for r in master),
        'facilities_complexes':sum(bool(r['community']) for r in master),
        'facility_facts':sum(len(x['facilities']) for x in evidence),
        'trades':dict(db.execute('SELECT status,count(*) FROM trades GROUP BY status').fetchall()),
        'trades_total':db.execute('SELECT count(*) FROM trades').fetchone()[0],
        'complexes_with_59_84_trades':sum(any(groups[(r['id'],g)] for g in ('59','84')) for r in master),
        'monthly_exact_area_points':len(monthly),
        'database_path':str(db_path),'raw_directory':str(ROOT/args.raw_dir),
        'master_sha256':hashlib.sha256(master_path.read_bytes()).hexdigest(),'trade_sources':source_manifest})
    dump(folder/'manifest.json',audit)
    for region,filename in [('서울','seoul'),('경기','gyeonggi')]:
        dump(folder/'regions'/f'{filename}.json',{'as_of':args.as_of,'apartments':[r for r in master if r['region']==region]})
    dump(folder/'review-queue.json',[{'address':a+' '+b,'name':n,'reason':reason,'trade_rows':count} for (a,b,n,reason),count in sorted(unmatched.items())])
    monthly_file=folder/'monthly-prices.jsonl'
    with monthly_file.open('w',encoding='utf-8') as f:
        for (identity,month,area),amounts in sorted(monthly.items()):
            f.write(json.dumps({'complex_id':identity,'month':month,'exclusive_area_sqm':area,'count':len(amounts),'median_manwon':statistics.median(amounts),'min_manwon':min(amounts),'max_manwon':max(amounts),'low_sample':len(amounts)<3},ensure_ascii=False)+'\n')
    db.close()
    temp.replace(db_path)
    lines=['# 공식 파일 기반 아파트 데이터 구축 현황','',f'기준일: {args.as_of} · 재현 명령: [인수인계](./APARTMENT_RESEARCH_HANDOFF.md)','',
        '## 실제 확보한 자료','',f'- 공식 단지 마스터: **{len(master):,}개** (서울 {audit["by_region"].get("서울",0):,} / 경기 {audit["by_region"].get("경기",0):,})',
        f'- 사용승인일 기반 만 연식: **{audit["age_known"]:,}개**',f'- 내려받은 국토부 매매 원본: **{audit["trades_total"]:,}행**',
        f'- 59㎡/84㎡ 가격 이력이 연결된 단지: **{audit["complexes_with_59_84_trades"]:,}개**',
        f'- 정확한 전용면적별 월별 집계: **{len(monthly):,}개**',f'- 커뮤니티 근거: **{audit["facilities_complexes"]}개 단지 / {audit["facility_facts"]}개 시설** (현재 운영 여부·이용료 미확인)','',
        '| 거래 상태 | 행 수 |','|---|---:|',*[f'| {k} | {v:,} |' for k,v in audit['trades'].items()],'',
        '## 저장 위치','', '- [서울 JSON](../research/regions/seoul.json) · [경기 JSON](../research/regions/gyeonggi.json)',
        '- [수집 명세·해시·수량](../research/manifest.json) · [매칭 검수 큐](../research/review-queue.json)',
        '- [전용면적별 월별 가격 JSONL](../research/monthly-prices.jsonl) · [시설별 근거](../research/community-evidence.json)',
        f'- `{db_path}`: 원본 거래·단지·출처·시설을 보관한 로컬 DB. 원본 CSV: `{ROOT/args.raw_dir}` (Git/앱 배포 제외).','',
        '## 해석과 남은 검증','',
        '- 공식 마스터의 공시대상·기준시점 범위만 포함한다. 서울·경기 모든 현존/신축/임대 단지의 전수 검증 완료를 의미하지 않는다.',
        '- 기존 4,897개 민간 후보와 이번 공식 마스터는 다른 모집단이다. 같은 이름만으로 통합하지 않는다.',
        '- 3/6/12개월은 기준일에서 달력 월을 뺀 경계의 `(시작, 종료]` 구간이다. 전용 59㎡ 그룹은 58~60㎡, 84㎡ 그룹은 83~85㎡이며 정확한 면적별 월 집계도 보존한다.',
        '- 변화율은 현재·이전 구간 모두 3건 이상일 때만 계산한다. 거래 없음은 null, 소표본은 low_sample. 최근 계약은 신고지연 영향을 받을 수 있다.',
        '- 동일 날짜·면적·금액·동·층 중복 의심 건은 원본을 보존하고 집계에서 제외한다. 실제 별개 거래인지 검수해야 한다.',
        '- 주차·난방·관리비·재건축 단계는 공식 근거가 연결되기 전 null이다. 시설의 존재 근거와 현재 운영·요금을 구분한다.',
        '- 급지는 아직 발행하지 않는다. 주소 휴리스틱 급지를 가격/시설 평가로 포장하지 않는다.',
        '- 민간 사이트 대량 수집은 약관 검토 후 중단했다. 기존 중간 추출값은 `research/snapshots/`에 보관하고 배포·공식 결과에 사용하지 않는다.','',
        '## 다음 작업 우선순위','',
        '1. 매칭 검수 큐의 주소 개편·단지명 이력·신축 누락을 공식 ID로 해소',
        '2. K-apt 공개 파일에서 주차·난방·관리비 항목 수집 및 ID 교차표 구축',
        '3. 시공사/관리주체 시설 안내를 추가하고 운영시간·이용료·확인일 확보',
        '4. 전월세 CSV를 별도 수집해 동일 면적·기간의 전세가율 산정',
        '5. 학교·역·공원·병원 위치와 재건축 단계의 공식 근거 연결','',
        '출처: [한국부동산원 공식 마스터]('+MASTER_SOURCE+') · [국토부 CSV 자료제공]('+TRADE_SOURCE+')','']
    (ROOT/'docs/APARTMENT_BIGDATA.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({k:v for k,v in audit.items() if k!='trade_sources'},ensure_ascii=True))


if __name__ == '__main__':
    main()
