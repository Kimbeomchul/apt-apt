import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    const relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(s=>s.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
    const target=(await stat(file)).isDirectory()?path.join(file,'index.html'):file;
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(await readFile(target));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`집의 기준: http://127.0.0.1:${port}`));
