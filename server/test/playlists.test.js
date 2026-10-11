const test = require('node:test');
const assert = require('node:assert/strict');
const {playlistId} = require('../playlist-input');
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
test('playlist IDs, full links and copied share text resolve without looking up IDs',async()=>{
 for(const input of ['3778678','https://music.163.com/playlist?id=3778678','https://music.163.com/#/playlist?id=3778678','分享歌单：https://music.163.com/m/playlist?id=3778678&userid=123'])assert.equal(await playlistId(input),3778678);
});
test('short links are resolved only through approved music hosts',async()=>{
 let calls=0;
 assert.equal(await playlistId('分享：https://163cn.tv/fixture',async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return {status:302,headers:new Headers({location:'https://music.163.com/playlist?id=3778678'})};}),3778678);
 assert.equal(calls,1);
 await assert.rejects(playlistId('https://163cn.tv/fixture',async()=>({status:302,headers:new Headers({location:'http://127.0.0.1/private'})})),/无法识别/);
});
test('invalid IDs and unrelated URLs cannot add a playlist',async()=>{
 for(const input of ['0','-1','1.2','9007199254740992','https://music.163.com/song?id=123','https://evil.example/playlist?id=123','https://music.163.com.evil.example/playlist?id=123'])await assert.rejects(playlistId(input));
});
test('default hot chart replaces zero configuration and preserves chosen playlist',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jukebox-playlist-'));
 try{for(const [id,expected] of [[0,3778678],[12345,12345]]){
 fs.mkdirSync(path.join(dir,'server'),{recursive:true});fs.writeFileSync(path.join(dir,'server/config.local.js'),'module.exports={playlistId:'+id+'};');
 const result=spawnSync(process.execPath,['-e',"console.log(require('./server/config').playlistId)"],{cwd:path.join(__dirname,'../..'),env:{...process.env,JUKEBOX_DATA_DIR:dir},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(Number(result.stdout.trim()),expected);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('playlist search uses public playlist endpoint and returns selectable entries',async()=>{
 const original=global.fetch;
 try{global.fetch=async(url,options)=>{assert.equal(new URL(url).searchParams.get('type'),'1000');assert.deepEqual(options.headers,{});return {ok:true,json:async()=>({code:200,result:{playlists:[{id:123,name:'fixture',creator:{nickname:'creator'},trackCount:15}]}})};};
 assert.deepEqual(await require('../netease').searchPlaylists('fixture'),[{id:123,name:'fixture',creator:'creator',count:15}]);
 }finally{global.fetch=original;}
});
