'use strict';

function createUpdates(updater, version, changed) {
  let state = { status: 'idle', version, message: '从 GitHub Releases 检查更新。', notes: '' };
  const set = values => { state = { ...state, ...values }; changed(); };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('checking-for-update', () => set({ status: 'checking', message: '正在检查更新…' }));
  updater.on('update-available', info => set({ status: 'available', latest: info.version, message: '发现新版本 ' + info.version,
    notes: String(Array.isArray(info.releaseNotes) ? info.releaseNotes.map(note => note.note).join('\n') : info.releaseNotes || '').replace(/<[^>]*>/g, '') }));
  updater.on('update-not-available', () => set({ status: 'current', message: '当前已是最新版本。', notes: '', latest: '' }));
  updater.on('download-progress', progress => set({ status: 'downloading', message: '正在下载：' + Math.floor(progress.percent) + '%' }));
  updater.on('update-downloaded', () => set({ status: 'ready', message: '更新已下载并校验。请自行退出软件，退出后自动安装新版。' }));
  updater.on('error', () => set({ status: 'error', message: '更新失败，请检查网络或稍后重试。也可从 GitHub 下载新版安装包。' }));
  return {
    snapshot: () => state,
    async check() {
      if (['checking', 'downloading', 'ready'].includes(state.status)) return;
      set({ status: 'checking', message: '正在检查更新…' });
      try { await updater.checkForUpdates(); }
      catch (_) { set({ status: 'error', message: '无法检查更新，请检查网络或稍后重试。GitHub Release 需包含 latest.yml。' }); }
    },
    async download() {
      if (state.status !== 'available') return;
      set({ status: 'downloading', message: '正在下载更新…' });
      try { await updater.downloadUpdate(); }
      catch (_) { set({ status: 'error', message: '下载或校验失败，未安装更新。请重新检查后重试。' }); }
    }
  };
}
module.exports = { createUpdates };
