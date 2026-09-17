"""Validate exported research against the local SQLite ledger and provenance."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import sqlite3
import statistics

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database')
    args=parser.parse_args()
    manifest=json.loads((ROOT/'research/manifest.json').read_text(encoding='utf-8'))
    records=[]
    for filename,region in [('seoul','서울'),('gyeonggi','경기')]:
        data=json.loads((ROOT/f'research/regions/{filename}.json').read_text(encoding='utf-8'))
        assert data['as_of']==manifest['as_of']
        assert len(data['apartments'])==manifest['by_region'][region]
        assert all(r['region']==region for r in data['apartments'])
        records.extend(data['apartments'])
    ids={r['id'] for r in records}
    assert len(ids)==len(records)==manifest['official_complexes']
    for r in records:
        assert r['id'].isdigit() and len(r['id'])==14
        assert r['households']>=400 and r['housing_type']=='apartment'
        assert r['age_years'] is None or r['age_years']>=0
        assert r['tier'] is None and r['tier_status']=='pending'
        assert r['source_url'].startswith('https://www.data.go.kr/')
        for values in r['price_windows'].values():
            for w in values.values():
                assert w['count']>=0 and w['previous_count']>=0
                if w['count']==0:
                    assert w['median_manwon'] is None and w['status']=='no_recent_trade'
                else:
                    assert 0<w['min_manwon']<=w['median_manwon']<=w['max_manwon']
                if w['count']<3 or w['previous_count']<3:
                    assert w['change_pct'] is None
        for evidence in r['community']:
            assert evidence['complex_id']==r['id']
            assert evidence['operation_status']=='unknown' and evidence['monthly_fee_won'] is None
    db=sqlite3.connect(args.database or manifest['database_path'])
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert db.execute('SELECT count(*) FROM trades').fetchone()[0]==manifest['trades_total']
    assert dict(db.execute('SELECT status,count(*) FROM trades GROUP BY status'))==manifest['trades']
    assert db.execute('SELECT count(*) FROM trades t LEFT JOIN complexes c ON t.complex_id=c.id WHERE t.complex_id IS NOT NULL AND c.id IS NULL').fetchone()[0]==0
    assert db.execute("SELECT count(*) FROM trades WHERE status='valid' AND date>?",(manifest['as_of'],)).fetchone()[0]==0
    month_rows,total_count=0,0
    for line in (ROOT/'research/monthly-prices.jsonl').open(encoding='utf-8'):
        row=json.loads(line)
        assert row['complex_id'] in ids and row['exclusive_area_sqm']>0
        assert row['count']>0 and 0<row['min_manwon']<=row['median_manwon']<=row['max_manwon']
        total_count+=row['count'];month_rows+=1
    assert month_rows==manifest['monthly_exact_area_points']
    assert total_count==manifest['trades']['valid']
    # Independent DB samples across both regions and every window/area.
    samples=records[::max(1,len(records)//20)]
    for r in samples:
        for area,(low,high) in {'59':(58,60),'84':(83,85)}.items():
            for w in r['price_windows'][area].values():
                values=[x[0] for x in db.execute("SELECT amount FROM trades WHERE complex_id=? AND status='valid' AND area BETWEEN ? AND ? AND date>? AND date<=?",(r['id'],low,high,w['from_exclusive'],w['through']))]
                assert len(values)==w['count']
                assert (statistics.median(values) if values else None)==w['median_manwon']
    for source in manifest['trade_sources']:
        path=Path(source['path'])
        assert hashlib.sha256(path.read_bytes()).hexdigest()==source['sha256']
    db.close()
    print(json.dumps({'complexes':len(records),'raw_trade_rows':manifest['trades_total'],'monthly_points':month_rows,'sample_complexes':len(samples),'status':'passed'}))


if __name__=='__main__':
    main()
