const test = require('node:test');
const assert = require('node:assert/strict');
const renewal = require('../util/cookieRenewal');
function fixture(request) {
  let cookie = {uin:'123',qqmusic_key:'old',qm_keyst:'old',extra:'preserved'}; let all = {};
  const store = {userCookie:()=>cookie,allCookies:()=>all,updateUserCookie:v=>{cookie=v;},updateAllCookies:v=>{all=v;}};
  const service = renewal({globalCookie:store,url:()=> 'http://127.0.0.1:3400/user/refresh',request,report() {}});
  return {store,service};
}
test('renewal saves both keys and preserves other fields', async()=>{
 const {store,service}=fixture(async()=>({ok:true,json:async()=>({result:100,data:{musickey:'new'}})}));
 store.updateUserCookie({...store.userCookie(),tmeLoginType:'2',psrf_qqopenid:'qq-fixture',wxopenid:''});
 try {await service.refresh();assert.equal(store.userCookie().qqmusic_key,'new');assert.equal(store.userCookie().qm_keyst,'new');assert.equal(store.userCookie().extra,'preserved');assert.deepEqual(store.allCookies()['123'],store.userCookie());} finally {service.stop();}
});
test('failed renewal keeps original cookie',async()=>{
 for(const request of [async()=>({ok:true,json:async()=>({result:200})}),async()=>{throw Error('offline');}]) {
 const {store,service}=fixture(request);try{await service.refresh();assert.equal(store.userCookie().qqmusic_key,'old');assert.deepEqual(store.allCookies(),{});}finally{service.stop();}
 }
});
test('pending renewal cannot overwrite a new login or save after stop',async()=>{
 for(const stopped of [false,true]) {
 let finish,calls=0;const {store,service}=fixture(()=>{calls++;return new Promise(r=>{finish=r;});});
 const pending=service.refresh();await service.refresh();assert.equal(calls,1);
 if(stopped)service.stop();else store.updateUserCookie({uin:'456',qqmusic_key:'new-login'});
 finish({ok:true,json:async()=>({result:100,data:{musickey:'stale'}})});await pending;
 assert.equal(store.userCookie().qqmusic_key,stopped?'old':'new-login');service.stop();
 }
});
test('WeChat and unconfigured accounts are skipped',async()=>{
 const {store,service}=fixture(async()=>{throw Error('must not request');});
 try{store.updateUserCookie({});await service.refresh();store.updateUserCookie({uin:'123',qqmusic_key:'wx',login_type:'2'});await service.refresh();assert.equal(store.userCookie().qqmusic_key,'wx');}finally{service.stop();}
});
test('startup and four-hour schedule trigger renewal',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let calls=0;
 const {service}=fixture(async()=>{calls++;return {ok:true,json:async()=>({result:200})};});
 try{
 t.mock.timers.tick(999);assert.equal(calls,0);
 t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
 t.mock.timers.tick(4*60*60*1000-1000);await Promise.resolve();await Promise.resolve();assert.equal(calls,2);
 service.stop();t.mock.timers.tick(4*60*60*1000);assert.equal(calls,2);
 }finally{service.stop();t.mock.timers.reset();}
});
