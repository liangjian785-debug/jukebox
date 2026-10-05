/**
 * mpv 播放器封装（带 IPC：暂停/继续/音量）
 * 每首歌 spawn 一个 mpv 进程，通过 --input-ipc-server 暴露控制管道；
 * 播完进程自然退出触发 onEnd；跳过 = kill 进程。
 * Windows 用命名管道 \\.\pipe\jukebox-mpv，Linux/macOS 用 unix socket。
 */
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const config = require('./config');

const IPC_NAME =
  process.platform === 'win32' ? '\\\\.\\pipe\\jukebox-mpv' : path.join(os.tmpdir(), 'jukebox-mpv.sock');

class Player {
  constructor() {
    this.proc = null;
    this.ipc = null; // IPC 连接
    this.paused = false;
    this.manualPaused = false; // 主动暂停标记（管理端操作）；意外暂停(设备事件)不置位
    this.volume = config.volume;
    this.onEnd = null; // (err?) => void
    this._ended = false;
    this._ipcRetries = 0;
  }

  /** 播放一个 URL（自动停掉上一个） */
  play(url) {
    this.stop();
    this._ended = false;
    this.paused = false;
    this.manualPaused = false;
    this._ipcRetries = 0;
    let proc;
    const args = ['--volume=' + this.volume, '--no-terminal', `--input-ipc-server=${IPC_NAME}`];
    if (config.audioDevice) args.push(`--audio-device=${config.audioDevice}`);
    args.push(url);
    try {
      proc = spawn(config.mpvPath, args, { stdio: 'ignore', windowsHide: true });
    } catch (e) {
      this._ended = true;
      if (this.onEnd) this.onEnd(new Error('mpv 启动失败: ' + e.message));
      return;
    }
    this.proc = proc;
    proc.on('error', (err) => {
      if (this.proc === proc) this.proc = null;
      if (!this._ended) {
        this._ended = true;
        if (this.onEnd) this.onEnd(err);
      }
    });
    proc.on('exit', () => {
      if (this.proc === proc) {
        this.proc = null;
        this._closeIpc();
      }
      if (!this._ended) {
        this._ended = true;
        if (this.onEnd) this.onEnd();
      }
    });
    // 延迟连接 IPC（等 mpv 建立管道）
    this._connectIpc(proc);
  }

  _connectIpc(proc) {
    if (this.proc !== proc || this._ipcRetries >= 15) return;
    this._ipcRetries++;
    const conn = net.createConnection(IPC_NAME);
    conn.on('connect', () => {
      if (this.proc !== proc) return conn.destroy();
      this.ipc = conn;
      this._ipcRetries = 0;
      if (this.manualPaused) this._send(['set_property', 'pause', true]);
    });
    conn.on('error', () => {
      conn.destroy();
      if (this.ipc === conn) this.ipc = null;
      if (this.proc === proc) setTimeout(() => this._connectIpc(proc), 200);
    });
    conn.on('close', () => {
      if (this.ipc === conn) this.ipc = null;
    });
  }

  _closeIpc() {
    if (this.ipc) {
      try {
        this.ipc.destroy();
      } catch (e) {
        /* ignore */
      }
      this.ipc = null;
    }
  }

  /** 发一条 IPC 命令（fire-and-forget） */
  _send(command) {
    if (!this.ipc) return false;
    try {
      this.ipc.write(JSON.stringify({ command }) + '\n');
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 查询当前播放位置（秒）；失败/未播放返回 null */
  getTimePos() {
    return new Promise((resolve) => {
      if (!this.ipc) return resolve(null);
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        if (this.ipc) this.ipc.off('data', onData);
        clearTimeout(timer);
      };
      const onData = (d) => {
        try {
          const text = d.toString().trim();
          const msg = JSON.parse(text.split('\n')[0]);
          if (msg.request_id === 711 && msg.error === 'success' && typeof msg.data === 'number') {
            cleanup();
            resolve(msg.data);
          }
        } catch (e) {
          /* 忽略无关数据 */
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 1200);
      this.ipc.on('data', onData);
      try {
        this.ipc.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 711 }) + '\n');
      } catch (e) {
        cleanup();
        resolve(null);
      }
    });
  }

  /** 暂停/继续（管理端操作：记录主动意图，意外暂停不会被自动恢复逻辑误判为主动） */
  setPaused(paused) {
    this.paused = paused;
    this.manualPaused = paused;
    if (this._send(['set_property', 'pause', paused])) return true;
    return false;
  }

  /** 主动继续（手动恢复时清除主动暂停标记） */
  resume() {
    this.paused = false;
    this.manualPaused = false;
    this._send(['set_property', 'pause', false]);
  }

  /** 查询 mpv 实际暂停状态（用于意外暂停检测） */
  getPaused() {
    return new Promise((resolve) => {
      if (!this.ipc) return resolve(null);
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        if (this.ipc) this.ipc.off('data', onData);
        clearTimeout(timer);
      };
      const onData = (d) => {
        try {
          const text = d.toString().trim();
          const msg = JSON.parse(text.split('\n')[0]);
          if (msg.request_id === 712 && msg.error === 'success' && typeof msg.data === 'boolean') {
            cleanup();
            resolve(msg.data);
          }
        } catch (e) {
          /* ignore */
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 1200);
      this.ipc.on('data', onData);
      try {
        this.ipc.write(JSON.stringify({ command: ['get_property', 'pause'], request_id: 712 }) + '\n');
      } catch (e) {
        cleanup();
        resolve(null);
      }
    });
  }

  /** 设置音量 0-100 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, Number(v) || 0));
    this._send(['set_property', 'volume', this.volume]);
  }

  /** 运行时切换音频输出设备（IPC，立即生效）；同时更新内存配置 */
  setAudioDevice(device) {
    config.audioDevice = device || '';
    if (this.ipc) {
      this._send(['set_property', 'audio-device', device || 'auto']);
    }
  }

  /** 停止（kill 进程；exit 事件触发 onEnd → 播下一首） */
  stop() {
    if (this.proc) {
      this._closeIpc();
      try {
        this.proc.kill();
      } catch (e) {
        /* ignore */
      }
      this.proc = null;
    }
  }

  isPlaying() {
    return !!this.proc;
  }
}

module.exports = new Player();
