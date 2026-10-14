/**
 * API 封装 + 匿名设备身份（clientId / nickname 存 localStorage）
 */

function genId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getClientId() {
  let id = localStorage.getItem('jukebox_client_id');
  if (!id) {
    id = genId();
    localStorage.setItem('jukebox_client_id', id);
  }
  return id;
}

export function getNickname() {
  return localStorage.getItem('jukebox_nickname') || '';
}

export function setNickname(name) {
  localStorage.setItem('jukebox_nickname', name);
}

async function request(path, options = {}) {
  const headers = { 'x-client-id': getClientId(), ...(options.headers || {}) };
  const nickname = getNickname();
  if (nickname) headers['x-client-nickname'] = encodeURIComponent(nickname);
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export const search = (keyword, limit = 30, platform = 'netease') =>
  request(`/api/search?platform=${platform}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`);

export const getPlaylistSongs = (id, limit = 30) =>
  request(`/api/playlist-songs?id=${id}&limit=${limit}`);

export const getChartSongs = (platform, id, limit = 30) =>
  request(`/api/chart-songs?platform=${platform}&id=${id}&limit=${limit}`);

export const getState = () => request('/api/state');

export const getMe = () => request('/api/me');

export const queueSong = (songId, nickname, platform = 'netease') =>
  request('/api/queue', { method: 'POST', body: JSON.stringify({ platform, songId, nickname }) });

export const removeSong = (platform, songId) =>
  request(`/api/queue/${platform}/${songId}`, { method: 'DELETE' });

export const voteSkip = (nickname) =>
  request('/api/vote-skip', { method: 'POST', body: JSON.stringify({ nickname }) });

export const boostSong = (platform, songId) =>
  request('/api/boost', { method: 'POST', body: JSON.stringify({ platform, songId }) });

export const updateNickname = (nickname) =>
  request('/api/me/nickname', { method: 'POST', body: JSON.stringify({ nickname }) });

// ============ 管理接口（需 x-admin-key） ============

const adminKey = () => sessionStorage.getItem('jukebox_admin_key') || '';

export const adminLogin = (key) =>
  request('/api/admin/auth', { method: 'POST', body: JSON.stringify({ key }), headers: { 'x-admin-key': key } });

export const adminStatus = () =>
  request('/api/admin/status', { headers: { 'x-admin-key': adminKey() } });

export const adminPause = (paused) =>
  request('/api/admin/pause', { method: 'POST', body: JSON.stringify({ paused }), headers: { 'x-admin-key': adminKey() } });

export const adminVolume = (volume) =>
  request('/api/admin/volume', { method: 'POST', body: JSON.stringify({ volume }), headers: { 'x-admin-key': adminKey() } });

export const adminRemove = (platform, songId) =>
  request(`/api/admin/queue/${platform}/${songId}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey() } });

export const adminMoveQueue = (from, to) =>
  request('/api/admin/queue/move', { method: 'POST', body: JSON.stringify({ from, to }), headers: { 'x-admin-key': adminKey() } });

export const adminPlayNow = (index) =>
  request('/api/admin/queue/play-now', { method: 'POST', body: JSON.stringify({ index }), headers: { 'x-admin-key': adminKey() } });

export const adminClear = () =>
  request('/api/admin/queue/clear', { method: 'POST', headers: { 'x-admin-key': adminKey() } });

export const adminSetPlaylist = (playlistId, platform = 'netease') =>
  request('/api/admin/playlist', { method: 'POST', body: JSON.stringify({ playlistId, platform }), headers: { 'x-admin-key': adminKey() } });

export const adminGetPresets = (platform = 'netease') =>
  request(`/api/admin/presets?platform=${platform}`, { headers: { 'x-admin-key': adminKey() } });

export const adminSearchPlaylists = (keyword, platform = 'netease') =>
  request(`/api/admin/playlist-search?keyword=${encodeURIComponent(keyword)}&platform=${platform}`, { headers: { 'x-admin-key': adminKey() } });

export const adminAddPreset = (playlistId, platform = 'netease') =>
  request('/api/admin/presets', { method: 'POST', body: JSON.stringify({ playlistId, platform }), headers: { 'x-admin-key': adminKey() } });

export const adminRemovePreset = (playlistId, platform = 'netease') =>
  request(`/api/admin/presets/${playlistId}?platform=${platform}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey() } });

export const adminGetPlaylist = (platform = 'netease') =>
  request(`/api/admin/playlist?platform=${platform}`, { headers: { 'x-admin-key': adminKey() } });

export const adminAudioDevices = () =>
  request('/api/admin/audio-devices', { headers: { 'x-admin-key': adminKey() } });

export const adminSetAudioDevice = (device) =>
  request('/api/admin/audio-device', { method: 'POST', body: JSON.stringify({ device }), headers: { 'x-admin-key': adminKey() } });

export const adminGetPlaySource = () =>
  request('/api/admin/play-source', { headers: { 'x-admin-key': adminKey() } });

export const adminSetPlaySource = (mode) =>
  request('/api/admin/play-source', { method: 'POST', body: JSON.stringify({ mode }), headers: { 'x-admin-key': adminKey() } });

export const adminSkip = () =>
  request('/api/admin/skip', { method: 'POST', headers: { 'x-admin-key': adminKey() } });

export const adminGetSkipConfig = () =>
  request('/api/admin/skip-config', { headers: { 'x-admin-key': adminKey() } });

export const adminSetControlSettings = (settings) =>
  request('/api/admin/control-settings', { method: 'POST', body: JSON.stringify(settings), headers: { 'x-admin-key': adminKey() } });

export const adminSetSkipConfig = (required) =>
  request('/api/admin/skip-config', { method: 'POST', body: JSON.stringify({ required }), headers: { 'x-admin-key': adminKey() } });

export const adminSetBoostConfig = (required) =>
  request('/api/admin/boost-config', { method: 'POST', body: JSON.stringify({ required }), headers: { 'x-admin-key': adminKey() } });

export const adminGetUsers = () =>
  request('/api/admin/users', { headers: { 'x-admin-key': adminKey() } });

export const adminGetLogs = (limit = 200) =>
  request(`/api/admin/logs?limit=${limit}`, { headers: { 'x-admin-key': adminKey() } });

export const adminGetSchedules = () =>
  request('/api/admin/schedules', { headers: { 'x-admin-key': adminKey() } });

export const adminAddSchedule = (schedule) =>
  request('/api/admin/schedules', { method: 'POST', body: JSON.stringify(schedule), headers: { 'x-admin-key': adminKey() } });

export const adminSetScheduleEnabled = (id, enabled) =>
  request(`/api/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }), headers: { 'x-admin-key': adminKey() } });

export const adminDeleteSchedule = (id) =>
  request(`/api/admin/schedules/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey() } });

export const adminSetChannels = (platform, enabled) =>
  request('/api/admin/channels', { method: 'POST', body: JSON.stringify({ platform, enabled }), headers: { 'x-admin-key': adminKey() } });

export const adminSetCookie = (platform, cookie) =>
  request('/api/admin/cookie', { method: 'POST', body: JSON.stringify({ platform, cookie }), headers: { 'x-admin-key': adminKey() } });

export const adminGetCookieStatus = () =>
  request('/api/admin/cookie-status', { headers: { 'x-admin-key': adminKey() } });

export const adminRestart = () =>
  request('/api/admin/restart', { method: 'POST', headers: { 'x-admin-key': adminKey() } });

export const adminShutdown = () =>
  request('/api/admin/shutdown', { method: 'POST', headers: { 'x-admin-key': adminKey() } });
