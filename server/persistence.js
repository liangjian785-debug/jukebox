/**
 * 状态持久化：队列/用户/播放源 落盘到 server/state.json（已入 .gitignore）
 * 保存：状态变更后 1 秒防抖写盘；进程退出时强制写盘
 * 恢复：启动时 load()，失败返回 null（不阻塞启动）
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'state.json');
let timer = null;

function save(getData) {
  try {
    const data = getData();
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE); // 先写临时文件再替换，避免写一半损坏
  } catch (e) {
    console.log('[持久化] 保存失败: ' + e.message);
  }
}

/** 防抖调度保存 */
function schedule(getData) {
  clearTimeout(timer);
  timer = setTimeout(() => save(getData), 1000);
}

/** 立即保存（进程退出时调用） */
function flush(getData) {
  clearTimeout(timer);
  save(getData);
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = { schedule, flush, load };
