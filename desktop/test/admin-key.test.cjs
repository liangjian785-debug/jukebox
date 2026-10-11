'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { changedConfig } = require('../admin-key.cjs');
const source = 'module.exports = { adminKey: "original-password", volume: 80, neteaseCookie: "fixture-only", playlistId: 123 };';
test('incorrect original password and invalid new password leave config unchanged', () => {
  assert.throws(() => changedConfig(source, 'incorrect', 'new-password'), /原管理口令错误/);
  assert.throws(() => changedConfig(source, 'original-password', 'short'), /8–128/);
});
test('password change preserves other configuration and literal special characters', () => {
  for (const key of ['new-password$&', "new-password$'", 'new-password$`', '新口令中文字符😀', 'new-password"\\']) {
    const result = changedConfig(source, 'original-password', key);
    const module = { exports: {} }; vm.runInNewContext(result, { module });
    assert.equal(module.exports.adminKey, key);
    assert.equal(module.exports.volume, 80); assert.equal(module.exports.neteaseCookie, 'fixture-only'); assert.equal(module.exports.playlistId, 123);
    assert.equal(changedConfig(result, key, 'another-password').includes('another-password'), true);
  }
});
