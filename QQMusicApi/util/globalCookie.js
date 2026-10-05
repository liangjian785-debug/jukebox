/**
 * 全局 Cookie 管理（读写 QQMusicApi/data/*.json）
 *
 * 修复历史故障根因：
 *  1. 原实现使用了未声明的 jsonFile（未 require）→ 抛 ReferenceError 被 catch 吞掉
 *     → userCookie 永远为空 → QQ 播放链接接口 400，只能靠 /user/setCookie 热更新救回
 *  2. 原实现用相对路径 'data/cookie.json'，依赖进程 cwd
 *  3. 原实现只在模块加载时读一次，之后文件被改也不重载
 *
 * 现实现：绝对路径 + 按 mtime 自动重载，管理台/外部改写 cookie.json 后立即生效。
 */
const path = require('path');
const fs = require('fs');
const jsonFile = require('jsonfile');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

/** 文件型 JSON 存储：带 mtime 缓存，文件一变就重载 */
function makeStore(file) {
  let cache = {};
  let mtime = -1;

  return {
    read() {
      try {
        const st = fs.statSync(file);
        if (st.mtimeMs !== mtime) {
          cache = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
          mtime = st.mtimeMs;
        }
      } catch (err) {
        // 文件不存在或损坏：保留上次可用值（避免 cookie 突然清空导致播放中断）
      }
      return cache;
    },
    write(v) {
      const next = v || {};
      fs.mkdirSync(path.dirname(file), {recursive: true});
      jsonFile.writeFileSync(file, next, {spaces: 2});
      cache = next;
      mtime = fs.statSync(file).mtimeMs;
    },
  };
}

module.exports = (dataDir = DEFAULT_DATA_DIR) => {
  const ALL_COOKIES_FILE = path.join(dataDir, 'allCookies.json');
  const USER_COOKIE_FILE = path.join(dataDir, 'cookie.json');
  const allStore = makeStore(ALL_COOKIES_FILE);
  const userStore = makeStore(USER_COOKIE_FILE);

  return {
    allCookies: () => allStore.read(),
    userCookie: () => userStore.read(),
    updateAllCookies: (v) => allStore.write(v),
    updateUserCookie: (v) => userStore.write(v),
    files: { all: ALL_COOKIES_FILE, user: USER_COOKIE_FILE }, // 便于排查
  };
};
