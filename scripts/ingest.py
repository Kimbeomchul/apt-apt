"""Public-data ingestion, no third-party scraping; standard library only.

Inputs use explicit canonical IDs; never join by apartment name alone.
The source adapter is kept separate from calculations so files can be reviewed.
"""
import argparse
import copy
import csv
import datetime as dt
import json
import os
from pathlib import Path
import statistics
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
SOURCE = 'https://www.data.go.kr/data/15126468/openapi.do'


def area_group(area):
    area = float(area)
    if 58 <= area <= 60:
        return '59'
    if 83 <= area <= 85:
        return '84'
    return None


def summarize(trades, as_of):
    """Cancelled/direct trades excluded; low volume never silently extrapolated."""
    clean = {}
    for t in trades:
        if str(t.get('cancelled', '')).lower() in ('y', 'true', '1') or t.get('trade_type') == '직거래':
            continue
        date = dt.date.fromisoformat(t['date'])
        amount = float(str(t['amount']).replace(',', ''))
        if amount <= 0 or date > as_of or not area_group(t['area']):
            continue
        # Preserve distinct apartments/units when supplied; otherwise exact duplicates removed.
        key = (t['date'], str(t['area']), str(t.get('floor', '')), amount, t.get('building', ''), t.get('unit', ''))
        clean[key] = {**t, 'amount': amount, 'date_obj': date}
    result = {}
    for group in ('59', '84'):
        series = sorted((t for t in clean.values() if area_group(t['area']) == group), key=lambda t: t['date_obj'])
        chosen = []
        days = 90
        for days in (90, 180):
            chosen = [t for t in series if 0 <= (as_of - t['date_obj']).days <= days]
            if len(chosen) >= 5:
                break
        if not chosen:
            chosen = [t for t in series if (as_of - t['date_obj']).days <= 365]
            days = 365
        if not chosen:
            result[group] = None
            continue
        amounts = [t['amount'] for t in chosen]
        result[group] = {
            'amount': statistics.median(amounts), 'date': chosen[-1]['date'],
            'area': None, 'floor': None, 'source': SOURCE,
            'kind': f'{days}일 유효거래 중위값' + (' · 소표본 참고' if len(chosen) < 5 else ''),
            'observedAt': as_of.isoformat(), 'verification': '국토부 API/입력 거래 파일',
            'sampleCount': len(chosen), 'periodDays': days, 'min': min(amounts), 'max': max(amounts),
            'history': [{'date':t['date'],'amount':t['amount'],'area':float(t['area']),'floor':t.get('floor')} for t in chosen],
        }
    return result


def read_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def merge_dataset(master, trades, as_of):
    by_id = {}
    for t in trades:
        by_id.setdefault(t['id'], []).append(t)
    apartments, seen = [], set()
    for m in master:
        if m['id'] in seen:
            raise ValueError('Duplicate master ID: ' + m['id'])
        seen.add(m['id'])
        households = int(m['households'])
        if m['region'] not in ('서울', '경기') or households < 400:
            continue
        if not m.get('source', '').startswith('https://'):
            raise ValueError('Master provenance required: ' + m['id'])
        apartments.append({
            'id':m['id'], 'name':m['name'], 'region':m['region'], 'district':m['district'],
            'dong':m['dong'], 'address':m['address'], 'households':households,
            'year':int(m['year']), 'source':m['source'],
            'regulated': {'true':True, 'false':False}.get(m.get('regulated')),
            'naverUrl':m.get('naver_url') or None,
            'prices':summarize(by_id.get(m['id'], []), as_of),
            'tags':['공공데이터 연동'], 'summary':'거래 자료와 단지 정보를 함께 확인하세요.',
            'facts':[f'{households:,}세대 · {m["year"]}년 준공'],
            'checks':['실제 출퇴근·통학 동선','주차·수리 상태·관리비','커뮤니티 운영 여부'],
            'facilities':'현재 운영 여부 확인 필요',
        })
    if not apartments:
        raise ValueError('No eligible apartments; previous dataset retained')
    unmatched = len([t for t in trades if t['id'] not in seen])
    return {'version':1,'updatedAt':as_of.isoformat(),
            'coverage':f'제공된 단지 마스터 중 {len(apartments)}개 · 전수 여부는 마스터 범위에 따름',
            'priceMethod':'같은 단지·면적 그룹의 해제·직거래 제외 90일/180일 중위값. 부족 시 최대 365일 소표본 참고.',
            'unmatchedTrades':unmatched,'apartments':apartments}


