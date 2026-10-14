const validId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

async function playlistId(input, request = fetch) {
  const text = String(input || '').trim();
  if (validId(text)) return validId(text);
  const match = text.match(/https?:\/\/(?:music\.163\.com|163cn\.tv)\/[^\s<>]+/i);
  if (!match) throw new Error('请输入网易云歌单链接或有效歌单 ID');
  let url = new URL(match[0]);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!['music.163.com', '163cn.tv'].includes(url.hostname) || !['https:', 'http:'].includes(url.protocol)) break;
    if (url.hostname === 'music.163.com') {
      const page = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin) : url;
      if (/(^|\/)playlist(?:\/|$)/.test(page.pathname)) {
        const id = validId(page.searchParams.get('id'));
        if (id) return id;
      }
      break;
    }
    const response = await request(url.href, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
    url = new URL(location, url);
  }
  throw new Error('无法识别歌单链接，请粘贴完整网易云歌单链接或按名称搜索');
}
module.exports = { playlistId };

async function qqPlaylistId(input, request = fetch) {
  const text = String(input || '').trim();
  if (validId(text)) return validId(text);
  const match = text.match(/https?:\/\/(?:y\.qq\.com|i2\.y\.qq\.com|c6\.y\.qq\.com)\/[^\s<>]+/i);
  if (!match) throw new Error('请输入 QQ 音乐歌单链接或有效歌单 ID');
  let url = new URL(match[0]);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!['y.qq.com', 'i2.y.qq.com', 'c6.y.qq.com'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) break;
    if (['y.qq.com', 'i2.y.qq.com'].includes(url.hostname) && url.pathname === '/n3/other/pages/details/playlist.html') {
      const id = validId(url.searchParams.get('id'));
      if (id) return id;
    }
    const pathId = url.pathname.match(/^\/n\/(?:ryqq|ryqq_v2)\/playlist\/(\d+)\/?$/);
    if (url.hostname === 'y.qq.com' && pathId && validId(pathId[1])) return validId(pathId[1]);
    if (url.hostname === 'y.qq.com' && /(?:taoge|playsquare)/.test(url.pathname)) {
      const id = validId(url.searchParams.get('id') || url.searchParams.get('disstid'));
      if (id) return id;
    }
    if (url.hostname !== 'c6.y.qq.com' || url.pathname !== '/base/fcgi-bin/u') break;
    const response = await request(url.href, {redirect:'manual', signal:AbortSignal.timeout(5000)});
    const location = response.headers.get('location');
    if (![301,302,303,307,308].includes(response.status) || !location) break;
    url = new URL(location, url);
  }
  throw new Error('无法识别 QQ 歌单链接，请粘贴完整歌单链接或按名称搜索');
}
module.exports.qqPlaylistId = qqPlaylistId;
