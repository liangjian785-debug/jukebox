'use strict';
const fs = require('fs');
const path = require('path');
const { lifecycle, directories } = require('./common.cjs');
const control = lifecycle('netease');
directories();
const tempDir = path.join(process.env.JUKEBOX_DATA_DIR, 'netease');
process.env.TEMP = process.env.TMP = tempDir;
process.chdir(tempDir);
const root = path.join(process.env.JUKEBOX_RUNTIME_DIR, 'netease-api', 'node_modules', 'NeteaseCloudMusicApi');
const token = path.join(require('os').tmpdir(), 'anonymous_token');
if (!fs.existsSync(token)) fs.writeFileSync(token, '', { flag: 'wx' });
// Keep the package's anonymous identity initialization, with bounded network I/O.
const axios = require(require.resolve('axios', { paths: [root] }));
axios.defaults.timeout = 5000;
const generateConfig = require(path.join(root, 'generateConfig.js'));
async function start() {
  await Promise.race([generateConfig(), new Promise(resolve => setTimeout(resolve, 6000))]);
  if (control.stopping) return;
  const { serveNcmApi } = require(path.join(root, 'server.js'));
  const app = await serveNcmApi({ host: '127.0.0.1', port: Number(process.env.PORT), checkVersion: false });
  control.attach(app.server);
}
start().catch(error => { control.send({ type: 'error', code: error.code || 'START_FAILED', message: '网易云接口启动失败。' }); control.stop(); });
