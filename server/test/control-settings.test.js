const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('control settings validate, persist atomically and immediately enforce shared limits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-controls-'));
  fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'server/config.local.js'), "module.exports={adminKey:'fixture-admin',neteaseCookie:'fixture-cookie',volume:37,maxPerUser:10};\n// retained comment\n");
  const code = `
    const assert=require('node:assert/strict'),fs=require('node:fs');
    const config=require('./server/config'),state=require('./server/state'),users=require('./server/users');
    const cfg=require('./server/paths').configPath;
    const router=require('./server/routes')({emit(){}},{},()=>{},{});
    const route=router.stack.find(l=>l.route?.path==='/admin/control-settings').route;
    const post=(body,key='fixture-admin')=>{
      let status=200,data;const req={body,get:()=>key},res={status(n){status=n;return this},json(v){data=v;return this}};
      route.stack[0].handle(req,res,()=>route.stack[1].handle(req,res));return {status,data};
    };
    const valid={maxPerUser:2,maxUserQueue:10,autoStart:false,loudnessNormalization:true};
    const original=fs.readFileSync(cfg,'utf8');
    assert.equal(post(valid,'bad').status,401);assert.equal(fs.readFileSync(cfg,'utf8'),original);
    for(const bad of [{maxPerUser:0},{maxPerUser:1.5},{maxPerUser:'2'},{maxPerUser:301},{maxUserQueue:3001},{maxUserQueue:-1},{autoStart:'false'},{loudnessNormalization:null},{adminKey:'replacement'}]){
      assert.equal(post({...valid,...bad}).status,400);assert.equal(fs.readFileSync(cfg,'utf8'),original);
    }
    assert.equal(post(valid).status,200);assert.equal(config.maxPerUser,2);
    delete require.cache[cfg];let saved=require(cfg);assert.equal(saved.maxUserQueue,10);assert.equal(saved.adminKey,'fixture-admin');assert.equal(saved.neteaseCookie,'fixture-cookie');assert.equal(saved.volume,37);
    assert.ok(fs.readFileSync(cfg,'utf8').includes('// retained comment'));
    users.touch('a','192.0.2.1','A');users.touch('b','192.0.2.1','A');users.touch('c','192.0.2.2','C');
    state.userQueue=[];
    const add=(id,user)=>state.addUserSong({platform:'netease',songId:id,requestedBy:user,name:'Fixture',artists:[]},users.canonicalOf(user));
    assert.equal(add('1','a').ok,true);assert.equal(add('2','b').ok,true);assert.equal(add('3','a').ok,false);
    assert.equal(add('4','c').ok,true);
    assert.equal(post({...valid,maxUserQueue:1,autoStart:true,loudnessNormalization:false}).status,200);
    assert.equal(state.userQueue.length,3,'Lowering limits must not discard existing songs');
    assert.equal(add('5','c').ok,false);
    assert.deepEqual(state.snapshot().queueLimits,{maxPerUser:2,maxUserQueue:1});
    delete require.cache[cfg];saved=require(cfg);assert.equal(saved.autoStart,true);assert.equal(saved.loudnessNormalization,false);
    assert.equal(fs.readFileSync(cfg,'utf8').split('BEGIN JUKEBOX_ADMIN_SETTINGS').length-1,1);
    const savedSource=fs.readFileSync(cfg,'utf8'),rename=fs.renameSync;
    fs.renameSync=()=>{throw Error('fixture permission failure')};
    assert.equal(post({...valid,maxPerUser:20}).status,500);fs.renameSync=rename;
    assert.equal(config.maxPerUser,2);assert.equal(fs.readFileSync(cfg,'utf8'),savedSource);
    assert.equal(state.userQueue.length,3);
  `;
  try {
    const result = spawnSync(process.execPath, ['-e', code], { cwd:path.resolve(__dirname,'../..'), env:{...process.env,JUKEBOX_DATA_DIR:dir}, encoding:'utf8',timeout:15000 });
    assert.equal(result.status,0,result.stderr);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
