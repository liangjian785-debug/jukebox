<script setup>
import { computed } from 'vue';
import { getClientId } from '../api';

const props = defineProps({
  queue: { type: Array, default: () => [] },
  max: { type: Number, default: 300 },
  playlistHint: { type: String, default: '' },
  myCanonicalId: { type: String, default: '' }, // 当前用户的合并身份（同IP多个号共享）
  boostRequired: { type: Number, default: 3 }, // 顶歌所需次数
  playback: { type: Object, default: null }, // 播放核算 {queueTotalSec, totalRemainSec, estimatedEndAt}
});
defineEmits(['remove', 'boost']);

const myId = getClientId();
const isMine = (item) =>
  !!(item.canonicalId && props.myCanonicalId && item.canonicalId === props.myCanonicalId);
const boosted = (item) =>
  !!(props.myCanonicalId && (item.boostVoters || []).includes(props.myCanonicalId));

function fmtDur(sec) {
  if (!sec && sec !== 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 插播区总时长（含当前正在播的那首？不含——queueTotalSec 是队列；totalRemainSec 含当前曲剩余）
const infoLine = computed(() => {
  const p = props.playback;
  const parts = [];
  const qSec = p && p.queueTotalSec;
  if (qSec > 0) parts.push(`总时长 ${fmtDur(qSec)}`);
  if (p && p.estimatedEndAt) {
    const d = new Date(p.estimatedEndAt);
    const pad = (n) => String(n).padStart(2, '0');
    parts.push(`预计 ${pad(d.getHours())}:${pad(d.getMinutes())} 播完`);
  }
  return parts.join(' · ');
});
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between px-1">
      <h3 class="text-sm font-semibold text-slate-300">
        插播队列 <span class="text-slate-500">({{ queue.length }}/{{ max }})</span>
      </h3>
      <span class="max-w-[50%] truncate text-xs text-slate-500">
        {{ infoLine }}
      </span>
    </div>

    <ul v-if="queue.length" class="divide-y divide-slate-800 rounded-xl bg-slate-800/50">
      <li v-for="(item, i) in queue" :key="item.songId + '-' + i" class="flex items-center gap-3 px-3 py-2.5">
        <span class="w-5 shrink-0 text-center text-xs text-slate-500">{{ i + 1 }}</span>
        <img v-if="item.cover" :src="item.cover" class="h-9 w-9 shrink-0 rounded-lg object-cover" alt="" />
        <div v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-base">🎵</div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-white">
            <span
              class="mr-1 rounded px-1 py-0.5 align-middle text-[10px] font-semibold"
              :class="item.platform === 'qq' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'"
            >
              {{ item.platform === 'qq' ? 'QQ' : '网易云' }}
            </span>
            {{ item.name }}
          </p>
          <p class="truncate text-xs text-slate-400">
            <span v-if="item.artists && item.artists.length">{{ item.artists.join(' / ') }} · </span>
            {{ item.nickname || '匿名' }}
            <span v-if="isMine(item)" class="ml-1 text-emerald-400">(我点的)</span>
          </p>
        </div>
        <!-- 顶歌按钮 -->
        <button
          class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
          :class="
            boosted(item)
              ? 'cursor-not-allowed bg-amber-500/20 text-amber-400'
              : 'bg-slate-700 text-slate-300 hover:bg-amber-500/30 hover:text-amber-300'
          "
          :disabled="boosted(item)"
          :title="boosted(item) ? '你已顶过这首歌' : '顶歌：达到 ' + boostRequired + ' 次升到第一'"
          @click="$emit('boost', item.platform || 'netease', item.songId)"
        >
          {{ boosted(item) ? '已顶' : '🔥顶' }} {{ item.boostCount || 0 }}/{{ boostRequired }}
        </button>
        <button
          v-if="isMine(item)"
          class="shrink-0 rounded-lg bg-red-600/80 px-2.5 py-1.5 text-xs font-medium text-white active:bg-red-500"
          @click="$emit('remove', item.platform || 'netease', item.songId)"
        >
          删除
        </button>
      </li>
    </ul>
    <p v-else class="rounded-xl bg-slate-800/30 py-4 text-center text-xs text-slate-600">
      队列空 — 搜一首歌点起来吧
    </p>
  </div>
</template>
