'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('events');
const {createUpdates} = require('../updates.cjs');
function fixture() {
 const updater=new EventEmitter();let checks=0,downloads=0;const installs=[];
 updater.checkForUpdates=async()=>{checks++;};
 updater.downloadUpdate=async()=>{downloads++;};
 updater.quitAndInstall=(...args)=>installs.push(args);
 const updates=createUpdates(updater,'1.0.11',()=>{});
 return {updater,updates,installs,checks:()=>checks,downloads:()=>downloads};
}
test('checks do not auto-download, downgrade or force quit',async()=>{
 const {updater,updates,installs,checks,downloads}=fixture();
 assert.equal(updater.autoDownload,false);assert.equal(updater.allowDowngrade,false);assert.equal(updater.autoInstallOnAppQuit,false);
 await updates.check();await updates.check();assert.equal(checks(),1);
 updater.emit('update-available',{version:'1.0.12',releaseNotes:'<b>修复</b>'});
 assert.equal(downloads(),0);assert.equal(updates.snapshot().notes,'修复');
 await updates.download();await updates.download();assert.equal(downloads(),1);
 updater.emit('download-progress',{percent:42.9});assert.match(updates.snapshot().message,/42%/);
 updater.emit('update-downloaded');assert.equal(updates.snapshot().status,'ready');
 await updates.check();assert.equal(checks(),1);
 assert.equal(installs.length,0);
 updates.installOnExit();updates.installOnExit();assert.deepEqual(installs,[[true,true]]);
});
test('failed check and failed verification leave update uninstalled and permit retry',async()=>{
 const {updater,updates}=fixture();updater.checkForUpdates=async()=>{throw Error('missing metadata');};
 await updates.check();assert.equal(updates.snapshot().status,'error');
 updater.checkForUpdates=async()=>updater.emit('update-available',{version:'1.0.12'});
 await updates.check();assert.equal(updates.snapshot().status,'available');
 updater.downloadUpdate=async()=>{throw Error('hash mismatch');};
 await updates.download();assert.equal(updates.snapshot().status,'error');
 updater.checkForUpdates=async()=>updater.emit('update-not-available');
 await updates.check();assert.equal(updates.snapshot().status,'current');
});

test('automatic update opens progress before download and saves before installation',async()=>{
 const updater=new EventEmitter(),order=[];
 updater.downloadUpdate=async()=>{order.push('download');updater.emit('update-downloaded');};
 updater.quitAndInstall=()=>order.push('install');
 let updates;
 updates=createUpdates(updater,'1.0.14',()=>{}, {open:async()=>order.push('window'),ready:async()=>{order.push('save');updates.installOnExit();}});
 updater.emit('update-available',{version:'1.0.15'});
 await updates.download();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(order,['window','download','save','install']);
 assert.equal(updates.snapshot().status,'installing');
});

test('progress window failure prevents downloading or installing',async()=>{
 const updater=new EventEmitter();let downloads=0;
 updater.downloadUpdate=async()=>downloads++;
 const updates=createUpdates(updater,'1.0.14',()=>{}, {open:async()=>{throw Error('window failed');}});
 updater.emit('update-available',{version:'1.0.15'});
 await updates.download();assert.equal(downloads,0);assert.equal(updates.snapshot().status,'error');
});
