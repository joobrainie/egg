<template>
  <div class="space-y-4">
    <div class="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
      <div class="flex-1">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target End Time</p>
        <p class="text-sm font-black text-slate-900 tracking-tight">{{ formattedTargetTime }}</p>
        <p v-if="timeRemaining !== null" class="text-[10px] font-bold text-purple-500 uppercase tracking-tight mt-1 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ formatDuration(timeRemaining) }} from current position
        </p>
      </div>
      <button
        @click="pushWait"
        class="relative overflow-hidden group/btn px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div class="relative z-10 flex items-center gap-2">
          <span>Wait</span>
          <svg class="w-4 h-4 transition-transform group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <div class="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
      </button>
    </div>
    
    <div class="px-4 py-3 bg-amber-50 rounded-xl border border-amber-100/50 flex gap-3">
        <svg class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-[10px] font-medium text-amber-700 leading-relaxed">
            This action will automatically adjust its duration if preceding actions are moved or modified, ensuring simulation ends exactly at the start of the next research sale.
        </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useActionsStore } from '@/stores/actions';
import { getEventInfo } from '@/lib/time';
import { formatDuration } from '@/lib/format';

const actionsStore = useActionsStore();

const nextSaleInfo = computed(() => {
    const lastTime = actionsStore.effectiveSnapshot.lastStepTime;
    return getEventInfo(lastTime);
});

const formattedTargetTime = computed(() => {
    const target = nextSaleInfo.value.nextResearchSaleStartTime;
    if (target === -1) return 'No sale found';
    
    // Convert simulation seconds to Date.
    // Assuming simulation seconds are relative to a start date, but we usually just show the time relative or as a string.
    // The lib/time uses absolute timestamps (Unix seconds).
    return new Date(target * 1000).toLocaleString(undefined, {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
});

const timeRemaining = computed(() => {
    const target = nextSaleInfo.value.nextResearchSaleStartTime;
    const current = actionsStore.effectiveSnapshot.lastStepTime;
    if (target === -1) return null;
    return target - current;
});

const pushWait = () => {
    actionsStore.pushWaitForResearchSale();
};
</script>
