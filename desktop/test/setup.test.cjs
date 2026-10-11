'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { pathToFileURL } = require('url');
const mainPath = path.join(__dirname, '..', 'main.cjs');
const source = fs.readFileSync(mainPath, 'utf8');
const template = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'config.local.example.js'), 'utf8');

async function application(savedPort, interfaces = {}) {
  const handlers = new Map(), files = new Map(), windows = [];
  const dataDir = path.join(__dirname, 'virtual-user-data');
  const configPath = path.join(dataDir, 'server', 'config.local.js');
  const settingsPath = path.join(dataDir, 'desktop-settings.json');
  if (savedPort) files.set(settingsPath, JSON.stringify({ mainPort: savedPort }));
  let services;
  let copiedAddress;
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: false, commandLine: { appendSwitch(name, value) { assert.equal(name, 'lang'); assert.equal(value, 'zh-CN'); } }, setName() {}, setPath() {}, getPath: () => dataDir,
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {} });
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.contentView = { children: [], addChildView(view) { this.children.push(view); } }; this.webContents = new EventEmitter(); Object.assign(this.webContents, {
      mainFrame: { url: '' }, setWindowOpenHandler() {}, send() {} }); windows.push(this); }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    getContentSize() { return [1100, 760]; }
  }
  class View {
    constructor() { this.webContents = new EventEmitter(); Object.assign(this.webContents, { setWindowOpenHandler() {}, async loadURL(url) { this.url = url; } }); }
    setVisible(visible) { this.visible = visible; }
    setBounds(bounds) { this.bounds = bounds; }
  }
  class Services extends EventEmitter {
    constructor(options) { super(); Object.assign(this, options, { state: 'stopped', starts: 0 }); services = this; }
    snapshot() { return { state: this.state }; }
    async start() { this.starts++; this.state = 'running'; }
  }
  const fakeFs = {
    mkdirSync() {}, appendFileSync() {},
    existsSync(file) { return file === configPath || file === settingsPath ? files.has(file) : /mpv\.exe$|admin\.html$/.test(file); },
    readFileSync(file) { if (files.has(file)) return files.get(file); if (file.endsWith('config.local.example.js')) return template; throw new Error('Unexpected read: ' + file); },
    writeFileSync(file, content, options) {
      assert.equal(file, configPath); assert.equal(options.flag, 'wx');
      if (files.has(file)) throw Object.assign(new Error('Already exists'), { code: 'EEXIST' });
      files.set(file, content);
    }
  };
  const electron = { app, BrowserWindow: Window, WebContentsView: View, Tray: class { setToolTip() {} on() {} setContextMenu() {} },
    Menu: { setApplicationMenu(menu) { assert.equal(menu, null); }, buildFromTemplate: value => value }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    nativeImage: { createFromPath() {} }, clipboard: { writeText(value) { copiedAddress = value; } }, shell: {}, utilityProcess: {}, dialog: {} };
  vm.runInNewContext(source, { __dirname: path.dirname(mainPath), require(name) {
    if (name === 'electron') return electron;
    if (name === 'fs') return fakeFs;
    if (name === './services.cjs') return { Services, validateMainPort: require('../services.cjs').validateMainPort };
    if (name === './admin-key.cjs') return require('../admin-key.cjs');
    if (name === './netease-login.cjs') return require('../netease-login.cjs');
    if (name === 'os') return { networkInterfaces: () => interfaces };
    return require(name);
  } }, { filename: mainPath });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(handlers.has('desktop:setup'));
  const event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame };
  return { setup: key => handlers.get('desktop:setup')(event, key), open: page => handlers.get('desktop:open')(event, page), copy: () => handlers.get('desktop:copy')(event), copied: () => copiedAddress, login: (event, platform, key) => handlers.get('music:login')(event, platform, key), windows, content: () => files.get(configPath), mainPort: services.ports.main };
}