def months_back(as_of, count):
    index = as_of.year * 12 + as_of.month - 1
    for i in range(count):
        year, month = divmod(index-i, 12)
        yield f'{year:04d}{month+1:02d}'


def api_items(region, month, key):
    page, rows = 1, []
    while True:
        query = urllib.parse.urlencode({'serviceKey':urllib.parse.unquote(key), 'LAWD_CD':region,
                                      'DEAL_YMD':month,'pageNo':page,'numOfRows':1000})
        # Never log URL: it contains the API key.
        request = urllib.request.Request(API+'?'+query, headers={'User-Agent':'JipStandard-PublicData/0.1'})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                root = ET.fromstring(response.read())
        except Exception:
            raise RuntimeError(f'API request failed for {region}/{month}; key omitted') from None
        code = root.findtext('.//resultCode')
        if code not in ('000', '00'):
            raise RuntimeError(f'API returned non-success code for {region}/{month}; response omitted')
        items = root.findall('.//item')
        rows.extend({c.tag:(c.text or '').strip() for c in item} for item in items)
        total = int(root.findtext('.//totalCount') or 0)
        if len(rows) >= total:
            break
        if not items:
            raise RuntimeError('Incomplete API pagination')
        page += 1
    return rows


def fetch_trades(master, key, as_of, months=13):
    # RTMS aptSeq must be checked against canonical address before adding to master.
    mapping = {}
    for m in master:
        if not m.get('lawd_cd') or not m.get('apt_seq'):
            raise ValueError('API mode needs verified lawd_cd and apt_seq for each master row')
        match = (m['lawd_cd'], m['apt_seq'])
        if match in mapping:
            raise ValueError('Ambiguous RTMS identifier')
        mapping[match] = m['id']
    trades = []
    for region in sorted({m['lawd_cd'] for m in master}):
        for month in months_back(as_of, months):
            for item in api_items(region, month, key):
                identity = mapping.get((region,item.get('aptSeq')))
                if identity is None:
                    continue
                trades.append({'id':identity,'date':f'{int(item["dealYear"]):04d}-{int(item["dealMonth"]):02d}-{int(item["dealDay"]):02d}',
                               'area':item['excluUseAr'],'amount':item['dealAmount'],'floor':item.get('floor'),
                               'cancelled': 'Y' if item.get('cdealDay') or item.get('cdealType')=='O' else '',
                               'trade_type':item.get('dealingGbn'),'building':item.get('aptDong','')})
    return trades


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', required=True)
    parser.add_argument('--trades', help='CSV input; omitted uses MOLIT_API_KEY')
    parser.add_argument('--output', default=str(ROOT/'data/apartments.json'))
    parser.add_argument('--as-of', default=dt.date.today().isoformat())
    parser.add_argument('--months', type=int, default=13)
    args = parser.parse_args()
    as_of = dt.date.fromisoformat(args.as_of)
    master = read_csv(args.master)
    if args.trades:
        trades = read_csv(args.trades)
    else:
        key = os.environ.get('MOLIT_API_KEY')
        if not key:
            raise ValueError('MOLIT_API_KEY is required; do not put the key in source files')
        trades = fetch_trades(master,key,as_of,args.months)
    result = merge_dataset(master,trades,as_of)
    output = Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    temp = output.with_suffix('.tmp')
    temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(output)
    print(f'Updated {len(result["apartments"])} complexes; unmatched input trades: {result["unmatchedTrades"]}')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
