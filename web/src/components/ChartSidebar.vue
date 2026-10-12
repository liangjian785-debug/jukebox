<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { getChartSongs } from '../api';

const emit = defineEmits(['queue']);
const props = defineProps({
  channels: { type: Object, default: () => ({ netease: true, qq: true }) },
});

// 平台 → 榜单列表（netease=歌单ID；qq=topId）
const CHARTS = {
  netease: [
    { id: 3778678, name: '热歌榜' },
    { id: 19723756, name: '飙升榜' },
    { id: 3779629, name: '新歌榜' },
    { id: 2884035, name: '原创榜' },
    { id: 991319582, name: '说唱榜' },
    { id: 1978921795, name: '电音榜' },
    { id: 2250011882, name: '抖音榜' },
    { id: 64016, name: '华语金曲榜' },
    { id: 2809513713, name: '欧美热歌榜' },
    { id: 2809577409, name: '欧美新歌榜' },
    { id: 5059644681, name: '日语榜' },
    { id: 745956260, name: '韩语榜' },
    { id: 71385702, name: 'ACG音乐榜' },
    { id: 71384707, name: '古典榜' },
    { id: 991319586, name: '民谣榜' },
    { id: 5059633707, name: '摇滚榜' },
    { id: 5059642708, name: '国风榜' },
    { id: 12225155968, name: '欧美R&B榜' },
    { id: 7095271308, name: '泰语榜' },
    { id: 6732051320, name: '俄语榜' },
    { id: 6732014811, name: '越南语榜' },
  ],
  qq: [
    { id: 26, name: '热歌榜' },
    { id: 62, name: '飙升榜' },
    { id: 27, name: '新歌榜' },
    { id: 4, name: '流行指数榜' },
    { id: 5, name: '内地榜' },
    { id: 3, name: '欧美榜' },
    { id: 16, name: '韩国榜' },
    { id: 17, name: '日本榜' },
    { id: 58, name: '说唱榜' },
    { id: 57, name: '电音榜' },
    { id: 60, name: '抖音热歌榜' },
    { id: 28, name: '网络歌曲榜' },
    { id: 67, name: '听歌识曲榜' },
  ],
};

const platform = ref('netease');
const activeId = ref(CHARTS.netease[0].id);
// charts[platform] = [{ id, name, count, topName, songs, loaded, error }]
const charts = reactive({ netease: [], qq: [] });
const loadingAll = ref(false);

function initList(p) {
  if (charts[p].length === 0) {
    charts[p] = CHARTS[p].map((c) => ({ ...c, count: 0, topName: '', songs: [], loaded: false, error: '' }));
  }
}

const activeChart = computed(() => {
  initList(platform.value);
  return charts[platform.value].find((c) => c.id === activeId.value) || charts[platform.value][0];
});

async function loadChart(p, chart) {
  if (chart.loaded) return;
  chart.loading = true;
  chart.error = '';
  try {
    const data = await getChartSongs(p, chart.id, 30);
    chart.count = data.count || 0;
    chart.topName = data.songs[0] ? data.songs[0].name : '';
    chart.songs = data.songs || [];
    chart.loaded = true;
  } catch (e) {
    chart.error = e.message;
  } finally {
    chart.loading = false;
  }
}

// 加载当前平台全部榜单（首次进入/切换平台时）
async function loadAll(p) {
  initList(p);
  loadingAll.value = true;
  await Promise.all(charts[p].map((c) => loadChart(p, c)));
  loadingAll.value = false;
}

const enabled = (p) => (p === 'qq' ? props.channels.qq !== false : props.channels.netease !== false);

function switchPlatform(p) {
  if (platform.value === p) return;
  if (!enabled(p)) return; // 渠道关闭：不可切换
  platform.value = p;
  initList(p);
  activeId.value = CHARTS[p][0].id;
  loadAll(p);
}

onMounted(() => {
  // 默认网易云；若网易云被关闭则切到 QQ
  if (!enabled('netease') && enabled('qq')) switchPlatform('qq');
  else loadAll('netease');
});

