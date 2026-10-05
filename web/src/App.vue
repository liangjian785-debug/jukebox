<script setup>
import { ref, computed, onMounted } from 'vue';
import NowPlaying from './components/NowPlaying.vue';
import SongSearch from './components/SongSearch.vue';
import ChartSidebar from './components/ChartSidebar.vue';
import QueueList from './components/QueueList.vue';
import { getState, getMe, queueSong, removeSong, voteSkip, boostSong, updateNickname, getClientId, getNickname, setNickname } from './api';
import { connectSocket } from './socket';

const state = ref({ current: null, userQueue: [], playlistMeta: { name: '', count: 0 }, skip: { votes: 0, required: 8, voters: [] }, channels: { netease: true, qq: true }, version: 0 });
const myClientId = getClientId();
const myCanonicalId = ref(''); // 合并身份：同 IP 多号共享，用于判断"我点的"可删除
const myNickname = ref(getNickname() || '匿名');
const toast = ref('');
let toastTimer = null;

function showToast(msg) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2000);
}

// 首次访问：确认昵称
function ensureNickname() {
  if (!getNickname()) {
    const name = prompt('给自己起个昵称吧（可选，空则匿名）：');
    setNickname((name || '').trim().slice(0, 12));
  }
}

async function doQueue(song) {
  try {
    const platform = song.platform || 'netease';
    const r = await queueSong(song.songId, getNickname(), platform);
    showToast(r.duplicate ? '已插播（队列中已有一首）' : '已插播到下一首');
  } catch (e) {
    showToast('点歌失败：' + e.message);
  }
}

async function doRemove(platform, songId) {
  try {
    await removeSong(platform || 'netease', songId);
    showToast('已删除');
  } catch (e) {
    showToast('删除失败：' + e.message);
  }
}

async function doVote() {
  try {
    const r = await voteSkip(getNickname());
    if (r.skipped) showToast(`票数达标（${r.votes}/${r.required}），已跳过`);
    else showToast(`已投票（${r.votes}/${r.required}）`);
  } catch (e) {
    if (e.message.includes('投过')) showToast('你已经投过票了');
    else showToast('投票失败：' + e.message);
  }
}

async function doBoost(platform, songId) {
  try {
    const r = await boostSong(platform || 'netease', songId);
    if (r.promoted) showToast(`顶歌成功（${r.count}/${r.required}），已升到队列第一！`);
    else showToast(`已顶歌（${r.count}/${r.required}）`);
  } catch (e) {
    if (e.message.includes('顶过')) showToast('你已经顶过这首歌了');
    else showToast('顶歌失败：' + e.message);
  }
}

// 修改用户名：同步服务端（队列里自己点的歌同步更新）
async function doChangeNickname() {
  const name = prompt('修改用户名：', myNickname.value === '匿名' ? '' : myNickname.value);
  if (name === null) return; // 取消
  const trimmed = (name || '').trim().slice(0, 12);
  if (!trimmed) return showToast('用户名不能为空');
  try {
    const r = await updateNickname(trimmed);
    setNickname(trimmed);
    myNickname.value = trimmed;
    // 主动刷新一次状态（不依赖 WebSocket 广播，确保队列昵称立即统一显示）
    try {
      state.value = await getState();
    } catch (e) {
      /* 忽略，WS 广播也会兜底 */
    }
    showToast(r.updated > 0 ? `已改名「${trimmed}」，队列 ${r.updated} 首同步更新` : `已改名「${trimmed}」`);
  } catch (e) {
    showToast('改名失败：' + e.message);
  }
}

const nextHint = computed(() => {
  const q = state.value.userQueue;
  if (q.length > 0) {
    const first = q[0];
    return `插播：${first.name}（${first.nickname || '匿名'}点的）`;
  }
  if (state.value.playSource === 'fm') return '接下来：✨ 心动FM 推荐（网易云）';
  const pm = state.value.playlistMeta;
  if (pm && pm.name) return `接下来：歌单 · ${pm.name}（网易云）`;
  return '';
});

onMounted(async () => {
  ensureNickname();
  try {
    state.value = await getState();
  } catch (e) {
    showToast('加载失败：' + e.message);
  }
  // 获取合并身份（同 IP 多号共享 canonicalId，用于删除/标记"我点的"）
  try {
    const me = await getMe();
    myCanonicalId.value = me.canonicalId || myClientId;
  } catch (e) {
    myCanonicalId.value = myClientId;
  }
  connectSocket((s) => (state.value = s));
});
</script>

<template>
  <div class="mx-auto flex h-dvh max-w-[1920px] gap-3 p-3">
    <!-- 左侧：榜单板块（宽屏容纳3列榜单不拥挤） -->
    <aside class="w-[34rem] shrink-0 overflow-y-auto rounded-2xl bg-slate-900/60 p-3">
      <ChartSidebar :channels="state.channels" @queue="doQueue" />
    </aside>

    <!-- 右侧：主功能区 -->
    <main class="flex min-w-0 flex-1 flex-col gap-3">
      <!-- 顶部栏 -->
      <header class="flex items-center justify-between px-1 pt-1">
        <h1 class="text-lg font-bold text-white">🎵 局域网点歌机</h1>
        <div class="flex items-center gap-2">
          <!-- 用户名组件：显示当前用户，点击修改 -->
          <button
            class="max-w-[10rem] truncate rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
            :title="'当前用户：' + myNickname"
            @click="doChangeNickname"
          >
            👤 {{ myNickname }} ✏️
          </button>
        </div>
      </header>

      <!-- 正在播放 -->
      <NowPlaying
        :current="state.current"
        :next-hint="nextHint"
        :skip-info="state.skip"
        :my-client-id="myClientId"
        @vote="doVote"
      />

      <!-- 点歌窗口 -->
      <SongSearch :channels="state.channels" @queue="doQueue" />

      <!-- 插播队列 -->
      <QueueList
        :queue="state.userQueue"
        :max="300"
        :playlist-hint="state.playlistMeta.name ? `歌单 ${state.playlistMeta.name}` : ''"
        :my-canonical-id="myCanonicalId"
        :boost-required="state.boostRequired || 3"
        :playback="state.playback"
        @remove="doRemove"
        @boost="doBoost"
      />
    </main>

    <!-- toast -->
    <Transition name="toast-enter">
      <div
        v-if="toast"
        class="toast-enter fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-700 px-4 py-2 text-sm text-white shadow-xl"
      >
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>
