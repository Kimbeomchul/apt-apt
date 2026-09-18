import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingTimeline} from '../src/timeline.js';
const base={price:80000,costs:4000,loan:40000,cash:10000,contractRate:10,middleRate:20,dates:['2026-10-01','2026-11-01','2026-12-01'],receipts:[{amount:34000,date:'2026-12-01'}]};
test('final sufficient funds do not conceal intermediate shortage',()=>{const rows=fundingTimeline(base);assert.equal(rows[0].shortage,0);assert.equal(rows[1].shortage,14000);assert.equal(rows[2].balance,0);});
test('receipt after closing is excluded and loan arrives only at closing',()=>{const rows=fundingTimeline({...base,receipts:[{amount:34000,date:'2026-12-02'}]});assert.equal(rows[2].shortage,34000);assert.equal(rows[0].available,10000);});
test('receipt on payment day counts once cumulatively',()=>{const rows=fundingTimeline({...base,receipts:[{amount:34000,date:'2026-11-01'}]});assert.equal(rows[1].balance,20000);assert.equal(rows[2].balance,0);});
test('invalid dates, amounts and percentages fail explicitly',()=>{assert.throws(()=>fundingTimeline({...base,contractRate:90,middleRate:20}));assert.throws(()=>fundingTimeline({...base,dates:['2026-11-01','2026-10-01','2026-12-01']}));assert.throws(()=>fundingTimeline({...base,receipts:[{amount:10,date:'2026-02-30'}]}));assert.throws(()=>fundingTimeline({...base,cash:NaN}));});
