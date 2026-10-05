const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const net = require('node:net');
const player = require('../player');

test('a pause clicked before mpv IPC connects is sent when it connects', () => {
  const originalCreateConnection = net.createConnection;
  const sent = [];
  const conn = new EventEmitter();
  conn.write = (value) => sent.push(JSON.parse(value).command);
  conn.destroy = () => {};
  net.createConnection = () => conn;

  try {
    const proc = {};
    player.proc = proc;
    player.ipc = null;
    player.paused = false;
    player.manualPaused = false;
    player._ipcRetries = 0;
    player._connectIpc(proc);

    assert.equal(player.setPaused(true), false);
    conn.emit('connect');
    assert.deepEqual(sent, [['set_property', 'pause', true]]);
    assert.equal(player.paused, true);
  } finally {
    player.ipc = null;
    player.proc = null;
    player.paused = false;
    player.manualPaused = false;
    net.createConnection = originalCreateConnection;
  }
});
