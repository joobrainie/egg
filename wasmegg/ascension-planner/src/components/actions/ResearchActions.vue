<template>
  <div class="space-y-4">
    <ResearchSaleToggle 
      :is-active="isResearchSaleActive" 
      :is-disabled="isInsideResearchEventWindow"
      @toggle="handleToggleSale" 
    />

    <SmartBuy 
      v-model:always-on="smartBuyState.alwaysOn"
      @buy="handleSmartBuy" 
      @update="state => smartBuyState = state" 
    />

    <ResearchViewSelector 
      v-model="currentView" 
      :views="VIEWS" 
    />

    <p class="text-sm text-gray-500 mb-4 px-1">
      {{ viewDescription }}
    </p>

    <!-- Sale Lookahead -->
    <div v-if="timeUntilNextSale !== null && !isResearchSaleActive" class="px-5 py-4 bg-purple-50 rounded-2xl border border-purple-100 flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white border border-purple-200 shadow-sm flex items-center justify-center p-2">
                <img :src="iconURL('egginc/icon_sale.png', 64)" class="w-full h-full object-contain" />
            </div>
            <div>
                <p class="text-[10px] font-black text-purple-400 uppercase tracking-widest leading-none mb-1.5">Next Research Sale</p>
                <p class="text-sm font-black text-purple-900 leading-none">In {{ formatDuration(timeUntilNextSale) }}</p>
            </div>
        </div>
        <button v-if="timeUntilNextSale > 0" @click="actionsStore.pushWaitForResearchSale()" class="text-[10px] font-black text-purple-600 uppercase tracking-widest hover:text-purple-800 transition-colors bg-purple-100/50 px-3 py-2 rounded-lg">
            Wait for Sale
        </button>
    </div>

    <!-- ROI Alert (Only if sale is starting soon) -->
    <div v-if="showROIAlert" class="px-5 py-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-4 mb-4 animate-in fade-in slide-in-from-top-4 duration-500">
        <div class="w-10 h-10 rounded-xl bg-white border border-amber-200 shadow-sm flex items-center justify-center p-2 text-amber-500 scale-110">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <div>
            <p class="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1.5">Efficiency Alert</p>
            <p class="text-[11px] font-bold text-amber-900 leading-relaxed">A research sale starts in <span class="text-amber-600">{{ timeUntilNextSale !== null ? formatDuration(timeUntilNextSale) : '' }}</span>. Purchasing now might be inefficient.</p>
        </div>
    </div>

    <!-- Game View (Grouped by Tier) -->
    <ResearchGameView
      v-if="currentView === 'game'"
      :tiers="tiers"
      :research-by-tier="researchByTier"
      :tier-summaries="tierSummaries"
      :view-times="gameViewTimes"
      :levels="commonResearchStore.researchLevels"
      :get-research-price="getNextLevelPrice"
      :get-research-time-to-buy="getTimeToBuy"
      :get-research-time-to-buy-seconds="getTimeToBuySeconds"
      @buy="handleBuyResearch"
      @max="handleMaxResearch"
      @max-tier="handleMaxTier"
    />

    <!-- Flat/Sorted Views -->
    <ResearchFlatView
      v-else
      :sorted-researches="sortedResearches"
      :view="currentView"
      :thresholds="TIER_THRESHOLDS"
      :get-research-time-to-buy="getTimeToBuy"
      :get-research-time-to-buy-seconds="getTimeToBuySeconds"
      @buy="handleBuyResearch"
      @max="handleMaxResearch"
      @buy-to-here="handleBuyToHere"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  getDiscountedVirtuePrice,
  getCommonResearches,
  isTierUnlocked,
  type CommonResearch,
} from '@/calculations/commonResearch';
import { formatDuration } from '@/lib/format';
import { useCommonResearchStore } from '@/stores/commonResearch';
import { useActionsStore } from '@/stores/actions';
import { useSalesStore } from '@/stores/sales';
import { computeDependencies } from '@/lib/actions/executor';
import { generateActionId } from '@/types';
import { useActionExecutor } from '@/composables/useActionExecutor';
import { useResearchViews, VIEWS } from '@/composables/useResearchViews';
import { getTimeToSave } from '@/engine/apply';
import { iconURL } from 'lib';
import { getEventInfo } from '@/lib/time';

