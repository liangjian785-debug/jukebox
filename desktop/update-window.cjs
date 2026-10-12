'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function createUpdateWindow(dataDir, script, version) {
  const stateFile = path.join(dataDir, 'update-progress.json');
  const readyFile = stateFile + '.ready';
  let active = false;
  function write(state) {
    const temp = stateFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ ...state, time: Date.now() }));
    fs.renameSync(temp, stateFile);
  }
  // The new process acknowledges installation only after reaching initialization.
  try {
    const previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (previous.status === 'installing' && previous.latest === version) {
      write({ ...previous, status: 'complete', percent: 100, message: '更新完成，正在打开新版…' });
    }
  } catch {}
  return {
    publish(state) { if (active) write(state); },
    async open(state) {
      fs.rmSync(readyFile, { force: true });
      active = true;
      write(state);
      let failure;
      const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-StateFile', stateFile],
        { windowsHide: true, stdio: 'ignore' });
      child.on('error', error => { failure = error; });
      child.on('exit', code => { if (code) failure ||= new Error('更新窗口启动失败'); });
      child.unref();
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(readyFile)) {
        if (failure || Date.now() > deadline) throw failure || new Error('更新窗口启动超时');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };
}
module.exports = { createUpdateWindow };
