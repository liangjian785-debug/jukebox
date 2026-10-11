const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
test('desktop paths isolate server and QQ data in an absolute Chinese directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '点歌 桌面-'));
  try {
    const script = `const p=require('./server/paths'); const q=require('./QQMusicApi/paths'); const fs=require('fs'); fs.writeFileSync(p.configPath,'module.exports={port:18381,autoStart:false};'); const c=require('./server/config'); console.log(JSON.stringify({p,q,c:{port:c.port,mpv:c.mpvPath},record:fs.existsSync(q.dataPath('record'))}));`;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '../..'), env: {...process.env, JUKEBOX_DATA_DIR:root, JUKEBOX_MPV_PATH:path.join(root,'播放器.exe')}, encoding:'utf8' });
    assert.equal(result.status,0,result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.p.configPath,path.join(root,'server','config.local.js'));
    assert.equal(value.q.dataDir,path.join(root,'qq'));
    assert.equal(value.record,true);
    assert.equal(value.c.port,18381);
    assert.equal(value.c.mpv,path.join(root,'播放器.exe'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test('player shutdown waits for every child and never invokes playback end', async () => {
  const player=require('../player');
  let kills=0, ends=0;
  const child=new EventEmitter(); child.kill=()=>{kills++; setImmediate(()=>child.emit('close'));};
  player.onEnd=()=>ends++;
  player._track(child);
  const shutdown=player.shutdown();
  assert.equal(player.shutdown(),shutdown);
  await shutdown;
  player.play('unused');
  assert.equal(kills,1);
  assert.equal(ends,0);
  assert.equal(player.children.size,0);
});
