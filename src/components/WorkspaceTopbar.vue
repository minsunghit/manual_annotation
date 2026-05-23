<script setup>
defineProps({
  sceneOptions: {
    type: Array,
    required: true,
  },
  selectedAssetName: {
    type: String,
    required: true,
  },
  selectedScene: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update:selectedScene'])
</script>

<template>
  <header class="topbar">
    <div class="topbar__left">
      <div class="brand-pill">
        <div class="brand-pill__icon">3D</div>
        <div>
          <div class="brand-pill__title">SceneAlign</div>
          <div class="brand-pill__subtitle">Furniture placement annotation</div>
        </div>
      </div>

      <label class="select-pill">
        <span class="select-pill__label">Scene</span>
        <select
          :value="selectedScene"
          class="select-pill__control"
          @change="emit('update:selectedScene', $event.target.value)"
        >
          <option v-for="scene in sceneOptions" :key="scene" :value="scene">
            {{ scene }}
          </option>
        </select>
      </label>

      <div class="select-pill select-pill--readonly">
        <span class="select-pill__label">Current Asset</span>
        <strong class="select-pill__value">{{ selectedAssetName }}</strong>
      </div>
    </div>

    <div class="topbar__right">
      <div class="status-badge">
        <span class="status-badge__dot"></span>
        Auto-saved 18s ago
      </div>
      <button class="action-btn action-btn--ghost" type="button">Save Draft</button>
      <button class="action-btn action-btn--primary" type="button">Export JSON</button>
    </div>
  </header>
</template>
