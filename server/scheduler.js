const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'schedules.json');
let tasks = load();
let timer = null;
let onDue = null;

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function save() {
  const tmp = FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.log('[定时播放] 保存失败: ' + e.message);
  }
}

function publicTask(task) {
  const { lastRunKey, ...result } = task;
  return result;
}

function normalizeSong(song) {
  if (!song || !song.songId) throw new Error('歌曲信息不完整');
  return {
    platform: song.platform === 'qq' ? 'qq' : 'netease',
    songId: String(song.songId),
    name: String(song.name || '未知歌曲'),
    artists: Array.isArray(song.artists) ? song.artists.map(String) : [],
    cover: String(song.cover || ''),
    duration: Number(song.duration) || 0,
  };
}

function normalizeSchedule(data) {
  const recurrence = data.recurrence === 'weekly' ? 'weekly' : 'daily';
  const time = String(data.time || '');
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error('时间必须是 HH:mm 格式');
  }
  const weekdays = [...new Set((Array.isArray(data.weekdays) ? data.weekdays : []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  if (recurrence === 'weekly' && weekdays.length === 0) {
    throw new Error('每周任务至少选择一天');
  }
  return { song: normalizeSong(data.song), recurrence, time, weekdays };
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function list() {
  return tasks.map(publicTask);
}

function add(data) {
  const normalized = normalizeSchedule(data || {});
  const task = {
    id: makeId(),
    ...normalized.song,
    recurrence: normalized.recurrence,
    time: normalized.time,
    weekdays: normalized.weekdays,
    enabled: true,
    lastRunKey: '',
  };
  tasks.push(task);
  save();
  return publicTask(task);
}

function update(id, patch) {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('定时任务不存在');
  if (typeof patch.enabled === 'boolean') task.enabled = patch.enabled;
  save();
  return publicTask(task);
}

function remove(id) {
  const index = tasks.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('定时任务不存在');
  tasks.splice(index, 1);
  save();
  return { ok: true };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function runKey(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function matches(task, now) {
  if (!task.enabled || task.time !== `${pad(now.getHours())}:${pad(now.getMinutes())}`) return false;
  return task.recurrence === 'daily' || task.weekdays.includes(now.getDay());
}

function check() {
  if (!onDue) return;
  const now = new Date();
  const key = runKey(now);
  let changed = false;
  for (const task of tasks) {
    if (!matches(task, now) || task.lastRunKey === key) continue;
    task.lastRunKey = key;
    changed = true;
    onDue(publicTask(task));
  }
  if (changed) save();
}

function start(handler) {
  onDue = handler;
  if (timer) return;
  check();
  timer = setInterval(check, 15000);
  timer.unref();
}

module.exports = { list, add, update, remove, start };
