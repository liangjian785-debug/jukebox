/**
 * 平台渠道开关（网易云 / QQ音乐）
 * 持久化：server/channels.json（已入 .gitignore）
 * 关闭渠道后：搜索/点歌/榜单对该平台禁用，用户端显示"维护中"
 */
const fs = require('fs');
const path = require('path');

const FILE = require('./paths').channelsPath;
const DEFAULTS = { netease: true, qq: true };

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { netease: data.netease !== false, qq: data.qq !== false };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function save(channels) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(channels, null, 2));
  } catch (e) {
    /* ignore */
  }
}

function set(platform, enabled) {
  const ch = load();
  if (platform === 'qq') ch.qq = !!enabled;
  else ch.netease = !!enabled;
  save(ch);
  return ch;
}

module.exports = { load, save, set, DEFAULTS };
