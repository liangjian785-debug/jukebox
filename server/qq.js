/**
 * QQ 音乐 provider（对接本地 QQMusicApi 服务，端口 3400）
 * 依赖：QQMusicApi 已部署并配置登录 cookie（data/cookie.json）
 */
const config = require('./config');

function api(path) {
  return `${config.qqApiBase}${path}`;
}

async function getJson(path, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(api(path), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`QQ API ${path} -> HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function mapItem(s) {
  return {
    platform: 'qq',
    songId: s.songmid || s.mid || '',
    name: s.songname || s.name || '',
    artists: ((s.singer && s.singer.map((x) => x.name)) || []).filter(Boolean),
    album: s.albumname || (s.album && s.album.name) || '',
    cover: s.albummid || (s.album && s.album.mid)
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid || s.album.mid}.jpg`
      : '',
    duration: s.interval || s.interval || 0,
  };
}

// 搜索缓存（与网易云同策略）
let searchCache = new Map();
async function search(keyword, limit = 30) {
  const key = `qq:${keyword}:${limit}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() < hit.expire) return hit.data;

  const json = await getJson(
    `/search?key=${encodeURIComponent(keyword)}&pageNo=1&pageSize=${limit}&t=0`
  );
  const list = (json.data && json.data.list) || [];
  const data = { songs: list.map(mapItem) };

  searchCache.set(key, { expire: Date.now() + config.searchCacheMs, data });
  if (searchCache.size > 500) searchCache.clear();
  return data;
}

/** 单曲详情（点歌校验 + 取展示信息） */
async function getSongDetail(songId) {
  const json = await getJson(`/song?songmid=${encodeURIComponent(songId)}`);
  const t = json.data && json.data.track_info;
  if (!t) throw new Error('QQ song not found');
  return mapItem({
    ...t,
    songmid: t.mid,
    singer: t.singer,
    albummid: t.album && t.album.mid,
    albumname: t.album && t.album.name,
  });
}

/** 实时取音源 URL（320k；失败回退 128k） */
async function getSongUrl(songId) {
  for (const type of ['320', '128']) {
    try {
      const json = await getJson(`/song/url?id=${encodeURIComponent(songId)}&type=${type}`);
      const u = json.data;
      if (typeof u === 'string' && u.startsWith('http')) {
        return { url: u, freeTrial: false, br: type === '320' ? 320000 : 128000 };
      }
    } catch (e) {
      /* 尝试下一档 */
    }
  }
  return null;
}

// 榜单缓存（30 分钟）
let chartCache = new Map();
/** QQ 排行榜（topId 见 QQMusicApi /top/category） */
async function getChart(topId, limit = 30) {
  const key = `qqchart:${topId}:${limit}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() < hit.expire) return hit.data;

  const json = await getJson(`/top?id=${topId}&pageNo=1&pageSize=${limit}`);
  const list = (json.data && json.data.list) || [];
  const data = { name: (json.data && json.data.info && json.data.info.title) || '榜单', songs: list.map(mapItem) };

  chartCache.set(key, { expire: Date.now() + config.searchCacheMs, data });
  if (chartCache.size > 200) chartCache.clear();
  return data;
}

module.exports = { search, getSongDetail, getSongUrl, getChart };
