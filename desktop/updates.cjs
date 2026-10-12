'use strict';

function createUpdates(updater, version, changed, options = {}) {
  let state = { status: 'idle', version, message: '从 GitHub Releases 检查更新。', notes: '' };
  const set = values => { state = { ...state, ...values }; changed(); };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.autoRunAppAfterInstall = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('checking-for-update', () => set({ status: 'checking', message: '正在检查更新…' }));
  updater.on('update-available', info => set({ status: 'available', latest: info.version, message: '发现新版本 ' + info.version,
    notes: String(Array.isArray(info.releaseNotes) ? info.releaseNotes.map(note => note.note).join('\n') : info.releaseNotes || '').replace(/<[^>]*>/g, '') }));
  updater.on('update-not-available', () => set({ status: 'current', message: '当前已是最新版本。', notes: '', latest: '' }));
  updater.on('download-progress', progress => set({ status: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)), message: '正在下载：' + Math.floor(progress.percent) + '%' }));
  updater.on('update-downloaded', () => {
    set({ status: 'ready', percent: 100, message: '下载已校验，正在保存数据并准备安装…' });
    Promise.resolve().then(() => options.ready?.()).catch(() => set({ status: 'error', message: '未能完成更新准备，当前版本尚未替换。请稍后重试。' }));
  });
  updater.on('error', () => set({ status: 'error', message: '更新失败，请检查网络或稍后重试。也可从 GitHub 下载新版安装包。' }));
  return {
    snapshot: () => state,
    fail() { set({ status: 'error', message: '更新准备失败，当前版本尚未替换。请稍后重试。' }); },
    installOnExit() {
      if (state.status !== 'ready') return;
      set({ status: 'installing', message: '正在安装更新，完成后自动启动…' });
      updater.quitAndInstall(true, true);
    },
    async check() {
      if (['checking', 'downloading', 'ready', 'installing'].includes(state.status)) return;
      set({ status: 'checking', message: '正在检查更新…' });
      try { await updater.checkForUpdates(); }
      catch (_) { set({ status: 'error', message: '无法检查更新，请检查网络或稍后重试。GitHub Release 需包含 latest.yml。' }); }
    },
    async download() {
      if (state.status !== 'available') return;
      set({ status: 'downloading', percent: 0, message: '正在下载更新…' });
      try { await options.open?.(); await updater.downloadUpdate(); }
      catch (_) { set({ status: 'error', message: '下载或校验失败，未安装更新。请重新检查后重试。' }); }
    }
  };
}
module.exports = { createUpdates };
