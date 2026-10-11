'use strict';
const fs = require('fs');
const path = require('path');
function lifecycle(service) {
  let server, cleanup, stopping = false, lastHeartbeat = Date.now();
  const send = message => process.parentPort?.postMessage({ service, ...message });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    try { cleanup?.(); } catch {}
    clearInterval(timer);
    const deadline = setTimeout(() => process.exit(0), 4500);
    deadline.unref();
    if (!server) return process.exit(0);
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
  };
  process.parentPort?.on('message', event => {
    if (event.data?.type === 'heartbeat') lastHeartbeat = Date.now();
    if (event.data?.type === 'shutdown') stop();
  });
  const timer = setInterval(() => { if (Date.now() - lastHeartbeat > 15000) stop(); }, 1000);
  process.on('SIGTERM', stop);
  process.on('uncaughtException', error => { send({ type: 'error', code: error.code || 'START_FAILED', message: '音乐接口启动失败，请查看日志。' }); process.exit(1); });
  return {
    send, stop, get stopping() { return stopping; },
    attach(httpServer, onStop) {
      server = httpServer;
      cleanup = onStop;
      server.once('error', error => { send({ type: 'error', code: error.code || 'LISTEN_FAILED', message: '音乐接口无法监听指定端口。' }); stop(); });
      const ready = () => { if (!stopping) send({ type: 'ready', port: server.address().port }); };
      if (server.listening) ready(); else server.once('listening', ready);
    }
  };
}
function directories() {
  const root = process.env.JUKEBOX_DATA_DIR;
  for (const name of ['server', 'qq', 'qq/record', 'netease', 'logs']) fs.mkdirSync(path.join(root, name), { recursive: true });
}
module.exports = { lifecycle, directories };
