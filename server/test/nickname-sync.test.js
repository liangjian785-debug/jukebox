const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('cached names recover anonymous users without undoing explicit renames; empty-queue renames persist', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jukebox-names-'));
 const code=`(async()=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 const users=require('./server/users'),state=require('./server/state'),persistence=require('./server/persistence');
 const router=require('./server/routes')({emit(){}},{},()=>{},{});
 const invoke=(method,url,client,name,body={})=>{
   let data,status=200;const req={path:url,ip:'::ffff:192.0.2.1',body,get:k=>({'x-client-id':client,'x-client-nickname':name}[k]||'')};
   const res={status(n){status=n;return this},json(v){data=v;return this}};
   const route=router.stack.find(l=>l.route?.path===url&&l.route.methods[method]).route;
   router.stack[0].handle(req,res,()=>route.stack[0].handle(req,res));return{status,data};
 };
 invoke('get','/me','a','');assert.equal(users.get('a').nickname,'');
 const me=invoke('get','/me','a',encodeURIComponent('小明')).data;assert.equal(me.nickname,'小明');
 assert.equal(users.list([])[0].nickname,'小明');
 assert.equal(invoke('post','/me/nickname','a',encodeURIComponent('小明'),{nickname:'新昵称'}).status,200);
 invoke('get','/me','b',encodeURIComponent('旧缓存'));assert.equal(users.get('b').nickname,'新昵称');assert.equal(users.canonicalOf('b'),'a');
 invoke('get','/me','a','%broken');assert.equal(users.get('a').nickname,'新昵称');
 assert.equal(invoke('post','/me/nickname','a','',{nickname:{bad:true}}).status,400);
 await new Promise(r=>setTimeout(r,1200));
 const saved=persistence.load();assert.equal(saved.users[0].nickname,'新昵称');assert.equal(saved.userQueue.length,0);
 state.restore(saved);assert.equal(users.get('b').nickname,'新昵称');
 state.restore({users:[{canonicalId:'legacy',aliases:[],nickname:'',ip:'192.0.2.2'}],userQueue:[{requestedBy:'legacy',nickname:'旧队列昵称',songId:'1',platform:'netease'}]});
 assert.equal(users.get('legacy').nickname,'旧队列昵称');assert.equal(users.list(state.userQueue)[0].nickname,'旧队列昵称');
 state.restore({users:[{canonicalId:'legacy',aliases:['legacy'],nickname:'已改名',ip:'192.0.2.2'}],userQueue:[{requestedBy:'legacy',nickname:'旧昵称',songId:'1',platform:'netease'}]});
 assert.equal(users.get('legacy').nickname,'已改名');assert.equal(state.userQueue[0].nickname,'已改名');
 state.restore({users:[{canonicalId:'unknown',aliases:[],nickname:'',ip:'192.0.2.3'}],userQueue:[]});assert.equal(users.list([])[0].nickname,'匿名');
 persistence.flush(()=>state.snapshotForDisk());
 })().catch(e=>{console.error(e);process.exitCode=1});`;
 try{const r=spawnSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,JUKEBOX_DATA_DIR:dir},encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
