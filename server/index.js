/**
 * 主服务入口：Express + Socket.io + 静态托管前端 + 双源播放循环
 * 启动流程：加载默认歌单 → 监听 0.0.0.0 → 打印局域网地址 → 开始播放
 */
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const state = require('./state');
const netease = require('./netease');
const music = require('./music');
const player = require('./player');
const persistence = require('./persistence');
const logger = require('./logger');
const scheduler = require('./scheduler');
const createRouter = require('./routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use('/api', createRouter(io, player, playNext, { restart: doRestart, shutdown: doShutdown }));

// 同源部署：托管前端构建产物
const distDir = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).send('前端尚未构建：请先运行 web/ 下 npm run build');
  });
});

const broadcast = () => io.emit('state:update', state.snapshot());

/** 播放循环（防重入） */
let playing = false;
const scheduledQueue = [];
const scheduledReturnStack = [];
let scheduledStopPending = false;
async function playNext() {
  if (playing) return;
  scheduledStopPending = false;
  let item;
  if (scheduledQueue.length) {
    item = scheduledQueue.shift();
  } else if (scheduledReturnStack.length) {
    item = scheduledReturnStack.pop();
  } else {
    const r = state.nextSong();
    if (r.needFm) {
      // 心动FM：缓存空，异步拉取一批再取
      try {
        const songs = await netease.getFmSongs();
        state.fillFm(songs);
      } catch (e) {
        console.log('[FM] 拉取推荐失败: ' + e.message);
      }
      const r2 = state.nextSong();
      item = r2.item || null;
    } else {
      item = r.item || null;
    }
  }
  if (!item) {
    state.current = null;
    broadcast();
    return;
  }
  state.current = item;
  state.clearSkipVotes(); // 换歌清空投票
  refreshPlayback(); // 换歌后立即核算预计播完时间
  broadcast();
  playing = true;
  try {
    const u = await music.getSongUrl(item.platform || 'netease', item.songId);
    if (!u || !u.url) throw new Error('音源不可用（版权/VIP 限制或获取失败）');
    if (u.freeTrial) console.log(`[试听] ${item.name} 仅返回试听片段`);
    player.play(u.url);
    logger.log('info', `播放《${item.name}》- ${item.artists.join('/') || '未知歌手'} [${item.platform || 'netease'}]${u.freeTrial ? '（试听）' : ''}`, 'play');
  } catch (e) {
    logger.log('error', `歌曲《${item.name}》播放失败：${e.message}（自动跳过）`, 'play');
    playing = false;
    playNext(); // 容错：单曲失败自动跳过，绝不卡死队列
  }
}

player.onEnd = (err) => {
  if (err) console.log(`[播放器错误] ${err.message}`);
  playing = false;
  playNext();
};

function playScheduled(task) {
  if (state.current && !scheduledStopPending) {
    scheduledReturnStack.push(state.current);
  }
  scheduledQueue.push(task);
  logger.log('action', `定时播放《${task.name}》[${task.platform}]`, 'schedule');
  if (player.isPlaying() && !scheduledStopPending) {
    scheduledStopPending = true;
    player.stop();
  } else if (!player.isPlaying() && !playing) {
    playNext();
  }
  broadcast();
}

// 新连接立即推一次快照
io.on('connection', (socket) => {
  socket.emit('state:update', state.snapshot());
});
function lanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

/** 探测端口是否已被监听（单实例保护） */
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    sock.setTimeout(1500, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

// listen 失败兜底（端口被抢等）
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`端口 ${config.port} 已被占用，本实例退出（单实例保护）`);
    process.exit(1);
  }
  throw e;
});

/** 播放核算：队列总时长 + 当前进度 + 预计播完时刻（服务端时间；动作触发，非定时） */
let calcSeq = 0;
async function refreshPlayback() {
  const seq = ++calcSeq; // 只应用最后一次触发的核算结果（丢弃并发旧值）
  const queueTotal = state.userQueue.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  let currentPos = null;
  if (player.isPlaying() && state.current) {
    try {
      currentPos = await player.getTimePos();
    } catch (e) {
      currentPos = null;
    }
  }
  if (seq !== calcSeq) return; // 已有更新的核算在途，本次结果过期
  const now = Date.now();
  const curRemain =
    state.current && currentPos != null
      ? Math.max(0, (Number(state.current.duration) || 0) - currentPos)
      : state.current
        ? Number(state.current.duration) || 0
        : 0;
  const totalRemain = curRemain + queueTotal;
  state.updatePlayback({
    queueTotalSec: queueTotal,
    currentPos,
    totalRemainSec: totalRemain,
    estimatedEndAt: totalRemain > 0 ? now + totalRemain * 1000 : null,
    checkedAt: now,
  });
}

// 动作触发：任何点歌池/播放状态变更（点歌/删歌/顶歌/播放/跳过/清空等）后核算一次
state.setOnChange(() => {
  refreshPlayback();
});

// 定时兜底：每 5 秒核算一次（播放进度走秒、暂停/异常后的时间校准）
setInterval(refreshPlayback, 5000).unref();

