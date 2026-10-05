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
  <div class="rounded-2xl bg-slate-800/80 p-4 shadow-lg">
    <template v-if="current">
      <div class="flex items-center gap-4">
        <img
          v-if="current.cover"
          :src="current.cover"
          class="h-16 w-16 rounded-xl object-cover"
          alt="封面"
        />
        <div v-else class="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-700 text-2xl">🎵</div>
        <div class="min-w-0 flex-1">
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
          class="shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition"
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
      <p v-if="nextHint" class="mt-3 truncate border-t border-slate-700 pt-2 text-xs text-slate-400">
        ▼ {{ nextHint }}
      </p>
    </template>
    <div v-else class="flex items-center justify-center py-4 text-sm text-slate-500">
      暂无播放，等待点歌…
    </div>
  </div>
</template>
