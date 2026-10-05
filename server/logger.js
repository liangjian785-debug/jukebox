/**
 * 系统日志模块
 *  - 落盘：server/logs/system.log（JSON Lines，每行一条）
 *  - 内存即时清理：保留最近 72 小时（启动时 + 每小时自动清理）
 *  - 提供 readRecent() 供管理端查看
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'system.log');
const MAX_AGE_MS = 72 * 3600 * 1000; // 72 小时

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 写一条日志：level = info | warn | error | action
 * details 用于保存可检索的操作字段；旧调用不传该参数时保持原格式。
 */
function log(level, msg, cat = 'system', details = null) {
  const entry = { ts: Date.now(), t: new Date().toISOString(), level, cat, msg };
  if (details && typeof details === 'object') entry.details = details;
  try {
    ensureDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    /* 日志写失败不影响主流程 */
  }
  const prefix = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}][${cat}]`;
  if (level === 'error') console.error(prefix, msg);
  else console.log(prefix, msg);
  return entry;
}

/** 读取最近 N 条（最新在前） */
function readRecent(limit = 100) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const arr = lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return arr.reverse(); // 最新在前
  } catch {
    return [];
  }
}

/** 清理 72 小时前的日志（启动时 + 每小时调用） */
function cleanup() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const now = Date.now();
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const keep = lines.filter((l) => {
      try {
        const e = JSON.parse(l);
        return now - e.ts < MAX_AGE_MS;
      } catch {
        return false;
      }
    });
    if (keep.length < lines.length) {
      fs.writeFileSync(LOG_FILE, keep.join('\n') + (keep.length ? '\n' : ''));
      console.log(`[日志] 已清理过期日志：保留 ${keep.length} 条（72h 内）`);
    }
  } catch (e) {
    /* ignore */
  }
}

// 启动清理 + 每小时自动清理
cleanup();
setInterval(cleanup, 3600 * 1000).unref();

module.exports = { log, readRecent, cleanup };