function fmt(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div class="chart-sidebar flex h-full flex-col">
    <!-- 标题 + 平台切换 -->
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="section-title">
        <span class="section-icon" aria-hidden="true">✧</span>
        <div><p class="section-kicker">CHARTS & DISCOVER</p><h2>发现新歌</h2></div>
      </div>
      <div class="platform-switch flex gap-1 rounded-lg p-0.5">
        <button
          class="platform-button rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="
            !enabled('netease')
              ? 'cursor-not-allowed bg-slate-800 text-slate-600 line-through'
              : platform === 'netease'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
          "
          :title="!enabled('netease') ? '网易云维护中' : ''"
          @click="switchPlatform('netease')"
        >
          🎵 网易云<span v-if="!enabled('netease')" class="ml-1 text-[9px] text-amber-400">维护中</span>
        </button>
        <button
          class="platform-button rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="
            !enabled('qq')
              ? 'cursor-not-allowed bg-slate-800 text-slate-600 line-through'
              : platform === 'qq'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
          "
          :title="!enabled('qq') ? 'QQ音乐维护中' : ''"
          @click="switchPlatform('qq')"
        >
          🐧 QQ音乐<span v-if="!enabled('qq')" class="ml-1 text-[9px] text-amber-400">维护中</span>
        </button>
      </div>
    </div>

    <!-- 榜单小模块（3列网格，全部展示，不滚动） -->
    <div class="chart-grid grid grid-cols-3 gap-2">
      <button
        v-for="c in charts[platform]"
        :key="c.id"
        class="chart-option rounded-lg p-2 text-left transition"
        :class="activeId === c.id ? 'bg-amber-500/15 ring-1 ring-amber-500' : 'bg-slate-800/70 hover:bg-slate-700/70'"
        @click="activeId = c.id"
      >
        <p class="truncate text-sm font-semibold" :class="activeId === c.id ? 'text-amber-400' : 'text-slate-200'">
          {{ c.name }}
        </p>
        <p class="mt-1 truncate text-[11px] text-slate-500">
          <template v-if="c.loaded">{{ c.count }}首 · 1.{{ c.topName || '—' }}</template>
          <template v-else-if="c.error">加载失败</template>
          <template v-else>…</template>
        </p>
      </button>
    </div>

    <!-- 选中榜单歌曲列表 -->
    <div class="chart-songs mt-3 flex min-h-0 flex-1 flex-col">
      <h3 class="chart-song-heading mb-1 px-1 text-xs font-semibold">
        {{ activeChart.name }} · 前 {{ activeChart.songs.length || 30 }} 首
      </h3>
      <ul v-if="activeChart.songs.length" class="chart-song-list min-h-0 flex-1 divide-y overflow-y-auto rounded-xl">
        <li v-for="(s, i) in activeChart.songs" :key="s.platform + '-' + s.songId" class="chart-song-row flex items-center gap-2.5 px-2.5 py-2">
          <span class="w-5 shrink-0 text-center text-xs font-bold" :class="i < 3 ? 'text-amber-400' : 'text-slate-500'">
            {{ i + 1 }}
          </span>
          <img v-if="s.cover" :src="s.cover" class="song-cover h-8 w-8 shrink-0 rounded object-cover" alt="" />
          <div v-else class="song-cover flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm">♫</div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-white">
              <span
                class="mr-1 rounded px-1 py-0.5 align-middle text-[9px] font-semibold"
                :class="s.platform === 'qq' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'"
              >
                {{ s.platform === 'qq' ? 'QQ' : '网易云' }}
              </span>
              {{ s.name }}
            </p>
            <p class="truncate text-[10px] text-slate-500">{{ s.artists.join(' / ') }} · {{ fmt(s.duration) }}</p>
          </div>
          <button
            class="chart-song-action shrink-0 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-emerald-500"
            @click="$emit('queue', s)"
          >
            点歌
          </button>
        </li>
      </ul>
      <p v-else class="chart-loading py-4 text-center text-xs">
        {{ loadingAll ? '榜单加载中…' : '暂无歌曲' }}
      </p>
    </div>
  </div>
</template>
