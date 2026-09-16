import datetime as dt
import unittest
from scripts.ingest import summarize, merge_dataset, area_group, months_back


class IngestTest(unittest.TestCase):
    def trade(self, amount=50000, **kwargs):
        return dict(id='a', date='2026-09-01', area=59.9, floor=5, amount=amount, **kwargs)

    def test_cancelled_and_direct_excluded(self):
        p=summarize([self.trade(),self.trade(10000,cancelled='Y'),self.trade(20000,trade_type='직거래')],dt.date(2026,9,16))
        self.assertEqual(p['59']['amount'],50000)
        self.assertEqual(p['59']['sampleCount'],1)
        self.assertIsNone(p['84'])

    def test_duplicate_and_future(self):
        t=self.trade()
        future={**t,'date':'2026-10-01'}
        p=summarize([t,t,future],dt.date(2026,9,16))
        self.assertEqual(p['59']['sampleCount'],1)

    def test_median_and_window(self):
        trades=[{**self.trade(v),'floor':i} for i,v in enumerate([100,200,300,400,999999])]
        p=summarize(trades,dt.date(2026,9,16))
        self.assertEqual(p['59']['amount'],300)
        self.assertEqual(p['59']['periodDays'],90)

    def test_old_no_price(self):
        self.assertIsNone(summarize([{**self.trade(),'date':'2024-01-01'}],dt.date(2026,9,16))['59'])

    def test_area_boundaries(self):
        self.assertEqual(area_group(58.46),'59')
        self.assertEqual(area_group(84.99),'84')
        self.assertIsNone(area_group(74))

    def test_scope_and_master_id(self):
        m=dict(id='a',region='서울',district='구',dong='동',address='주소',name='단지',households='400',year='2000',source='https://example.com')
        result=merge_dataset([m,{**m,'id':'b','households':'399'}],[self.trade()],dt.date(2026,9,16))
        self.assertEqual(len(result['apartments']),1)
        with self.assertRaises(ValueError):
            merge_dataset([m,m],[],dt.date(2026,9,16))

    def test_month_rollover(self):
        self.assertEqual(list(months_back(dt.date(2026,1,1),3)),['202601','202512','202511'])


if __name__=='__main__':
    unittest.main()
