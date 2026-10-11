'use strict';
function cookieHeader(cookies, platform = 'netease') {
  if (platform === 'qq') {
    const fields = Object.fromEntries(cookies.filter(cookie => /(^|\.)qq\.com$/.test(cookie.domain)).map(cookie => [cookie.name, cookie.value]));
    const uin = String(Number(fields.login_type) === 2 ? fields.wxuin || '' : fields.uin || '').replace(/\D/g, '');
    if (!uin || !(fields.qqmusic_key || fields.qm_keyst)) return '';
    fields.uin = uin;
    return Object.entries(fields).map(([name, value]) => name + '=' + value).join('; ');
  }
  const matching = cookies.filter(cookie => ['163.com', 'music.163.com'].includes(cookie.domain.replace(/^\./, '')));
  if (!matching.some(cookie => cookie.name === 'MUSIC_U' && cookie.value)) return '';
  return matching.map(cookie => cookie.name + '=' + cookie.value).join('; ');
}
async function verifyQQLogin(cookie, request = fetch) {
  const response = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://y.qq.com/', Cookie: cookie },
    body: JSON.stringify({ comm: { ct: 24, cv: 0, format: 'json' }, req: { module: 'music.UserInfo.userInfoServer', method: 'GetLoginUserInfo', param: {} } }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('验证失败');
  const result = await response.json();
  return result.code === 0 && result.req?.code === 0 && !!result.req.data?.info ? cookie : false;
}
class NeteaseLogin {
  constructor({ session, verify, save, report, platform = 'netease' }) { Object.assign(this, { session, verify, save, report, platform }); this.changed = () => this.schedule(); }
  start() { this.active = true; this.session.cookies.on('changed', this.changed); this.schedule(); }
  stop() { this.active = false; clearTimeout(this.timer); this.session.cookies.removeListener('changed', this.changed); }
  schedule() { clearTimeout(this.timer); if (this.active) this.timer = setTimeout(() => this.capture(), 700); }
  async capture() {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      const cookie = cookieHeader(await this.session.cookies.get(this.platform === 'qq' ? {} : { url: 'https://music.163.com/' }), this.platform);
      if (!cookie) return;
      const account = await this.verify(cookie);
      if (!this.active) return;
      if (!account) { this.report('等待登录完成，或在页面中重新登录。'); return; }
      await this.session.cookies.flushStore();
      if (!this.active) return;
      await this.save(typeof account === 'string' ? account : cookie);
      if (this.active) { this.stop(); this.report('登录成功，账号信息已自动保存。', true); }
    } catch { if (this.active) this.report('登录信息暂未验证成功，请稍后点击重新检查。'); }
    finally { this.busy = false; if (this.active) { clearTimeout(this.timer); this.timer = setTimeout(() => this.capture(), 3000); } }
  }
}
module.exports = { NeteaseLogin, cookieHeader, verifyQQLogin };
