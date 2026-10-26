import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets = {'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/people.js':'people.js','/vendor/exceljs.min.js':'vendor/exceljs.min.js'};
const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(!assets[path]) {res.writeHead(404);res.end('Not found');return;}
 try {const file=assets[path]; const data=await readFile(fileURLToPath(new URL('./public/'+file,import.meta.url)));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff'});res.end(data);} catch {res.writeHead(500);res.end('Unable to load application');}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Teamflow ready on port '+server.address().port));
