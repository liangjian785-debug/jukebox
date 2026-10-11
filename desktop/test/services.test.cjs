'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const net = require('net');
const { Services, checkPort, validateMainPort, availableApiPort } = require('../services.cjs');
function manager() {
  const processes = [];
  const utilityProcess = { fork(_file, _args, options) {
    const child = new EventEmitter(); child.pid = 123; child.messages = [];
    child.postMessage = message => { child.messages.push(message); if (message.type === 'shutdown') setImmediate(() => child.emit('exit', 0)); };
    child.kill = () => child.emit('exit', 1);
    processes.push(child);
    setImmediate(() => child.emit('message', { type:'ready', service:options.serviceName.replace('Jukebox-', ''), port:Number(options.env.PORT) }));
    return child;
  } };
  return { services: new Services({ utilityProcess, runtimeDir: 'runtime', dataDir: '.', mpvPath: 'mpv.exe', ports: { main:18080,qq:13400,netease:14000 } }), processes };
}
test('port conflict refuses ownership and leaves unrelated listener alive', async () => {
  const unrelated = net.createServer(); await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
  await assert.rejects(checkPort(unrelated.address().port, '127.0.0.1'), { code:'EADDRINUSE' });
  assert.equal(unrelated.listening, true); await new Promise(resolve => unrelated.close(resolve));
});

test('occupied internal port switches without stopping its owner', async () => {
  const unrelated = net.createServer(); await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
  try {
    const occupied = unrelated.address().port;
    const selected = await availableApiPort(occupied, [8080]);
    assert.notEqual(selected, occupied); assert.notEqual(selected, 8080);
    await checkPort(selected, '127.0.0.1'); assert.equal(unrelated.listening, true);
    assert.notEqual(await availableApiPort(occupied, [occupied]), occupied);
  } finally { await new Promise(resolve => unrelated.close(resolve)); }
});

test('invalid main ports are rejected', () => {
  for (const value of [0, 80, 65536, 8080.5, NaN, '8080']) assert.throws(() => validateMainPort(value));
  assert.equal(validateMainPort(18080), 18080);
});

test('occupied main setting preserves running children and saved setting', async () => {
  const unrelated = net.createServer(); await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
  const { services } = manager(); let saved = false;
  try {
    await services.spawn('qq');
    await assert.rejects(services.configureMainPort(unrelated.address().port, () => { saved = true; }, false), /已被占用/);
    assert.equal(saved, false); assert(services.children.has('qq')); assert.equal(unrelated.listening, true);
  } finally { await services.stop(); await new Promise(resolve => unrelated.close(resolve)); }
});

test('main setting is persisted and used by subsequently spawned service', async () => {
  const { services } = manager(); let saved;
  const selected = await availableApiPort(0, []);
  await services.configureMainPort(selected, port => { saved = port; }, false);
  assert.equal(saved, selected); assert.equal(services.ports.main, selected);
  await services.spawn('main'); assert.equal(services.children.get('main').ready, true);
  await services.stop();
});
test('main stop leaves music APIs running; duplicate stops are serialized', async () => {
  const { services, processes } = manager();
  await Promise.all(['qq','netease','main'].map(name => services.spawn(name)));
  await Promise.all([services.stopMain(), services.stopMain()]);
  assert.equal(services.state, 'main-stopped');
  assert.deepEqual([...services.children.keys()].sort(), ['netease','qq']);
  assert.equal(processes[2].messages.filter(message => message.type === 'shutdown').length, 1);
  await services.stop(); assert.equal(services.children.size, 0);
});
test('late message from old process cannot mark replacement ready', async () => {
  const { services, processes } = manager();
  await services.spawn('qq'); await services.stopChild('qq');
  const replacement = services.spawn('qq');
  processes[0].emit('message', { type:'ready',service:'qq',port:13400 });
  assert.equal(services.children.get('qq').ready, false);
  await replacement; await services.stop();
});