// Sub-components
import ResearchSaleToggle from './ResearchSaleToggle.vue';
import SmartBuy from './SmartBuy.vue';
import ResearchViewSelector from './ResearchViewSelector.vue';
import ResearchGameView from './ResearchGameView.vue';
import ResearchFlatView from './ResearchFlatView.vue';

const commonResearchStore = useCommonResearchStore();
const actionsStore = useActionsStore();
const salesStore = useSalesStore();
const { prepareExecution, completeExecution, batch } = useActionExecutor();

const smartBuyState = ref({ threshold: 0, alwaysOn: false });
let isSmartBuying = false;

const isInsideResearchEventWindow = computed(() => {
  const currentSimTime = actionsStore.effectiveSnapshot.lastStepTime || Math.floor(Date.now() / 1000);
  const info = getEventInfo(currentSimTime);
  return info.isResearchSaleActive;
});

const timeUntilNextSale = computed(() => {
    const currentSimTime = actionsStore.effectiveSnapshot.lastStepTime;
    const info = getEventInfo(currentSimTime);
    if (info.isResearchSaleActive) return null;
    return info.nextResearchSaleStartTime - currentSimTime;
});

const showROIAlert = computed(() => {
    if (isResearchSaleActive.value) return false;
    if (timeUntilNextSale.value === null) return false;
    // Show alert if sale is within 24 hours
    return timeUntilNextSale.value < 24 * 3600;
});

const {
  currentView,
  viewDescription,
  costModifiers,
  isResearchSaleActive,
  tiers,
  researchByTier,
  tierSummaries,
  gameViewTimes,
  sortedResearches,
  TIER_THRESHOLDS,
} = useResearchViews();

function getNextLevelPrice(research: CommonResearch): number {
  const currentLevel = commonResearchStore.researchLevels[research.id] || 0;
  if (currentLevel >= research.levels) return 0;
  return getDiscountedVirtuePrice(research, currentLevel, costModifiers.value, isResearchSaleActive.value);
}

function getTimeToBuy(research: CommonResearch): string {
  const price = getNextLevelPrice(research);
  const seconds = getTimeToSave(price, actionsStore.effectiveSnapshot);
  if (seconds <= 0) return '0s';
  if (seconds === Infinity) return '∞';
  return formatDuration(seconds);
}

function getTimeToBuySeconds(research: CommonResearch): number {
  const price = getNextLevelPrice(research);
  return getTimeToSave(price, actionsStore.effectiveSnapshot);
}

/**
 * Buy a single level of research and create the action.
 * Returns true if successful, false if already maxed.
 */
function buyOneLevel(research: CommonResearch): boolean {
  const currentLevel = commonResearchStore.researchLevels[research.id] || 0;
  if (currentLevel >= research.levels) return false;

  // Prepare execution (restores stores if editing past group)
  const beforeSnapshot = prepareExecution();

  // Calculate cost based on current state (after restore if editing)
  const effectiveLevel = beforeSnapshot.researchLevels[research.id] || 0;
  const isSaleActive = beforeSnapshot.activeSales.research;
  const cost = getDiscountedVirtuePrice(research, effectiveLevel, costModifiers.value, isSaleActive);

  // Build payload
  const payload = {
    researchId: research.id,
    fromLevel: effectiveLevel,
    toLevel: effectiveLevel + 1,
  };

  // Compute dependencies (level N depends on the action that bought level N-1)
  const dependencies = computeDependencies('buy_research', payload, actionsStore.actionsBeforeInsertion, actionsStore.initialSnapshot.researchLevels);

  // Apply to store
  commonResearchStore.setResearchLevel(research.id, effectiveLevel + 1);

  // Complete execution (computes snapshot, inserts/pushes action, replays if needed)
  completeExecution({
    id: generateActionId(),
    timestamp: Date.now(),
    type: 'buy_research',
    payload,
    cost,
    dependsOn: dependencies,
  }, beforeSnapshot);

  // Trigger automated sweep if Always On is enabled
  if (!isSmartBuying && smartBuyState.value.alwaysOn) {
    handleSmartBuy(smartBuyState.value.threshold);
  }

  return true;
}

