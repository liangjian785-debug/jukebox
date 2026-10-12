const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('source switching only starts playback when a song is already active', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-source-switch-'));
  const routesPath = JSON.stringify(path.resolve(__dirname, '../routes.js'));
  const statePath = JSON.stringify(path.resolve(__dirname, '../state.js'));
  const configPath = JSON.stringify(path.resolve(__dirname, '../config.js'));
  const code = `
    const createRouter = require(${routesPath});
    const state = require(${statePath});
    const config = require(${configPath});
    config.adminKey = 'test-admin-key';
    let playing = false;
    let paused = false;
    let playCalls = 0;
    const player = { isPlaying: () => playing, get manualPaused() { return paused; } };
    const router = createRouter({ emit() {} }, player, () => { playCalls++; }, {});
    const route = router.stack.find(layer => layer.route && layer.route.path === '/admin/play-source' && layer.route.methods.post).route;
    const [authenticate, changeSource] = route.stack.map(layer => layer.handle);
    const post = mode => {
      let status = 200;
      let data;
      const req = { body: { mode }, get: name => name === 'x-admin-key' ? 'test-admin-key' : '' };
      const res = { status(code) { status = code; return this; }, json(value) { data = value; return this; } };
      authenticate(req, res, () => changeSource(req, res));
      return { status, data };
    };
    const idle = post('fm');
    playing = true;
    const active = post('qq-radar');
    paused = true;
    const pausedResult = post('fm');
    process.stdout.write(JSON.stringify({ idle, active, pausedResult, playCalls }));
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', code], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, JUKEBOX_DATA_DIR: dataDir },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(output.idle.status, 200);
    assert.equal(output.active.status, 200);
    assert.equal(output.pausedResult.status, 200);
    assert.equal(output.playCalls, 1, JSON.stringify(output));
    assert.equal(output.pausedResult.data.playSource, 'fm');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