test('access address excludes virtual adapters and shows a single LAN address', async () => {
  const ipv4 = address => ({ family: 'IPv4', internal: false, address });
  const app = await application(18082, { Meta: [ipv4('198.18.0.1')], 'vEthernet (WSL)': [ipv4('172.20.0.1')], '以太网': [ipv4('192.168.124.30'), ipv4('192.168.124.30')], WLAN: [ipv4('192.168.1.2')] });
  assert.deepEqual(Array.from((await app.open('home')).addresses), ['http://192.168.124.30:18082']);
  await app.copy(); assert.equal(app.copied(), 'http://192.168.124.30:18082');
});

test('no LAN address does not advertise loopback or link-local addresses', async () => {
  const app = await application(undefined, { Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], Ethernet: [{ family: 'IPv4', internal: false, address: '169.254.1.1' }] });
  assert.equal((await app.open('home')).addresses.length, 0);
  await assert.rejects(app.copy(), /未发现局域网地址/);
});

test('platform login rejects other pages, frames and invalid management credentials', async () => {
  const app = await application(); await app.setup('desktop-test-password'); await app.open('admin');
  const sender = app.windows[0].contentView.children[0].webContents;
  sender.mainFrame = { url: 'http://127.0.0.1:8080/admin.html' };
  await assert.rejects(app.login({ sender, senderFrame: sender.mainFrame }, 'qq', 'wrong'), /管理口令无效/);
  await assert.rejects(app.login({ sender, senderFrame: { url: sender.mainFrame.url } }, 'qq', 'desktop-test-password'), /请从管理台/);
  sender.mainFrame.url = 'http://127.0.0.1:8080/';
  await assert.rejects(app.login({ sender, senderFrame: sender.mainFrame }, 'qq', 'desktop-test-password'), /请从管理台/);
  await assert.rejects(app.login({ sender: {}, senderFrame: sender.mainFrame }, 'qq', 'desktop-test-password'), /请从管理台/);
});

test('song and admin reuse one embedded view; home hides it', async () => {
  const app = await application(); await app.setup('desktop-test-password');
  await app.open('song'); await app.open('admin');
  assert.equal(app.windows.length, 1);
  const views = app.windows[0].contentView.children;
  assert.equal(views.length, 1); assert.equal(views[0].visible, true);
  assert.equal(views[0].webContents.url, 'http://127.0.0.1:8080/admin.html');
  assert.equal(views[0].bounds.y, 104);
  assert.equal((await app.open('home')).page, 'home'); assert.equal(views[0].visible, false);
});

test('custom title bar preserves native window controls with matching colors', async () => {
  const app = await application();
  assert.equal(app.windows[0].options.titleBarStyle, 'hidden');
  assert.equal(app.windows[0].options.titleBarOverlay.height, 40);
  assert.equal(app.windows[0].options.titleBarOverlay.color, '#14251f');
});

test('desktop startup loads the saved main port', async () => {
  assert.equal((await application(18082)).mainPort, 18082);
  assert.equal((await application()).mainPort, 8080);
});

for (const key of ['abcdefgh$&', "abcdefgh$'", 'abcdefgh$`', '八个字符口令中文😀', 'abcdefgh"\\\'']) {
  test('setup preserves a literal valid password: ' + JSON.stringify(key), async () => {
    const app = await application();
    const state = await app.setup(key);
    assert.equal(state.state, 'running');
    const context = { module: { exports: {} } };
    vm.runInNewContext(app.content(), context);
    assert.equal(context.module.exports.adminKey, key);
    assert.equal(context.module.exports.volume, 100);
  });
}
test('setup trims password and refuses to overwrite existing configuration', async () => {
  const app = await application();
  await app.setup('  abcdefgh$&  ');
  const original = app.content();
  const context = { module: { exports: {} } };
  vm.runInNewContext(original, context);
  assert.equal(context.module.exports.adminKey, 'abcdefgh$&');
  await assert.rejects(app.setup('replacement-password'), { code: 'EEXIST' });
  assert.equal(app.content(), original);
});
