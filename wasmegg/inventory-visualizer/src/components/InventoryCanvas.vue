<template>
  <template v-if="inventoryIsEmpty">
    <p class="max-w-lg mx-auto text-center">Looks like you don't have any artifact :(</p>
  </template>
  <template v-else>
    <div class="flex justify-center mb-3" :class="loading ? 'opacity-50' : null">
      <div class="space-y-0.5">
        <div class="relative flex items-start">
          <div class="flex items-center h-5">
            <input
              id="rarerItemsFirst"
              v-model="rarerItemsFirst"
              name="rarerItemsFirst"
              type="checkbox"
              class="focus:ring-0 focus:ring-green-500 h-4 w-4 text-green-600 border-gray-300 rounded"
              :disabled="loading"
            />
          </div>
          <div class="ml-2 text-sm">
            <label for="rarerItemsFirst" class="text-gray-600">Rarer items first</label>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-col 2xl:flex-row items-start gap-6">
      <div class="w-full 2xl:w-1/2 min-w-0 flex-shrink-0">
        <template v-if="loading">
          <p class="max-w-lg mx-auto text-center text-sm text-gray-500">
            Generating image, this might take a while...<br />
            Note that this tool may not work in all browsers.
          </p>
        </template>
        <template v-else>
          <template v-if="error !== null">
            <p class="max-w-lg mx-auto text-center text-sm text-red-500">{{ error }}</p>
            <p class="max-w-lg mx-auto text-center text-sm text-gray-500">Maybe try another browser?</p>
          </template>
          <div v-else class="space-y-4">
            <p v-if="blockedByFirefoxPrivacyResistFingerprinting" class="text-xs text-red-500">
              Oops! Canvas to image functionality might have been sabotaged by your browser! Ignore this if the image looks
              normal. Otherwise, if you're using Firefox, you might have the
              <code>privacy.resistFingerprinting</code> setting turned on. Please check your browser address bar and look
              for a picture icon which you can click and grant "Extract canvas data" permission to this site. Reload after
              granting the permission.
            </p>
            <div class="flex items-center justify-center">
              <a
                :href="imageURL"
                download="inventory.png"
                class="inline-flex items-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Download Image
              </a>
            </div>
            <p class="max-w-lg mx-auto text-center text-xs text-gray-500">
              If the download button doesn't work, you may also right click / long press on the image below to use your
              browser's image saving function.
            </p>
            <div class="overflow-auto border rounded-lg bg-gray-50 p-2">
              <img :src="imageURL" :width="width / 2" :height="height / 2" class="block mx-auto max-w-none" />
            </div>
          </div>
        </template>
      </div>

      <div class="w-full 2xl:w-1/2 min-w-0 space-y-6">
        <div class="border rounded-lg overflow-hidden shadow-sm">
          <div class="px-4 py-2 text-sm font-bold text-green-900 bg-green-100 border-b">
            Edit Raw Data
          </div>
          <div class="p-4 bg-white space-y-2">
            <p class="text-xs text-gray-500">
              Edit the JSON below to modify the inventory before rendering. Changes will be reflected when you click
              "Apply".
            </p>
            <textarea
              v-model="gridJson"
              rows="30"
              class="w-full font-mono text-xs p-2 bg-gray-900 text-green-400 rounded-md border-gray-700 focus:ring-green-500 focus:border-green-500"
              spellcheck="false"
            ></textarea>
            <div v-if="jsonError" class="text-red-500 text-xs">{{ jsonError }}</div>
            <div class="flex space-x-2">
              <button
                class="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs"
                @click="applyJson"
              >
                Apply
              </button>
              <button
                class="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-xs"
                @click="resetGrid"
              >
                Reset
              </button>
              <button
                class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs"
                @click="formatJson"
              >
                Format
              </button>
            </div>
          </div>
        </div>

        <div class="border rounded-lg overflow-hidden shadow-sm">
          <div class="px-4 py-2 text-sm font-bold text-blue-900 bg-blue-100 border-b">
            Icon Reference
          </div>
          <div class="p-4 bg-white">
            <div class="grid grid-cols-1 gap-2 h-96 overflow-y-scroll p-1 border rounded shadow-inner">
              <div
                v-for="icon in validIcons"
                :key="icon"
                class="flex items-center space-x-2 p-1.5 border rounded bg-white hover:bg-gray-50 transition-colors"
              >
                <img :src="afxIconURL(icon)" class="w-8 h-8 flex-shrink-0" />
                <code class="text-[10px] flex-1 truncate bg-gray-100 p-1 rounded border">{{ icon }}</code>
                <button
                  class="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-colors"
                  title="Copy path"
                  @click="copyToClipboard(icon)"
                >
                  <duplicate-icon class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <canvas ref="canvasRef" class="hidden"></canvas>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, PropType, ref, toRefs, watch } from 'vue';
