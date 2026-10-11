const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawn}=require('node:child_process');
test('isolated main sends ready, serves state, and saves on parentPort shutdown', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jukebox-lifecycle-'));
 const probe=net.createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
 fs.mkdirSync(path.join(root,'server')); fs.writeFileSync(path.join(root,'server','config.local.js'),'module.exports={playlistId:0,autoStart:false};');
 const child=spawn(process.execPath,['-e', `process.parentPort=new (require('events').EventEmitter)(); process.parentPort.postMessage=m=>console.log(JSON.stringify(m)); process.stdin.on('data',()=>process.parentPort.emit('message',{data:{type:'shutdown'}})); require(${JSON.stringify(path.join(__dirname,'../index.js'))});`],{env:{...process.env,JUKEBOX_DATA_DIR:root,JUKEBOX_MAIN_PORT:String(port),JUKEBOX_DESKTOP:'1'},stdio:['pipe','pipe','pipe']});
 let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
 const exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));
 try {
  let response;
  for(let i=0;i<40;i++){try{response=await fetch('http://127.0.0.1:'+port+'/api/state'); if(response.ok)break;}catch(_){} await new Promise(r=>setTimeout(r,50));}
  assert.ok(response && response.ok,output);
  assert.match(output,/"type":"ready"/);
  child.stdin.write('shutdown');
  await Promise.race([exit,new Promise((_,reject)=>setTimeout(()=>reject(Error('exit timeout')),4000).unref())]);
  assert.ok(fs.existsSync(path.join(root,'server','state.json')));
 }finally{child.kill();await exit;fs.rmSync(root,{recursive:true,force:true});}
});
