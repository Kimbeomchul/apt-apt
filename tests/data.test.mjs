import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDataset} from '../scripts/validate-data.mjs';
const data=JSON.parse(await readFile(new URL('../data/apartments.json',import.meta.url),'utf8'));
test('초기 조사 자료 범위·출처 검증',()=>assert.equal(validateDataset(data),true));
test('399세대 제외, 400세대 포함',()=>{const a=structuredClone(data);a.apartments[0].households=399;assert.throws(()=>validateDataset(a));a.apartments[0].households=400;assert.equal(validateDataset(a),true);});
test('전용 59㎡와 84㎡ 혼동 방지',()=>{const a=structuredClone(data);a.apartments[0].prices['59'].area=84;assert.throws(()=>validateDataset(a));});
test('세대수 미확인 및 중복 단지 ID 거부',()=>{const a=structuredClone(data);a.apartments[0].households=null;assert.throws(()=>validateDataset(a));const b=structuredClone(data);b.apartments.push(b.apartments[0]);assert.throws(()=>validateDataset(b));});
