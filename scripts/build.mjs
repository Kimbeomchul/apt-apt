import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {validateDataset} from './validate-data.mjs';
const data=JSON.parse(await readFile('data/apartments.json','utf8'));
validateDataset(data);
await mkdir('dist',{recursive:true});
for(const name of ['index.html','src','assets','data/apartments.json','data/policy.json','data/price-history']){
  await mkdir('dist/'+name.split('/').slice(0,-1).join('/'),{recursive:true});
  await cp(name,'dist/'+name,{recursive:true});
}
await writeFile('dist/.nojekyll','');
console.log(`Build OK: ${data.apartments.length} researched complexes; dist/ ready for Pages.`);
