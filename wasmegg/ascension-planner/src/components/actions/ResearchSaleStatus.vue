<template>
  <div v-if="isCuriosity" class="flex flex-col items-center gap-2 mb-4">
    <!-- Active Event Slide Toggle (Research Sale) -->
    <div class="w-full max-w-sm bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/80 rounded-2xl p-4 border border-indigo-100/50 shadow-sm relative overflow-hidden flex items-center justify-between transition-all duration-300">
      <div class="flex items-center gap-2 relative z-10">
        <div class="flex flex-col gap-0.5 text-left">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Friday 70% Research Sale</span>
          </div>
          <span class="text-[11px] font-black text-indigo-600 uppercase tracking-tighter">
            {{ isResearchSaleActive ? 'Active' : 'Inactive' }}
          </span>
        </div>
      </div>

      <button
        @click="handleToggleResearchSale"
        class="relative inline-flex h-5 w-10 items-center rounded-full transition-all duration-300 focus:outline-none shadow-inner"
        :class="[
          isResearchSaleActive ? 'bg-indigo-500' : 'bg-slate-200',
          isScheduledResearchSale ? 'opacity-50 cursor-not-allowed' : ''
        ]"
        :disabled="isScheduledResearchSale"
      >
        <span
          class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-all duration-300 shadow-sm"
          :class="isResearchSaleActive ? 'translate-x-[22px]' : 'translate-x-1'"
        />
      </button>
    </div>
    
    <!-- Research Sale Status Row -->
    <div class="w-full max-w-sm mt-1 bg-white/50 backdrop-blur-sm rounded-xl px-4 py-2 border border-indigo-100/30 flex items-center justify-between transition-all hover:bg-white/80">
      <div class="flex items-center gap-3">
        <div :class="['w-1.5 h-1.5 rounded-full', isResearchSaleActive ? 'bg-violet-400 animate-pulse' : 'bg-slate-300']"></div>
        <div class="flex flex-col">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Global Schedule</span>
          <span :class="['text-[10px] font-bold uppercase tracking-tight', isResearchSaleActive ? 'text-violet-600' : 'text-slate-500']">
            {{ isResearchSaleActive ? '70% Sale Active' : 'Scheduled Friday' }}
          </span>
        </div>
      </div>
      <div 
        v-if="isResearchSaleActive" 
        class="px-1.5 py-0.5 rounded bg-violet-500 text-white text-[8px] font-black uppercase tracking-widest shadow-sm"
      >
        LIVE
      </div>
      <div v-else class="text-[10px] font-mono font-bold text-slate-400">
        {{ formatDate(nextSaleStart) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useActionsStore } from '@/stores/actions';
import { useVirtueStore } from '@/stores/virtue';
import { getResearchSaleWindow, isResearchSaleActiveAt } from '@/lib/time';
import { useSalesStore } from '@/stores/sales';
import { useActionExecutor } from '@/composables/useActionExecutor';
import { computeDependencies } from '@/lib/actions/executor';
import { generateActionId } from '@/types';

const props = defineProps<{
  isResearchSaleActive: boolean;
  nextEventInfo: {
    researchSale: { active: boolean, nextStart: number, nextEnd: number },
  };
}>();

const actionsStore = useActionsStore();
const virtueStore = useVirtueStore();
const salesStore = useSalesStore();
const { prepareExecution, completeExecution } = useActionExecutor();

const isCuriosity = computed(() => actionsStore.effectiveSnapshot.currentEgg === 'curiosity');

const isScheduledResearchSale = computed(() => isResearchSaleActiveAt(actionsStore.effectiveSnapshot.lastStepTime * 1000));

const nextSaleStart = computed(() => {
    const nowMs = actionsStore.effectiveSnapshot.lastStepTime * 1000;
    const [start] = getResearchSaleWindow(nowMs);
    return start;
});

// Lookahead predictions (if the very next action would benefit from a sale/boost)
const isSalePredicted = computed(() => {
    // We could check if any research is predicted, but for now just a simple "soon" indicator
    return false; // Could be enhanced
});


function formatDate(timestampMs: number): string {
    const date = new Date(timestampMs);
    return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: virtueStore.ascensionTimezone 
    });
}

function handleToggleResearchSale() {
  if (isScheduledResearchSale.value) return;

  const beforeSnapshot = prepareExecution();
  const currentlyActive = beforeSnapshot.activeSales.research;
  
  const payload = {
    saleType: 'research' as const,
    active: !currentlyActive,
    multiplier: !currentlyActive ? 0.3 : 1.0,
  };

  // Update store state
  salesStore.setSaleActive('research', payload.active);

  completeExecution({
    id: generateActionId(),
    timestamp: Date.now(),
    type: 'toggle_sale',
    payload,
    cost: 0,
    dependsOn: computeDependencies('toggle_sale', payload, actionsStore.actionsBeforeInsertion, actionsStore.initialSnapshot.researchLevels),
    startState: beforeSnapshot,
  }, beforeSnapshot);
}
</script>
