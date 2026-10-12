<script setup>
import { ref } from 'vue';
import { search } from '../api';

const emit = defineEmits(['queue']);
const props = defineProps({
  channels: { type: Object, default: () => ({ netease: true, qq: true }) },
});

const PLATFORMS = [
  { id: 'netease', label: '🎵 网易云' },
  { id: 'qq', label: '🐧 QQ音乐' },
];
const platform = ref('netease');
const keyword = ref('');
const results = ref([]);
const searching = ref(false);
const error = ref('');
let timer = null;

const enabled = (p) => (p === 'qq' ? props.channels.qq !== false : props.channels.netease !== false);

function onInput() {
  clearTimeout(timer);
  const kw = keyword.value.trim();
  if (!kw) {
    results.value = [];
    return;
  }
  timer = setTimeout(async () => {
    searching.value = true;
    error.value = '';
    try {
      const data = await search(kw, 30, platform.value);
      results.value = data.songs || [];
    } catch (e) {
      error.value = e.message;
      results.value = [];
    } finally {
      searching.value = false;
    }
  }, 300);
}

function switchPlatform(p) {
  if (platform.value === p) return;
  if (!enabled(p)) {
    error.value = (p === 'qq' ? 'QQ音乐' : '网易云') + '渠道维护中，暂时不可用';
    return;
  }
  platform.value = p;
  results.value = [];
  error.value = '';
  if (keyword.value.trim()) onInput(); // 切换平台立即重新搜索
}

function fmt(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div class="search-card">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="section-title">
        <span class="section-icon" aria-hidden="true">⌕</span>
        <div><p class="section-kicker">FIND YOUR NEXT SONG</p><h2>点歌</h2></div>
      </div>
      <!-- 平台切换 -->
      <div class="platform-switch flex gap-1 rounded-lg p-0.5">
        <button
          v-for="p in PLATFORMS"
          :key="p.id"
          class="platform-button rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="
            !enabled(p.id)
              ? 'cursor-not-allowed bg-slate-800 text-slate-600 line-through'
              : platform === p.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
          "
          :title="!enabled(p.id) ? p.label + ' 维护中' : ''"
          @click="switchPlatform(p.id)"
        >
          {{ p.label }}
          <span v-if="!enabled(p.id)" class="ml-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-400">维护中</span>
        </button>
      </div>
    </div>
    <div class="relative">
      <input
        v-model="keyword"
        type="search"
        :placeholder="'搜索 ' + (platform === 'qq' ? 'QQ音乐' : '网易云') + ' 歌曲 / 歌手…'"
        class="search-input w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2"
        @input="onInput"
      />
      <span v-if="searching" class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
        搜索中…
      </span>
    </div>

    <p v-if="error" class="mt-2 text-xs text-red-400">{{ error }}</p>

    <ul v-if="results.length" class="search-results mt-2 max-h-[30vh] divide-y overflow-y-auto rounded-xl">
      <li v-for="s in results" :key="s.platform + '-' + s.songId" class="song-result flex items-center gap-3 px-3 py-2.5">
        <img v-if="s.cover" :src="s.cover" class="song-cover h-10 w-10 shrink-0 rounded-lg object-cover" alt="" />
        <div v-else class="song-cover flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg">♫</div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-white">
            <span
              class="mr-1 rounded px-1 py-0.5 align-middle text-[10px] font-semibold"
              :class="s.platform === 'qq' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'"
            >
              {{ s.platform === 'qq' ? 'QQ' : '网易云' }}
            </span>
            {{ s.name }}
          </p>
          <p class="truncate text-xs text-slate-400">{{ s.artists.join(' / ') }} · {{ fmt(s.duration) }}</p>
        </div>
        <button
          class="song-action shrink-0 rounded-lg px-3 py-2 text-sm font-medium active:bg-emerald-500"
          @click="$emit('queue', s)"
        >
          点歌
        </button>
      </li>
    </ul>
    <p v-else-if="keyword.trim() && !searching" class="mt-2 text-center text-xs text-slate-600">
      无结果，试试其他关键词
    </p>
  </div>
</template>
