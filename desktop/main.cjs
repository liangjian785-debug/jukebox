'use strict';
const { app, BrowserWindow, WebContentsView, Tray, Menu, ipcMain, shell, utilityProcess, nativeImage, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const os = require('os');
const { Services, validateMainPort } = require('./services.cjs');
const { changedConfig } = require('./admin-key.cjs');
app.setName('JukeboxDesktop');
app.setPath('userData', path.join(app.getPath('appData'), 'JukeboxDesktop'));
const stateFile = path.join(__dirname, 'ui', 'index.html');
const stateURL = pathToFileURL(stateFile).href;
let statusWindow, musicView, tray, manager, activePage = 'home', exiting = false, allowExit = false, closeNotice = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showStatus());
  app.whenReady().then(initialize);
}
function showStatus() { if (statusWindow) { statusWindow.show(); statusWindow.focus(); } }
function controlled(window, allowed) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  window.on('close', event => { if (!exiting) { event.preventDefault(); window.hide(); if (!closeNotice) { closeNotice = true; tray.displayBalloon({ title: '局域网点歌机', content: '服务继续在后台运行；请从托盘菜单退出。' }); } } });
}
function addresses() {
  return Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => 'http://' + item.address + ':' + manager.ports.main);
}
function snapshot() { return { ...manager.snapshot(), page: activePage, needsSetup: !fs.existsSync(path.join(manager.dataDir, 'server', 'config.local.js')), addresses: addresses() }; }
function broadcast() {
  if (manager.state !== 'running') { activePage = 'home'; musicView?.setVisible(false); }
  statusWindow?.webContents.send('desktop:state', snapshot());
}
function resizeMusicView() {
  if (!musicView) return;
  const [width, height] = statusWindow.getContentSize();
  musicView.setBounds({ x: 0, y: 104, width, height: Math.max(0, height - 104) });
}
function authorized(event) { return event.sender === statusWindow?.webContents && event.senderFrame === statusWindow.webContents.mainFrame && event.senderFrame.url === stateURL; }
function handler(name, operation) { ipcMain.handle('desktop:' + name, async (event, ...args) => { if (!authorized(event)) throw new Error('未经授权的页面'); return operation(...args); }); }
async function initialize() {
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  const settingsPath = path.join(dataDir, 'desktop-settings.json');
  const mainPort = fs.existsSync(settingsPath) ? validateMainPort(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).mainPort) : 8080;
  for (const name of ['server', 'qq/record', 'netease', 'logs']) fs.mkdirSync(path.join(dataDir, name), { recursive: true });
  const runtimeDir = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, 'staging', 'runtime');
  const mpvPath = app.isPackaged ? path.join(process.resourcesPath, 'mpv', 'mpv.exe') : path.join(__dirname, 'vendor', 'mpv', 'mpv.exe');
  manager = new Services({ utilityProcess, runtimeDir, dataDir, mpvPath, ports: { main: mainPort, qq: 3400, netease: 4000 } });
  manager.on('state', state => {
    // Protocol state only: upstream stdout, requests, cookies and signed URLs are excluded.
    const entry = JSON.stringify({ time: new Date().toISOString(), state: state.state, services: state.services });
    const log = path.join(dataDir, 'logs', 'desktop.log');
    try { if (fs.existsSync(log) && fs.statSync(log).size > 1024 * 1024) fs.renameSync(log, log + '.previous'); fs.appendFileSync(log, entry + '\n'); } catch {}
    broadcast();
  });
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon); tray.setToolTip('局域网点歌机'); tray.on('double-click', showStatus);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开窗口', click: showStatus }, { label: '重启全部服务', click: () => run(() => manager.restart()) }, { type: 'separator' }, { label: '退出', click: quit }]));
  statusWindow = new BrowserWindow({ width: 1100, height: 800, minWidth: 800, minHeight: 600, title: '局域网点歌机', icon, titleBarStyle: 'hidden', titleBarOverlay: { color: '#14251f', symbolColor: '#e8f1ee', height: 40 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  statusWindow.on('resize', resizeMusicView);
  controlled(statusWindow, url => url === stateURL);
  statusWindow.loadFile(stateFile);
  handler('state', snapshot);
  handler('quit', quit);
  handler('password', (oldKey, newKey) => manager.enqueue(async () => {
    const configPath = path.join(dataDir, 'server', 'config.local.js');
    const config = changedConfig(fs.readFileSync(configPath, 'utf8'), oldKey, newKey);
    const wasRunning = manager.state === 'running';
    if (wasRunning) { await manager.stopChild('main'); manager.changed('main-stopped'); }
    try {
      fs.writeFileSync(configPath + '.tmp', config, { mode: 0o600 });
      fs.renameSync(configPath + '.tmp', configPath);
    } finally {
      fs.rmSync(configPath + '.tmp', { force: true });
      if (wasRunning) await manager.startInternal(true);
    }
    return snapshot();
  }));
  handler('port', async port => {
    await manager.configureMainPort(port, mainPort => fs.writeFileSync(settingsPath, JSON.stringify({ mainPort }), { mode: 0o600 }), !snapshot().needsSetup);
    return snapshot();
  });
  handler('setup', async key => {
    if (typeof key !== 'string') throw new Error('口令需为 8–128 个字符');
    key = key.trim();
    if (key.length < 8 || key.length > 128) throw new Error('口令需为 8–128 个字符');
    const template = fs.readFileSync(path.join(runtimeDir, 'server', 'config.local.example.js'), 'utf8');
    if (!/adminKey:\s*''/.test(template)) throw new Error('干净配置模板缺少口令字段');
    const config = template.replace(/adminKey:\s*''/, () => 'adminKey: ' + JSON.stringify(key));
    fs.writeFileSync(path.join(dataDir, 'server', 'config.local.js'), config, { flag: 'wx', mode: 0o600 });
    await run(() => manager.start()); return snapshot();
  });
  handler('restart', () => run(() => manager.restart()));
  handler('resume', () => run(() => manager.resumeMain()));
  handler('open', async page => {
    if (page === 'home') { activePage = 'home'; musicView?.setVisible(false); broadcast(); return snapshot(); }
    if (manager.state !== 'running' || !['song', 'admin'].includes(page)) throw new Error('服务尚未就绪');
    const base = 'http://127.0.0.1:' + manager.ports.main;
    if (!musicView) {
      musicView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      musicView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      musicView.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== 'http://127.0.0.1:' + manager.ports.main) event.preventDefault(); });
      statusWindow.contentView.addChildView(musicView);
    }
    activePage = 'home'; broadcast();
    musicView.setVisible(false);
    await musicView.webContents.loadURL(base + (page === 'admin' ? '/admin.html' : '/'));
    if (manager.state !== 'running') return snapshot();
    activePage = page; resizeMusicView(); musicView.setVisible(true); broadcast(); return snapshot();
  });
  handler('copy', () => { require('electron').clipboard.writeText(addresses()[0] || 'http://127.0.0.1:' + manager.ports.main); });
  handler('folder', kind => { if (!['data', 'logs'].includes(kind)) throw new Error('非法目录'); return shell.openPath(kind === 'data' ? dataDir : path.join(dataDir, 'logs')); });
  if (!snapshot().needsSetup) await run(() => manager.start());
}
async function run(operation) {
  try {
    if (!fs.existsSync(manager.mpvPath) || !fs.existsSync(path.join(manager.runtimeDir, 'web', 'dist', 'admin.html'))) throw new Error('程序资源不完整，请重新安装。');
    await operation();
  } catch (error) { if (manager.state !== 'failed') { manager.error = error.message; manager.changed('failed'); } }
  return snapshot();
}
async function quit() {
  if (exiting) return;
  exiting = true;
  try { await manager?.stop(); musicView?.webContents.close(); tray?.destroy(); allowExit = true; app.quit(); }
  catch (error) { exiting = false; manager.error = error.message; manager.changed('failed'); showStatus(); }
}
app.on('before-quit', event => { if (!allowExit) { event.preventDefault(); quit(); } });
app.on('window-all-closed', () => {});