// Automatically sweep when Always On is toggled on
watch(() => smartBuyState.value.alwaysOn, (newVal) => {
  if (newVal && !isSmartBuying) {
    handleSmartBuy(smartBuyState.value.threshold);
  }
});

function handleBuyResearch(research: CommonResearch) {
  buyOneLevel(research);
}

function handleSmartBuy(threshold: number) {
  if (isSmartBuying) return;
  isSmartBuying = true;

  batch(() => {
    try {
        let itemBought = true;
        // Limit iterations to prevent infinite loops in edge cases
        let iterations = 0;
        const maxIterations = 2500;

        while (itemBought && iterations < maxIterations) {
        itemBought = false;
        iterations++;

        const all = getCommonResearches();
        const levels = commonResearchStore.researchLevels;
        const snapshot = actionsStore.effectiveSnapshot;
        const earnings = snapshot.offlineEarnings;
        const isSale = isResearchSaleActive.value;
        const mods = costModifiers.value;

        if (earnings <= 0) break;

        // Filter for unpurchased and unlocked
        // We only care about the very next level of each research
        const candidates = all.filter(r => {
        const level = levels[r.id] || 0;
        return level < r.levels && isTierUnlocked(levels, r.tier);
        }).map(r => {
        const level = levels[r.id] || 0;
        const price = getDiscountedVirtuePrice(r, level, mods, isSale);
        return {
            research: r,
            price,
            seconds: getTimeToSave(price, snapshot)
        };
        });

        // Sort by price (Cheapest First order)
        candidates.sort((a, b) => a.price - b.price);

        // Find the first one below threshold
        const found = candidates.find(c => c.seconds <= threshold);
        if (found) {
            if (buyOneLevel(found.research)) {
                itemBought = true;
            }
        }
        }
    } finally {
        isSmartBuying = false;
    }
  });
}

function handleMaxResearch(research: CommonResearch) {
  batch(() => {
    const maxLevel = research.levels;
    while ((commonResearchStore.researchLevels[research.id] || 0) < maxLevel) {
        if (!buyOneLevel(research)) break;
    }
  });
}

function handleMaxTier(tier: number) {
  batch(() => {
    const researches = researchByTier.value.get(tier) || [];
    for (const research of researches) {
        const maxLevel = research.levels;
        while ((commonResearchStore.researchLevels[research.id] || 0) < maxLevel) {
        if (!buyOneLevel(research)) break;
        }
    }
  });
}

function handleBuyToHere(index: number) {
  batch(() => {
    const list = sortedResearches.value;
    if (index < 0 || index >= list.length) return;

    for (let i = 0; i <= index; i++) {
        const item = list[i];
        buyOneLevel(item.research);
    }
  });
}

function handleToggleSale() {
  const beforeSnapshot = prepareExecution();
  const currentlyActive = beforeSnapshot.activeSales.research;

  const payload = {
    saleType: 'research' as const,
    active: !currentlyActive,
    multiplier: 0.3, // 70% off
  };

  // Update store state
  salesStore.setSaleActive('research', !currentlyActive);

  // Deactivate Smart Buy Always On whenever a sale is toggled
  smartBuyState.value.alwaysOn = false;

  completeExecution({
    id: generateActionId(),
    timestamp: Date.now(),
    type: 'toggle_sale',
    payload,
    cost: 0,
    dependsOn: computeDependencies('toggle_sale', payload, actionsStore.actionsBeforeInsertion, actionsStore.initialSnapshot.researchLevels),
  }, beforeSnapshot);
}
</script>
