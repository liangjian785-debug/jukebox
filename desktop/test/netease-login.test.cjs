'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { NeteaseLogin, cookieHeader } = require('../netease-login.cjs');
const cookies = [{ domain: '.music.163.com', name: 'MUSIC_U', value: 'fixture-token', httpOnly: true }, { domain: 'music.163.com', name: '__csrf', value: 'fixture-csrf' }, { domain: 'other.example', name: 'secret', value: 'unrelated' }];
function controller(verify, save) {
  const store = new EventEmitter(); store.get = async () => cookies; store.flushStore = async () => {};
  const login = new NeteaseLogin({ session: { cookies: store }, verify, save, report() {} });
  login.active = true; return login;
}
test('cookie capture includes HTTP-only login and excludes unrelated domains', () => {
  assert.equal(cookieHeader(cookies), 'MUSIC_U=fixture-token; __csrf=fixture-csrf');
  assert.equal(cookieHeader([{domain:'music.163.com',name:'__csrf',value:'fixture'}]), '');
});
test('verified login is saved once and observer stops', async () => {
  let saved = 0;
  const login = controller(async () => true, async header => { assert(header.includes('MUSIC_U=')); saved++; });
  await login.capture(); await login.capture(); assert.equal(saved, 1); assert.equal(login.active, false);
});
test('invalid login and failed verification do not overwrite existing credentials', async () => {
  let saved = false;
  for (const verify of [async () => false, async () => { throw new Error('offline'); }]) {
    const login = controller(verify, async () => { saved = true; }); await login.capture(); assert.equal(saved, false); login.stop();
  }
});
test('leaving login during verification cancels credential saving', async () => {
  let complete, saved = false;
  const login = controller(() => new Promise(resolve => { complete = resolve; }), async () => { saved = true; });
  const capture = login.capture(); await new Promise(resolve => setImmediate(resolve));
  login.stop(); complete(true); await capture; assert.equal(saved, false);
});

test('QQ capture requires a music key and normalizes QQ or WeChat identity', () => {
  const item = (name, value, domain = '.qq.com') => ({ name, value, domain });
  assert.equal(cookieHeader([item('uin', 'o00123')], 'qq'), '');
  assert.equal(cookieHeader([item('qqmusic_key', 'fixture')], 'qq'), '');
  const header = cookieHeader([item('uin', 'o00123'), item('qqmusic_key', 'fixture'), item('secret', 'excluded', 'other.example')], 'qq');
  assert(header.includes('uin=00123')); assert(!header.includes('secret'));
  assert(cookieHeader([item('login_type', '2'), item('wxuin', 'o456'), item('qm_keyst', 'fixture')], 'qq').includes('uin=456'));
});

test('verified refreshed QQ key is saved instead of the old key', async () => {
  const store = new EventEmitter();
  store.get = async () => [{ domain: '.qq.com', name: 'uin', value: '123' }, { domain: '.qq.com', name: 'qqmusic_key', value: 'old-fixture' }];
  store.flushStore = async () => {};
  let saved;
  const login = new NeteaseLogin({ platform: 'qq', session: { cookies: store }, verify: async () => 'uin=123; qqmusic_key=refreshed-fixture', save: async cookie => { saved = cookie; }, report() {} });
  login.active = true; await login.capture();
  assert.equal(saved, 'uin=123; qqmusic_key=refreshed-fixture'); assert.equal(login.active, false);
});

test('QQ capture reads cookies across paths and retries an incomplete login', async () => {
  const store = new EventEmitter(); let attempts = 0, saved = 0;
  store.get = async filter => {
    assert.deepEqual(filter, {});
    return ++attempts === 1 ? [] : [{ domain: '.qq.com', path: '/portal', name: 'uin', value: '123' }, { domain: '.qq.com', path: '/portal', name: 'qqmusic_key', value: 'fixture' }];
  };
  store.flushStore = async () => {};
  const login = new NeteaseLogin({ platform: 'qq', session: { cookies: store }, verify: async () => true, save: async () => { saved++; }, report() {} });
  login.active = true;
  await login.capture(); assert(login.timer); assert.equal(saved, 0);
  clearTimeout(login.timer); await login.capture();
  assert.equal(saved, 1); assert.equal(login.active, false);
});
