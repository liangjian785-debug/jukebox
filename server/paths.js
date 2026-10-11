const fs = require('fs');
const path = require('path');
const root = process.env.JUKEBOX_DATA_DIR;
if (root && !path.isAbsolute(root)) throw new Error('JUKEBOX_DATA_DIR must be absolute');
const serverDir = root ? path.join(root, 'server') : __dirname;
const qqDir = root ? path.join(root, 'qq') : path.join(__dirname, '..', 'QQMusicApi', 'data');
fs.mkdirSync(serverDir, { recursive: true });
module.exports = { serverDir, qqDir, configPath: path.join(serverDir, 'config.local.js'), statePath: path.join(serverDir, 'state.json'), presetsPath: path.join(serverDir, 'presets.json'), schedulesPath: path.join(serverDir, 'schedules.json'), channelsPath: path.join(serverDir, 'channels.json'), logsDir: path.join(serverDir, 'logs') };
