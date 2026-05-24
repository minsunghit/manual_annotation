<script setup>
defineProps({
  assets: {
    type: Array,
    required: true,
  },
  selectedAssetId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['select-asset'])

function thumbStyle(asset) {
  const accent = Array.isArray(asset.accent) && asset.accent.length >= 2 ? asset.accent : ['#334155', '#64748b']
  return {
    background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`,
  }
}
</script>

<template>
  <aside class="asset-pane">
    <div class="asset-pane__header">
      <div>
        <h1>3D Assets</h1>
        <p>Objects extracted from pano-aligned reconstruction</p>
      </div>
      <span class="count-pill">{{ assets.length }} items</span>
    </div>

    <div class="search-box">
      <span class="search-box__icon">&#8981;</span>
      <span>Search asset / pano / category</span>
    </div>

    <div class="asset-list">
      <button
        v-for="asset in assets"
        :key="asset.id"
        class="asset-card"
        :class="{ 'asset-card--active': asset.id === selectedAssetId }"
        type="button"
        @click="emit('select-asset', asset.id)"
      >
        <img
          v-if="asset.previewUrl"
          class="asset-card__thumb asset-card__thumb-image"
          :src="asset.previewUrl"
          :alt="asset.name"
        />
        <div v-else class="asset-card__thumb" :style="thumbStyle(asset)">
          <div class="asset-card__thumb-shell"></div>
          <div class="asset-card__thumb-box"></div>
          <div class="asset-card__thumb-base"></div>
        </div>

        <div class="asset-card__meta">
          <div>
            <div class="asset-card__title">{{ asset.name }}</div>
            <div class="asset-card__pano">Pano: {{ asset.pano }}</div>
          </div>

          <div class="asset-card__footer">
            <span class="asset-tag" :class="{ 'asset-tag--active': asset.id === selectedAssetId }">
              {{ asset.category }}
            </span>
            <span class="asset-card__status">{{ asset.status }}</span>
          </div>
        </div>
      </button>
    </div>
  </aside>
</template>