import { DuplicateIcon } from '@heroicons/vue/solid';

import { allPossibleTiers, getLocalStorage, Inventory, setLocalStorage } from 'lib';
import { afxIconURL, drawInventory, generateInventoryGrid, InventoryGrid } from '@/lib';

const props = defineProps({
  inventory: {
    type: Object as PropType<Inventory>,
    required: true,
  },
});
const { inventory } = toRefs(props);
const RARER_ITEMS_FIRST_LOCALSTORAGE_KEY = 'rarerItemsFirst';
const rarerItemsFirst = ref(getLocalStorage(RARER_ITEMS_FIRST_LOCALSTORAGE_KEY) !== 'false');
watch(rarerItemsFirst, () => setLocalStorage(RARER_ITEMS_FIRST_LOCALSTORAGE_KEY, rarerItemsFirst.value));
const grid = ref<InventoryGrid>([]);
const gridJson = ref('');
const jsonError = ref<string | null>(null);

const syncGrid = () => {
  grid.value = generateInventoryGrid(inventory.value as Inventory, {
    rarerItemsFirst: rarerItemsFirst.value,
  });
  gridJson.value = JSON.stringify(simplifyGrid(grid.value), null, 2);
  jsonError.value = null;
};

const simplifyGrid = (g: InventoryGrid) => {
  return g.map(item => ({
    afxRarity: item.afxRarity,
    iconPath: item.iconPath,
    count: item.count,
    stones: item.stones.map(stone => ({ iconPath: stone.iconPath })),
  }));
};

const validIcons = computed(() =>
  allPossibleTiers
    .map(t => `egginc/${t.icon_filename}`)
    .filter(path => path.startsWith('egginc/afx_') && path.endsWith('.png'))
    .sort()
);

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

watch([inventory, rarerItemsFirst], syncGrid, { immediate: true });

const applyJson = () => {
  try {
    const parsed = JSON.parse(gridJson.value);
    if (!Array.isArray(parsed)) {
      throw new Error('Root must be an array');
    }
    let newGrid = parsed as InventoryGrid;
    if (rarerItemsFirst.value) {
      newGrid.sort((i1, i2) => i2.afxRarity - i1.afxRarity);
    }
    grid.value = newGrid;
    gridJson.value = JSON.stringify(simplifyGrid(grid.value), null, 2);
    jsonError.value = null;
  } catch (err) {
    jsonError.value = err instanceof Error ? err.message : `${err}`;
  }
};

const resetGrid = () => {
  syncGrid();
};

const formatJson = () => {
  try {
    gridJson.value = JSON.stringify(JSON.parse(gridJson.value), null, 2);
    jsonError.value = null;
  } catch (err) {
    jsonError.value = err instanceof Error ? err.message : `${err}`;
  }
};

const inventoryIsEmpty = computed(() => grid.value.length === 0);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loading = ref(false);
const imageURL = ref('');
const width = ref(0);
const height = ref(0);
const blockedByFirefoxPrivacyResistFingerprinting = ref(false);
const error = ref<Error | null>(null);

const regenerate = async () => {
  loading.value = true;
  imageURL.value = '';
  blockedByFirefoxPrivacyResistFingerprinting.value = true;
  error.value = null;
  try {
    const result = await drawInventory(canvasRef.value!, grid.value);
    imageURL.value = result.url;
    width.value = result.width;
    height.value = result.height;
    blockedByFirefoxPrivacyResistFingerprinting.value = result.blockedByFirefoxPrivacyResistFingerprinting;
    if (await imageIsEmpty(imageURL.value)) {
      error.value = new Error('unknown error occurred, generated canvas is empty');
    }
  } catch (err) {
    error.value = err instanceof Error ? err : new Error(`${err}`);
  }
  loading.value = false;
};

onMounted(() => {
  regenerate();

  // Expose to window for console editing
  (window as any).getInventoryGrid = () => grid.value;
  (window as any).setInventoryGrid = (newGrid: InventoryGrid) => {
    grid.value = newGrid;
    gridJson.value = JSON.stringify(simplifyGrid(newGrid), null, 2);
  };
  (window as any).resetInventoryGrid = resetGrid;
});

watch(grid, regenerate, { deep: true });

async function imageIsEmpty(url: string): Promise<boolean> {
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
  } catch (err) {
    console.log(`failed to load image into HTMLImageElement: ${err}`);
    return false;
  }
  return image.naturalWidth === 0 || image.naturalHeight === 0;
}
</script>
