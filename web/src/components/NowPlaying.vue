<script setup>
import { computed } from 'vue';

const props = defineProps({
  current: { type: Object, default: null },
  nextHint: { type: String, default: '' },
  skipInfo: { type: Object, default: () => ({ votes: 0, required: 8, voters: [] }) },
  myClientId: { type: String, default: '' },
});
defineEmits(['vote']);

const voted = computed(() => props.myClientId && props.skipInfo.voters.includes(props.myClientId));
const reached = computed(() => props.skipInfo.votes >= props.skipInfo.required);

function fmt(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div class="now-playing-card">
    <template v-if="current">
      <div class="flex items-center gap-4">
        <img
          v-if="current.cover"
          :src="current.cover"
          class="now-playing-cover h-16 w-16 rounded-xl object-cover"
          alt="封面"
        />
        <div v-else class="now-playing-cover flex h-16 w-16 items-center justify-center rounded-xl text-2xl">♫</div>
        <div class="min-w-0 flex-1">
          <p class="section-kicker">NOW PLAYING</p>
          <p class="truncate text-lg font-bold text-white">{{ current.name }}</p>
          <p class="truncate text-sm text-slate-400">{{ current.artists.join(' / ') }}</p>
          <p class="mt-0.5 text-xs text-slate-500">
            正在播放{{ fmt(current.duration) }}
            <span v-if="current.nickname && current.nickname !== '匿名'" class="ml-1 text-amber-400">
              · {{ current.nickname }} 点的
            </span>
          </p>
        </div>
        <!-- 投票跳过按钮 -->
        <button
          class="vote-button shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition"
          :class="
            reached
              ? 'bg-slate-600/50 text-slate-400 cursor-not-allowed'
              : voted
                ? 'bg-emerald-600/80 text-white'
                : 'bg-slate-600 text-white hover:bg-slate-500 active:bg-slate-500'
          "
          :disabled="reached"
          @click="$emit('vote')"
        >
          {{ reached ? `已跳过 ${skipInfo.votes}/${skipInfo.required}` : voted ? `已投票 ${skipInfo.votes}/${skipInfo.required}` : `跳过投票 ${skipInfo.votes}/${skipInfo.required}` }}
        </button>
      </div>
      <p v-if="nextHint" class="next-hint mt-3 truncate border-t pt-2 text-xs">
        <span aria-hidden="true">↗</span> {{ nextHint }}
      </p>
    </template>
    <div v-else class="player-empty flex items-center justify-center py-4 text-sm">
      <span class="empty-disc" aria-hidden="true">♫</span>
      <span><b class="section-kicker">YOUR MUSIC ROOM</b><br />暂无播放，等待点歌…</span>
    </div>
  </div>
</template>