// 意外暂停自动恢复：蓝牙耳机取下等音频设备事件可能让 mpv 意外暂停；
// 若非管理端主动暂停（manualPaused），自动继续播放（最长 2.5 秒内恢复）
setInterval(async () => {
  if (!player.isPlaying()) return; // 未播放不处理
  if (player.manualPaused) return; // 管理端主动暂停：不自动恢复
  try {
    const paused = await player.getPaused();
    if (paused === true) {
      logger.log('warn', '检测到意外暂停（可能音频设备切换/蓝牙断开），自动继续播放', 'play');
      player.resume();
    }
  } catch (e) {
    /* 查询失败忽略，下轮再试 */
  }
}, 2500).unref();

async function init() {
  // 启动恢复：队列/用户/播放源（当前歌曲按方案 A 从头重播）
  const saved = persistence.load();
  if (saved) {
    state.restore(saved);
    logger.log('info', `服务启动（恢复：队列 ${state.userQueue.length} 首、用户 ${saved.users ? saved.users.length : 0} 位、播放源 ${state.playSource}）`, 'system');
  } else {
    logger.log('info', '服务启动（全新开始，无历史状态）', 'system');
  }

  if (config.playlistId) {
    try {
      const pl = await netease.getPlaylist(config.playlistId);
      state.setPlaylist(pl.id, pl.name, pl.songs);
      console.log(`默认歌单已加载：${pl.name}（${pl.songs.length} 首）`);
    } catch (e) {
      console.log(`默认歌单加载失败：${e.message}（将以仅插播模式运行）`);
    }
  } else {
    console.log('未配置默认歌单（config.playlistId=0），将以仅插播模式运行');
  }

  // 单实例保护：8080 已被监听（已有实例在跑）→ 拒绝启动，防止双开重复播放
  if (await portInUse(config.port)) {
    console.log(`端口 ${config.port} 已被占用——检测到点歌机已在运行，本实例退出（防止双开）`);
    logger.log('error', `端口 ${config.port} 已占用，拒绝启动（单实例保护）`, 'system');
    process.exit(1);
  }

  server.listen(config.port, '0.0.0.0', () => {
    const ip = lanIP();
    console.log('----------------------------------------');
    console.log(`LAN 点歌机已启动：http://${ip}:${config.port}`);
    console.log('管理台：http://' + ip + ':' + config.port + '/admin.html');
    console.log('----------------------------------------');
    if (config.autoStart) {
      // 自动播放：恢复的歌重播 / 无则播默认歌单
      if (state.current) playCurrent();
      else playNext();
    } else {
      // 默认暂停：不自动出声；恢复中未播完的歌放回队列第一位待播
      if (state.current) {
        state.userQueue.unshift(state.current);
        state.current = null;
        state.bump(); // 落盘
        logger.log('info', '启动默认暂停：恢复的歌曲已放回队列第一位，等待开始播放', 'system');
      }
      broadcast();
      logger.log('info', '启动默认暂停（不自动播放），可在管理台点击"开始播放"', 'system');
    }
    refreshPlayback(); // 启动核算一次（恢复的队列时长/预计时间）
    scheduler.start(playScheduled);
  });
}

/** 恢复播放：重播重启前正在播放的歌曲（方案 A） */
async function playCurrent() {
  const item = state.current;
  if (!item) return;
  playing = true;
  try {
    const u = await music.getSongUrl(item.platform || 'netease', item.songId);
    if (!u || !u.url) throw new Error('音源不可用');
    player.play(u.url);
    console.log(`[恢复播放] ${item.name} - ${item.artists.join('/') || '未知歌手'}`);
  } catch (e) {
    console.log(`[恢复失败跳过] ${item.name}: ${e.message}`);
    playing = false;
    state.current = null;
    playNext();
  }
}

// 退出时强制落盘
function shutdown() {
  persistence.flush(() => state.snapshotForDisk());
  process.exit(0);
}

/** 平滑重启：先落盘，拉一个新进程（延迟2秒等端口释放），再退出自己 */
function doRestart() {
  persistence.flush(() => state.snapshotForDisk());
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      spawn('cmd', ['/c', 'timeout /t 2 /nobreak >nul & node index.js'], {
        detached: true,
        stdio: 'ignore',
        cwd: __dirname,
        windowsHide: true,
      }).unref();
    } else {
      spawn('sh', ['-c', 'sleep 2 && node index.js'], {
        detached: true,
        stdio: 'ignore',
        cwd: __dirname,
      }).unref();
    }
    logger.log('action', '服务重启中…', 'admin');
  } catch (e) {
    logger.log('error', '重启拉起失败: ' + e.message, 'system');
  }
  setTimeout(() => process.exit(0), 300);
}

function doShutdown() {
  logger.log('action', '服务关闭', 'admin');
  shutdown();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  try {
    persistence.flush(() => state.snapshotForDisk());
  } catch (e) {
    /* ignore */
  }
});

init();
