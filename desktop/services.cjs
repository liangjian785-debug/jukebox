'use strict';
const { EventEmitter } = require('events');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
// Snapshot creation time as well as parent/image identity to guard PID reuse.
function playerIdentity(pid, parentPid, image) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise(resolve => {
    const script = '$p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$env:JUKEBOX_VERIFY_PID); if($p -and $p.ParentProcessId -eq [int]$env:JUKEBOX_VERIFY_PARENT -and $p.ExecutablePath -eq $env:JUKEBOX_VERIFY_IMAGE){$p.CreationDate.ToUniversalTime().ToString("o")}';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 2500, env: { ...process.env, JUKEBOX_VERIFY_PID: String(pid), JUKEBOX_VERIFY_PARENT: String(parentPid), JUKEBOX_VERIFY_IMAGE: image } }, (error, stdout) => resolve(error ? null : stdout.trim() || null));
  });
}
function killPlayer(pid, parentPid, image, created) {
  return new Promise(resolve => {
    const script = '$p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$env:JUKEBOX_VERIFY_PID); if($p -and $p.ParentProcessId -eq [int]$env:JUKEBOX_VERIFY_PARENT -and $p.ExecutablePath -eq $env:JUKEBOX_VERIFY_IMAGE -and $p.CreationDate.ToUniversalTime().ToString("o") -eq $env:JUKEBOX_VERIFY_CREATED){Stop-Process -Id $p.ProcessId -Force}';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 2500, env: { ...process.env, JUKEBOX_VERIFY_PID: String(pid), JUKEBOX_VERIFY_PARENT: String(parentPid), JUKEBOX_VERIFY_IMAGE: image, JUKEBOX_VERIFY_CREATED: created } }, () => resolve());
  });
}
async function checkPort(port, host) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, host, () => server.close(resolve));
  });
  if (host === '0.0.0.0') await checkPort(port, '127.0.0.1');
}
function probe(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 2000 }, response => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 400) resolve(); else reject(new Error('本地服务验证失败'));
    });
    request.on('timeout', () => request.destroy(new Error('本地服务验证超时')));
    request.on('error', reject);
  });
}
function validateMainPort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口必须是 1024–65535 之间的整数');
  return port;
}
async function availableApiPort(preferred, excluded) {
  try {
    if (preferred > 0 && !excluded.includes(preferred)) { await checkPort(preferred, '127.0.0.1'); return preferred; }
  } catch (error) { if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error; }
  const server = net.createServer();
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  await new Promise(resolve => server.close(resolve));
  if (excluded.includes(port)) return availableApiPort(0, excluded);
  return port;
}
class Services extends EventEmitter {
  constructor({ utilityProcess, runtimeDir, dataDir, mpvPath, ports = { main: 8080, qq: 3400, netease: 4000 } }) {
    super(); Object.assign(this, { utilityProcess, runtimeDir, dataDir, mpvPath, ports });
    this.children = new Map(); this.state = 'stopped'; this.serial = Promise.resolve(); this.error = '';
    this.heartbeat = setInterval(() => { for (const child of this.children.values()) child.process.postMessage({ type: 'heartbeat' }); }, 5000);
    this.heartbeat.unref();
  }
  snapshot() { return { state: this.state, error: this.error, ports: this.ports, services: Object.fromEntries([...this.children].map(([name, child]) => [name, child.ready ? 'running' : 'starting'])) }; }
  changed(state) { if (state) this.state = state; this.emit('state', this.snapshot()); }
  enqueue(operation) { const result = this.serial.then(operation); this.serial = result.catch(() => {}); return result; }
  start() { return this.enqueue(() => this.startInternal()); }
  restart() { return this.enqueue(async () => { await this.stopInternal(); await this.startInternal(); }); }
  restartMain() { return this.enqueue(async () => { await this.stopChild('main'); await this.startInternal(true); }); }
  stopMain() { return this.enqueue(async () => { await this.stopChild('main'); this.changed('main-stopped'); }); }
  resumeMain() { return this.enqueue(() => this.startInternal(true)); }
  stop() { return this.enqueue(() => this.stopInternal()); }
  configureMainPort(port, persist, start) {
    return this.enqueue(async () => {
      validateMainPort(port);
      if (port !== this.ports.main || !this.children.has('main')) {
        try { await checkPort(port, '0.0.0.0'); }
        catch (error) { if (error.code === 'EADDRINUSE') throw new Error('主服务端口 ' + port + ' 已被占用，请选择其他端口'); throw error; }
      }
      persist(port);
      await this.stopInternal(); this.ports.main = port;
      if (start) await this.startInternal(); else this.changed();
    });
  }
  async startInternal(mainOnly = false) {
    if (this.children.has('main')) return;
    this.error = ''; this.changed('starting');
    this.instanceId = crypto.randomUUID();
    try {
      const names = mainOnly ? ['main'] : ['qq', 'netease', 'main'];
      await checkPort(this.ports.main, '0.0.0.0');
      for (const name of names.filter(name => name !== 'main')) {
        if (!this.children.has(name)) this.ports[name] = await availableApiPort(this.ports[name], Object.entries(this.ports).filter(([other]) => other !== name).map(([, port]) => port));
      }
      if (mainOnly && (!this.children.has('qq') || !this.children.has('netease'))) throw new Error('音乐接口已停止，请重启全部服务。');
      if (!mainOnly) await Promise.all(['qq', 'netease'].map(name => this.spawn(name)));
      await this.spawn('main');
      await probe(this.ports.main, '/api/state');
      await probe(this.ports.main, '/admin.html');
      this.changed('running');
    } catch (error) {
      await this.stopInternal();
      this.error = error.code === 'EADDRINUSE' ? '主服务端口 ' + this.ports.main + ' 已被占用，请在端口设置中修改。' : error.message;
      this.changed('failed'); throw error;
    }
  }
  spawn(name) {
    if (this.children.has(name)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const childProcess = this.utilityProcess.fork(path.join(__dirname, 'wrappers', name + '.cjs'), [], {
        cwd: this.dataDir, stdio: 'pipe', serviceName: 'Jukebox-' + name,
        env: { ...process.env, NODE_ENV: 'production', JUKEBOX_DESKTOP: '1', JUKEBOX_RUNTIME_DIR: this.runtimeDir, JUKEBOX_DATA_DIR: this.dataDir, JUKEBOX_MPV_PATH: this.mpvPath, JUKEBOX_INSTANCE_ID: this.instanceId, PORT: String(this.ports[name]), HOST: name === 'main' ? '0.0.0.0' : '127.0.0.1', JUKEBOX_MAIN_PORT: String(this.ports.main), JUKEBOX_QQ_PORT: String(this.ports.qq), JUKEBOX_NETEASE_PORT: String(this.ports.netease) }
      });
      const child = { process: childProcess, parentPid: childProcess.pid, ready: false, stopping: false, players: new Map() };
      childProcess.once('spawn', () => { child.parentPid = childProcess.pid; });
      this.children.set(name, child);
      // Drain arbitrary upstream output; only controlled protocol diagnostics are logged.
      childProcess.stdout?.on('data', () => {}); childProcess.stderr?.on('data', () => {});
      const timer = setTimeout(() => reject(new Error(name + ' 启动超时')), 30000);
      childProcess.on('message', message => {
        if (this.children.get(name) !== child) return;
        if (name === 'main' && message?.type === 'player-spawn' && Number.isInteger(message.pid) && message.pid > 0) {
          child.parentPid ||= childProcess.pid;
          const identity = playerIdentity(message.pid, child.parentPid, this.mpvPath); child.players.set(message.pid, identity); return;
        }
        if (name === 'main' && message?.type === 'player-exit') { child.players.delete(message.pid); return; }
        if (child.stopping || message?.service !== name) return;
        if (message.type === 'ready' && message.port === this.ports[name]) { clearTimeout(timer); child.ready = true; this.changed(); resolve(); }
        if (message.type === 'error') { clearTimeout(timer); reject(new Error(name + ' 启动失败（' + String(message.code || 'UNKNOWN').replace(/[^A-Z0-9_]/g, '') + '）')); }
        if (name === 'main' && child.ready && message.type === 'request-restart') this.restartMain().catch(() => {});
        if (name === 'main' && child.ready && message.type === 'request-stop') this.stopMain().catch(() => {});
      });
      child.exited = new Promise(done => childProcess.once('exit', code => {
        clearTimeout(timer); done();
        if (this.children.get(name) !== child) return;
        this.children.delete(name);
        if (!child.ready) reject(new Error(name + ' 在启动时退出（' + code + '）'));
        if (!child.stopping) this.enqueue(async () => { await this.cleanupPlayers(child); await this.stopInternal(); this.error = name + ' 服务意外退出，请重启服务。'; this.changed('failed'); });
      }));
    });
  }
  async stopChild(name) {
    const child = this.children.get(name); if (!child) return;
    child.stopping = true; child.process.postMessage({ type: 'shutdown' });
    let timer;
    await Promise.race([child.exited, new Promise(resolve => { timer = setTimeout(resolve, 6000); })]); clearTimeout(timer);
    if (this.children.get(name) === child) {
      await this.cleanupPlayers(child); child.process.kill();
      let killTimer;
      try { await Promise.race([child.exited, new Promise((_resolve, reject) => { killTimer = setTimeout(() => reject(new Error(name + ' 未能退出，请查看系统进程状态。')), 3000); })]); }
      finally { clearTimeout(killTimer); }
    }
    await this.cleanupPlayers(child);
  }
  async cleanupPlayers(child) { for (const [pid, identity] of child.players) { const created = await identity; if (created) await killPlayer(pid, child.parentPid, this.mpvPath, created); } child.players.clear(); }
  async stopInternal() { this.changed('stopping'); await this.stopChild('main'); await Promise.all(['qq', 'netease'].map(name => this.stopChild(name))); this.changed('stopped'); }
}
module.exports = { Services, checkPort, probe, validateMainPort, availableApiPort };
