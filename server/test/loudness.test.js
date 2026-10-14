const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');

async function playbackArgs(normalization) {
  let args;
  const fakeFs = { writeFileSync() {} };
  const config = { volume: 50, mpvPath: 'fixture', loudnessNormalization: normalization };
  const context = { module: { exports: {} }, process: { env: {}, platform: process.platform }, setTimeout, clearTimeout, console,
    require(name) {
      if (name === './config') return config;
      if (name === 'fs') return fakeFs;
      if (name === 'child_process') return { spawn(_, values) { args = values; return new EventEmitter(); } };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../player.js'), 'utf8'), context);
  const player = context.module.exports;
  player._connectIpc = () => {};
  await player.play('fixture.wav');
  return Array.from(args);
}

test('normalization defaults on and keeps the user volume and fade script', async () => {
  const args = await playbackArgs(undefined);
  assert.ok(args.some(a => a.startsWith('--af=lavfi=[loudnorm=')));
  assert.ok(args.includes('--replaygain=no'));
  assert.ok(args.includes('--volume=0'));
  assert.ok(args.includes('--vid=no'));
  assert.ok(args.includes('--audio-display=no'));
  assert.ok(args.includes('--force-window=no'));
  assert.ok(args.includes('--script-opts=jukebox-volume=50'));
  assert.ok(args.some(a => a.startsWith('--script=')));
  const disabled = await playbackArgs(false);
  assert.ok(!disabled.some(a => a.startsWith('--af=')));
});

function makeWave(file, amplitude) {
  const rate = 48000, frames = rate * 18, channels = 2;
  const b = Buffer.alloc(44 + frames * channels * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const signal = amplitude * (0.6 * Math.sin(2*Math.PI*440*t) + 0.3 * Math.sin(2*Math.PI*880*t) + 0.1 * Math.sin(2*Math.PI*1760*t));
    for (let c = 0; c < channels; c++) b.writeInt16LE(Math.round(signal * 32767), 44 + (i * channels + c) * 2);
  }
  fs.writeFileSync(file, b);
}

function levels(file) {
  const b = fs.readFileSync(file);
  let offset = 12, data, format;
  while (offset + 8 <= b.length) {
    const size = b.readUInt32LE(offset+4), id = b.toString('ascii', offset, offset+4);
    if (id === 'fmt ') format = { channels:b.readUInt16LE(offset+10),rate:b.readUInt32LE(offset+12),bits:b.readUInt16LE(offset+22),code:b.readUInt16LE(offset+8) };
    if (id === 'data') { data = b.subarray(offset+8, Math.min(b.length, offset+8+size)); break; }
    offset += 8 + size + (size % 2);
  }
  assert.equal(format.bits, 16); assert.equal(format.rate, 48000); assert.ok(data);
  let sum = 0, count = 0, peak = 0;
  for (let i = 0; i+2 <= data.length; i += 2) {
    const v = data.readInt16LE(i)/32768; peak = Math.max(peak,Math.abs(v));
    const seconds = i / 2 / format.channels / format.rate;
    if (seconds >= 6 && seconds < 14) { sum += v*v; count++; }
  }
  assert.ok(count > 48000);
  return { rms:20*Math.log10(Math.sqrt(sum/count)),peak:20*Math.log10(peak) };
}

const mpv = process.env.JUKEBOX_TEST_MPV;
test('bundled mpv reduces a 20 dB track difference without clipping', { skip: !mpv }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-loudness-'));
  try {
    const args = await playbackArgs(undefined), filter = args.find(a => a.startsWith('--af='));
    const measured = [];
    for (const [amplitude, volume] of [[0.045,100], [0.45,100], [0.45,50], [0.45,0]]) {
      const input=path.join(dir, amplitude+'.wav'), output=path.join(dir, amplitude+'-'+volume+'-normalized.wav');
      makeWave(input, amplitude);
      const run=spawnSync(mpv, ['--no-config','--no-video','--replaygain=no','--volume='+volume,filter,'--ao=pcm','--ao-pcm-file='+output,'--ao-pcm-waveheader=yes','--audio-format=s16',input], {windowsHide:true,encoding:'utf8',timeout:30000});
      assert.equal(run.status, 0, run.stderr);
      measured.push(levels(output));
    }
    const difference = Math.abs(measured[0].rms - measured[1].rms);
    assert.ok(difference < 1.5, JSON.stringify(measured));
    assert.ok(measured.every(l => l.peak < -1.3), JSON.stringify(measured));
    // mpv's native volume curve is cubic: 50% produces ~18 dB attenuation.
    assert.ok(Math.abs(measured[1].rms-measured[2].rms-18.06) < 0.1, 'User volume must remain effective after normalization: '+JSON.stringify(measured));
    assert.equal(measured[3].peak, -Infinity, 'Zero volume must remain silent');
    console.log('20 dB input difference -> '+difference.toFixed(2)+' dB; peaks '+measured.map(l=>l.peak.toFixed(2)).join('/')+' dBFS');
  } finally { fs.rmSync(dir, { recursive:true,force:true }); }
});
