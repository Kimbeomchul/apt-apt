import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateDataset} from './validate-data.mjs';

export function selectPrice(windows,source){
  const months=windows['3'].count>=5?'3':windows['6'].count>0?'6':'12';
  const w=windows[months];
  if(!w.count)return null;
  return {amount:w.median_manwon,date:w.through,source,kind:`최근 ${months}개월 실거래 중위값${w.count<5?' · 소표본':''}`,sampleCount:w.count,periodDays:Math.round((Date.parse(w.through)-Date.parse(w.from_exclusive))/86400000),periodMonths:Number(months),fromExclusive:w.from_exclusive,verification:'주소·명칭 일치 거래 · 해제/직거래/중복 의심 제외'};
}

export async function exportApp(){
  const inputs=await Promise.all(['seoul','gyeonggi'].map(async region=>JSON.parse(await readFile(`research/regions/${region}.json`,'utf8'))));
  if(inputs[0].as_of!==inputs[1].as_of)throw Error('Research dates differ');
  const apartments=inputs.flatMap(d=>d.apartments).map(a=>({
    id:a.id,name:a.name,aliases:a.aliases,region:a.region,district:a.district,dong:'',address:a.address,
    households:a.households,year:Number(a.approved_date.slice(0,4)),source:a.source_url,regulated:null,
    verificationStatus:a.verification_status,tier:null,tierStatus:'pending',
    prices:Object.fromEntries(['59','84'].map(area=>[area,selectPrice(a.price_windows[area],a.price_source)])),
    missing:{'59':'최근 12개월 내 연결된 59㎡급 거래가 없습니다.','84':'최근 12개월 내 연결된 84㎡급 거래가 없습니다.'},
    tags:['공식 단지 정보',...(a.households>=1000?['1천 세대 이상']:[])],
    summary:a.price_quality_note,
    facts:[`사용승인일 ${a.approved_date}`,`${a.households.toLocaleString('ko-KR')}세대 · ${a.buildings}개 동`,`공식 단지 정보 기준 ${a.source_version}`],
    checks:['실제 동·호의 상태와 주차 공간','관리비와 장기수선 계획','현재 매물 가격과 최신 실거래'],
    facilities:a.community.length?'시설별 공식 근거 수집됨 · 현재 운영·이용료 확인 필요':'시설 정보 확인 필요',
  }));
  const data={version:2,updatedAt:inputs[0].as_of,coverage:`서울·경기 400세대 이상 공식 마스터 ${apartments.length.toLocaleString('ko-KR')}개 전체 수록. 마스터 기준시점 밖 신축·임대 등의 누락 가능.`,priceMethod:'59㎡급 58~60㎡, 84㎡급 83~85㎡의 국토부 실거래 중위값. 최근 3개월 5건 미만이면 6개월, 6개월 거래가 없으면 12개월 참고값 사용. 5건 미만은 소표본, 거래 미연결은 미확인. 날짜는 집계 기준일이며 현재 호가가 아닙니다.',apartments};
  validateDataset(data);
  await writeFile('data/apartments.json',JSON.stringify(data)+'\n');
  console.log(`Exported ${apartments.length} official apartments; ${apartments.filter(a=>a.prices['59']||a.prices['84']).length} with reference prices.`);
  return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await exportApp();
