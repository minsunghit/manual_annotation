<script setup>
defineProps({
  selectedAsset: {
    type: Object,
    required: true,
  },
  selectedViews: {
    type: Array,
    required: true,
  },
  statusChips: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['toggle-view'])

const assetMetrics = [
  { label: 'Category', key: 'category' },
  { label: 'Pose', value: 'yaw 14°' },
  { label: 'Height', value: '0.86m' },
  { label: 'Anchor', value: 'floor contact' },
]

function metricValue(metric, selectedAsset) {
  if (metric.key) {
    return selectedAsset[metric.key]
  }
  return metric.value
}
</script>

<template>
  <section class="annotation-panel">
    <div class="annotation-panel__header">
      <div>
        <h2>Placement Workspace</h2>
        <p>Align furniture against reconstructed room geometry</p>
      </div>

      <div class="annotation-panel__controls">
        <div class="metric-pill">Room scale 1.00m</div>
        <div class="tab-switcher">
          <button
            class="tab-switcher__button"
            :class="{ active: selectedViews.includes('Layout') }"
            type="button"
            @click="emit('toggle-view', 'Layout')"
          >
            Layout
          </button>
          <button
            class="tab-switcher__button"
            :class="{ active: selectedViews.includes('Mesh') }"
            type="button"
            @click="emit('toggle-view', 'Mesh')"
          >
            Mesh
          </button>
        </div>
      </div>
    </div>

    <div class="main-view">
      <div class="main-view__overlay">
        <div class="overlay-group">
          <span class="overlay-chip">Asset: {{ selectedAsset.name }}</span>
          <span class="overlay-chip">Pano {{ selectedAsset.pano }}</span>
        </div>
        <div class="overlay-group">
          <span v-for="chip in statusChips" :key="chip.label" class="overlay-chip overlay-chip--status">
            <span class="overlay-chip__dot" :style="{ backgroundColor: chip.color }"></span>
            {{ chip.label }}
          </span>
        </div>
      </div>

      <svg class="main-view__svg" viewBox="0 0 1118 588" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M126 408 L324 292 L748 292 L894 360 M126 408 L284 454 L828 454 L894 360 M324 292 L284 454 M748 292 L828 454 M474 292 L474 454 M610 292 L610 454 M126 408 L126 228 L324 140 L748 140 L894 228 L894 360 M126 228 L324 140 M894 228 L748 140"
          class="line-room"
        />
        <path
          d="M362 270 L430 234 L480 260 L412 292 Z M362 270 L412 292 L412 360 L362 334 Z M412 292 L480 260 L480 332 L412 360 Z M390 306 L442 282 L442 346 L390 370 Z"
          class="line-object line-object--primary"
        />
        <path
          d="M626 226 L704 190 L752 216 L676 252 Z M626 226 L676 252 L676 330 L626 304 Z M676 252 L752 216 L752 290 L676 330 Z"
          class="line-object line-object--secondary"
        />
        <path
          d="M814 296 L870 270 L906 286 L850 312 Z M814 296 L850 312 L850 354 L814 338 Z M850 312 L906 286 L906 326 L850 354 Z"
          class="line-object line-object--warning"
        />
        <path d="M90 514 L332 538 L564 528 L786 548 L1018 518" class="line-floor" />
      </svg>

      <div class="coords-panel">
        <div class="coords-panel__line">X 2.38m&nbsp;&nbsp; Y 0.00m&nbsp;&nbsp; Z 4.92m</div>
        <div class="coords-panel__hint">Anchor: floor contact</div>
      </div>

      <div class="asset-inspector">
        <h3>Selected Asset</h3>
        <div v-for="metric in assetMetrics" :key="metric.label" class="asset-inspector__row">
          <span>{{ metric.label }}</span>
          <strong>{{ metricValue(metric, selectedAsset) }}</strong>
        </div>
        <div class="asset-inspector__actions">
          <button class="action-btn action-btn--ghost action-btn--small" type="button">Reset Pose</button>
          <button class="action-btn action-btn--primary action-btn--small" type="button">Confirm</button>
        </div>
      </div>
    </div>
  </section>
</template>
