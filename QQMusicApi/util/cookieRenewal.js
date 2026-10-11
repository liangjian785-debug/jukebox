'use strict';

module.exports = function cookieRenewal({ globalCookie, url, request = fetch, report = console.log }) {
  let busy = false;
  let stopped = false;
  let controller;
  async function refresh() {
    if (busy || stopped) return;
    const cookie = { ...globalCookie.userCookie() };
    if (!cookie.uin || !(cookie.qm_keyst || cookie.qqmusic_key) || Number(cookie.login_type) === 2 || (!cookie.psrf_qqopenid && cookie.wxopenid)) return;
    busy = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await request(url(), {
        headers: { Cookie: Object.entries(cookie).map(([name, value]) => name + '=' + value).join('; ') },
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.result !== 100 || typeof result.data?.musickey !== 'string' || !result.data.musickey) throw new Error('刷新失败');
      if (stopped || JSON.stringify(globalCookie.userCookie()) !== JSON.stringify(cookie)) return;
      const renewed = { ...cookie, qm_keyst: result.data.musickey, qqmusic_key: result.data.musickey };
      const all = { ...globalCookie.allCookies(), [cookie.uin]: renewed };
      globalCookie.updateAllCookies(all);
      globalCookie.updateUserCookie(renewed);
      report('QQ音乐登录自动续期成功，新密钥已保存。');
    } catch (_) {
      if (!stopped) report('QQ音乐登录自动续期未成功，保留原 Cookie；不影响当前登录状态。');
    } finally {
      clearTimeout(timeout);
      busy = false;
    }
  }
  const startup = setTimeout(refresh, 1000);
  const interval = setInterval(refresh, 4 * 60 * 60 * 1000);
  startup.unref();
  interval.unref();
  return { refresh, stop() { stopped = true; clearTimeout(startup); clearInterval(interval); controller?.abort(); } };
};
