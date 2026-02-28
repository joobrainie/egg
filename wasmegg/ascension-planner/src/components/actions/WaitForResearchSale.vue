<template>
  <div class="space-y-4">
    <div class="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-xl space-y-2">
      <div class="flex items-center gap-2 text-indigo-700">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-xs font-bold uppercase tracking-tight">Next Scheduled Sale</span>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="text-2xl font-black text-indigo-900 tabular-nums">{{ nextSaleDuration }}</span>
        <span class="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">until 9:00 AM Friday</span>
      </div>
      <p class="text-[11px] text-indigo-600/70 leading-relaxed">
        This action will wait until the exact start of the next research sale. Its duration will dynamically adjust if preceding actions move.
      </p>
    </div>

    <button
      class="w-full btn-premium py-3 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100"
      @click="handleAddWaitAction"
    >
      Add Wait Action
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useActionsStore } from '@/stores/actions';
import { getResearchSaleWindow } from '@/lib/time';
import { formatDuration } from '@/lib/format';
import { generateActionId } from '@/types';

const actionsStore = useActionsStore();

const nextSaleTimeMs = computed(() => {
  const nowMs = actionsStore.effectiveSnapshot.lastStepTime * 1000;
  return getResearchSaleWindow(nowMs)[0];
});

const nextSaleDuration = computed(() => {
  const nowMs = actionsStore.effectiveSnapshot.lastStepTime * 1000;
  const diffSec = Math.max(0, (nextSaleTimeMs.value - nowMs) / 1000);
  return formatDuration(diffSec);
});

function handleAddWaitAction() {
  const nowMs = actionsStore.effectiveSnapshot.lastStepTime * 1000;
  const durationSec = (nextSaleTimeMs.value - nowMs) / 1000;
  
  if (durationSec <= 0) return;

  const payload = {
    totalTimeSeconds: durationSec,
    targetTimestamp: nextSaleTimeMs.value / 1000,
  };

  actionsStore.pushAction({
    id: generateActionId(),
    timestamp: Date.now(),
    type: 'wait_for_time',
    payload,
    cost: 0,
  });
}
</script>
