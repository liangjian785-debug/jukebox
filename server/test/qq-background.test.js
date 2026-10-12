const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('QQ background providers map playlist and private radar response songs', async () => {
  const qq = require('../qq');
  const config = require('../config');
  const originalFetch = global.fetch;
  const originalBase = config.qqApiBase;
  config.qqApiBase = 'http://qq-fixture.test';
  try {
    global.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/songlist') {
        assert.equal(parsed.searchParams.get('id'), '4321');
        return { ok: true, json: async () => ({ result: 100, data: {
          disstid: '4321', dissname: '测试歌单', songlist: [
            { songmid: 'qq-song-1', songname: '歌单歌曲', singer: [{ name: '歌手甲' }], interval: 203 },
          ],
        } }) };
      }
      if (parsed.pathname === '/radio') {
        assert.equal(parsed.searchParams.get('id'), '99');
        return { ok: true, json: async () => ({ result: 100, data: {
          id: 99, tracks: [
            { track_info: { songmid: 'qq-radar-1', songname: '雷达歌曲', singer: [{ name: '歌手乙' }], interval: 184 } },
          ],
        } }) };
      }
      throw new Error('unexpected endpoint ' + parsed.pathname);
    };

    const playlist = await qq.getPlaylist(4321);
    assert.equal(playlist.id, '4321');
    assert.equal(playlist.name, '测试歌单');
    assert.deepEqual(playlist.songs.map((song) => [song.songId, song.name, song.platform]), [
      ['qq-song-1', '歌单歌曲', 'qq'],
    ]);

    const radar = await qq.getRadarSongs();
    assert.deepEqual(radar.map((song) => [song.songId, song.name, song.platform]), [
      ['qq-radar-1', '雷达歌曲', 'qq'],
    ]);
  } finally {
    global.fetch = originalFetch;
    config.qqApiBase = originalBase;
  }
});

test('play queue stays first for QQ sources and radar fetch is requested only when its cache is empty', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-qq-background-'));
  const statePath = JSON.stringify(path.resolve(__dirname, '../state.js'));
  const code = `
    const state = require(${statePath});
    state.userQueue.push({ songId: 'user-song', platform: 'netease' });
    state.setPlaylist(26, 'QQ热歌榜', [{ songId: 'chart-song', platform: 'qq' }], 'qq');
    state.setPlaySource('qq-playlist');
    const user = state.nextSong().item;
    const chart = state.nextSong().item;
    state.setPlaySource('qq-radar');
    const needsFetch = state.nextSong();
    state.fillQqRadar([{ songId: 'radar-song', name: '雷达歌曲' }]);
    const radar = state.nextSong().item;
    process.stdout.write(JSON.stringify({ user, chart, needsFetch, radar, meta: state.playlistMeta() }));
    process.exit(0);
  `;
  try {
    const result = spawnSync(process.execPath, ['-e', code], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, JUKEBOX_DATA_DIR: tempRoot },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.user.songId, 'user-song');
    assert.equal(data.chart.songId, 'chart-song');
    assert.equal(data.needsFetch.needQqRadar, true);
    assert.equal(data.radar.songId, 'radar-song');
    assert.equal(data.radar.platform, 'qq');
    assert.equal(data.meta.platform, 'qq');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
