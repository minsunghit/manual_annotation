<script setup lang="ts">
import type { SceneOption } from '../types/workspace'

defineProps<{
  sceneOptions: SceneOption[]
  savedLabel: string
  selectedAssetName: string
  selectedScene: string
}>()

const emit = defineEmits<{
  'export-box': []
  'update:selected-scene': [value: string]
}>()

function onSceneChange(event: Event) {
  emit('update:selected-scene', (event.target as HTMLSelectElement).value)
}
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
        <select :value="selectedScene" class="select-pill__control" @change="onSceneChange">
          <option v-for="scene in sceneOptions" :key="scene.value" :value="scene.value">
            {{ scene.label }}
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
        {{ savedLabel }}
      </div>
      <button class="action-btn action-btn--ghost" type="button">Save Draft</button>
      <button class="action-btn action-btn--primary" type="button" @click="emit('export-box')">Export JSON</button>
    </div>
  </header>
</template>
