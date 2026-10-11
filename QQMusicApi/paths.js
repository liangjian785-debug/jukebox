const fs = require('fs');
const path = require('path');
const root = process.env.JUKEBOX_DATA_DIR;
if (root && !path.isAbsolute(root)) throw new Error('JUKEBOX_DATA_DIR must be absolute');
const dataDir = root ? path.join(root, 'qq') : path.join(__dirname, 'data');
fs.mkdirSync(path.join(dataDir, 'record'), { recursive: true });
module.exports = { dataDir, dataPath: (...parts) => path.join(dataDir, ...parts) };
