'use strict';
const vm = require('vm');
function changedConfig(source, oldKey, newKey) {
  if (typeof oldKey !== 'string' || typeof newKey !== 'string') throw new Error('请输入原口令和新口令');
  newKey = newKey.trim();
  if (newKey.length < 8 || newKey.length > 128) throw new Error('新口令需为 8–128 个字符');
  const module = { exports: {} };
  vm.runInNewContext(source, { module }, { timeout: 100 });
  if (module.exports.adminKey !== oldKey.trim()) throw new Error('原管理口令错误');
  const field = /\badminKey\s*:\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
  if (!field.test(source)) throw new Error('配置中未找到管理口令字段');
  return source.replace(field, () => 'adminKey: ' + JSON.stringify(newKey));
}
module.exports = { changedConfig };
