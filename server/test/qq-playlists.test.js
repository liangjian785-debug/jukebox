const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {qqPlaylistId}=require('../playlist-input');
test('QQ full/share links support only playlist URLs and approved redirect targets',async()=>{
 for(const input of ['123','https://y.qq.com/n/ryqq/playlist/123','https://y.qq.com/n/ryqq_v2/playlist/123','分享 https://y.qq.com/n/m/detail/taoge/index.html?id=123'])assert.equal(await qqPlaylistId(input),123);
 assert.equal(await qqPlaylistId('https://c6.y.qq.com/base/fcgi-bin/u?x=1',async()=>({status:302,headers:new Headers({location:'https://y.qq.com/n/ryqq/playlist/123'})})),123);
 for(const input of ['0','https://y.qq.com/n/ryqq/songDetail/123','https://y.qq.com.evil.example/n/ryqq/playlist/123'])await assert.rejects(qqPlaylistId(input));
 await assert.rejects(qqPlaylistId('https://c6.y.qq.com/base/fcgi-bin/u?x=1',async()=>({status:302,headers:new Headers({location:'http://127.0.0.1/private'})})));
});
test('QQ preset lifecycle keeps platform IDs independent and preserves pause',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jukebox-qq-presets-'));
 try{
 fs.mkdirSync(path.join(dir,'server'));fs.writeFileSync(path.join(dir,'server','presets.json'),JSON.stringify([{id:123,name:'Legacy'}]));fs.writeFileSync(path.join(dir,'server','config.local.js'),'module.exports={playlistId:123,adminKey:"preserved-fixture"};');
 const code=`(async()=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 const config=require('./server/config'),state=require('./server/state'),qq=require('./server/qq'),netease=require('./server/netease');
 const fixture=id=>({id,name:'Fixture '+id,songs:[{songId:'song',platform:'qq'}]});qq.getPlaylist=async id=>fixture(id);qq.getChart=async()=>({...fixture(0),name:'QQ热歌榜'});netease.getPlaylistCached=async id=>fixture(id);
 config.adminKey='fixture';let calls=0;const router=require('./server/routes')({emit(){}},{isPlaying:()=>true,manualPaused:true},()=>calls++,{});
 const invoke=async(method,url,body={},query={})=>{const route=router.stack.find(l=>l.route&&l.route.path===url&&l.route.methods[method]).route;let output,status=200;const req={body,query,params:{playlistId:'123'},get:()=> 'fixture'};const res={status(n){status=n;return this},json(v){output=v;return this}};await route.stack.at(-1).handle(req,res);assert.equal(status,200);return output};
 await invoke('post','/admin/presets',{platform:'qq',playlistId:123});let presets=await invoke('get','/admin/presets');assert.equal(presets.presets.length,2);assert.equal(presets.presets[0].platform,'netease');
 await invoke('post','/admin/playlist',{platform:'qq',playlistId:123});assert.equal(config.playlistId,123);assert.equal(config.qqPlaylistId,123);assert.equal(state.playSource,'qq-playlist');assert.equal(calls,0);
 await invoke('post','/admin/playlist',{platform:'qq',playlistId:0});assert.equal(config.qqPlaylistId,0);assert.equal(state.playlist.name,'QQ热歌榜');const persisted=require('./server/paths').configPath;delete require.cache[persisted];assert.equal(require(persisted).qqPlaylistId,0);assert.equal(require(persisted).adminKey,"preserved-fixture");
 assert.equal(fs.readFileSync(persisted,'utf8').split('module.exports.qqPlaylistId').length-1,1);
 await invoke('delete','/admin/presets/:playlistId',{}, {platform:'qq'});presets=await invoke('get','/admin/presets');assert.equal(presets.presets.length,1);assert.equal(presets.presets[0].platform,'netease');
 })().catch(e=>{console.error(e);process.exitCode=1});`;
 const result=spawnSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,JUKEBOX_DATA_DIR:dir},encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('QQ bundled search selects playlist section and propagates upstream failure',async()=>{
 const handler=require('../../QQMusicApi/routes/search')['/'];let output;
 const context={req:{query:{key:'fixture',t:2}},res:{send(v){output=v;return v}},cache:{get(){},set(){}},request:async options=>{assert.equal(JSON.parse(options.data.data).req_0.param.search_type,3);return ({req_0:{code:0,data:{body:{song:{list:[{wrong:true}]},songlist:{list:[{dissid:123,dissname:'Fixture'}],totalnum:1}}}}});}};
 await handler(context);assert.equal(output.data.list[0].dissid,123);
 context.request=async()=>({req_0:{code:100}});await handler(context);assert.equal(output.result,400);
 const original=global.fetch;try{global.fetch=async()=>({ok:true,json:async()=>({result:100,data:{list:[{dissid:'123',dissname:'Fixture',creator:{name:'Creator'},song_count:8}]}})});assert.deepEqual(await require('../qq').searchPlaylists('fixture'),[{id:123,name:'Fixture',creator:'Creator',count:8,platform:'qq'}]);}finally{global.fetch=original;}
});
