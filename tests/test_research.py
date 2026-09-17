import datetime as dt
import importlib.util
from pathlib import Path
import unittest
import sqlite3

spec = importlib.util.spec_from_file_location('research_builder',Path(__file__).resolve().parents[1]/'scripts/build-research.py')
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)


class ResearchTests(unittest.TestCase):
    def test_conflicting_and_duplicate_transactions_are_preserved(self):
        db=sqlite3.connect(':memory:')
        db.execute('CREATE TABLE trades(fingerprint TEXT, status TEXT)')
        rows=[('a','valid'),('a','cancelled'),('b','valid'),('b','valid'),('c','valid'),('d','direct_trade')]
        db.executemany('INSERT INTO trades VALUES (?,?)',rows)
        research.flag_trade_conflicts(db)
        self.assertEqual(db.execute('SELECT count(*) FROM trades').fetchone()[0],6)
        self.assertEqual(dict(db.execute('SELECT status,count(*) FROM trades GROUP BY status')),
                         {'cancellation_conflict':1,'cancelled':1,'duplicate_candidate':2,'valid':1,'direct_trade':1})
        db.close()

    def test_completed_age_uses_anniversary(self):
        self.assertEqual(research.age_years('2023-09-17',dt.date(2026,9,16)),2)
        self.assertEqual(research.age_years('2023-09-16',dt.date(2026,9,16)),3)
        self.assertIsNone(research.age_years('2027-01-01',dt.date(2026,9,16)))
        self.assertIsNone(research.age_years(None,dt.date(2026,9,16)))

    def test_calendar_boundaries_and_low_sample(self):
        date=dt.date(2026,9,16)
        trades=[{'date':dt.date(2026,6,16),'amount':100},{'date':dt.date(2026,6,17),'amount':200}]
        result=research.price_windows(trades,date)['3']
        self.assertEqual(result['count'],1)
        self.assertEqual(result['previous_count'],1)
        self.assertEqual(result['median_manwon'],200)
        self.assertIsNone(result['change_pct'])
        self.assertEqual(result['status'],'low_sample')
        self.assertEqual(research.months_before(dt.date(2024,5,31),3),dt.date(2024,2,29))

    def test_growth_requires_both_samples(self):
        trades=[{'date':dt.date(2026,8,i),'amount':200+i} for i in (1,2,3)]
        trades += [{'date':dt.date(2026,5,i),'amount':100+i} for i in (1,2,3)]
        r=research.price_windows(trades,dt.date(2026,9,16))['3']
        self.assertEqual(r['change_pct'],round((202/102-1)*100,2))
        self.assertIsNone(research.price_windows([],dt.date(2026,9,16))['12']['median_manwon'])

    def test_no_name_only_or_ambiguous_join(self):
        a={'id':'one','address':'경기도 성남분당구 정자동 1','district':'성남분당구','road_address_raw':'정자로 1','aliases':['테스트'],'approved_date':'2000-01-01'}
        raw={'시군구':'경기도 성남시 분당구 정자동','번지':'1','도로명':'정자로 1','단지명':'테스트','건축년도':'2000'}
        self.assertEqual(research.match_trade(raw,research.make_indexes([a]))[0],'one')
        self.assertIsNone(research.match_trade({**raw,'번지':'99','도로명':'다른길 2'},research.make_indexes([a]))[0])
        self.assertIsNone(research.match_trade(raw,research.make_indexes([a,{**a,'id':'two'}]))[0])
        self.assertIsNone(research.match_trade({**raw,'건축년도':'2020'},research.make_indexes([a]))[0])

    def test_area_boundaries(self):
        for area,group in [(57.99,None),(58,'59'),(60,'59'),(60.01,None),(83,'84'),(85,'84'),(85.01,None)]:
            self.assertEqual(research.area_group(area),group)


if __name__=='__main__':
    unittest.main()
