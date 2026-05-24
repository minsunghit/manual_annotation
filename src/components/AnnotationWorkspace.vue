<script setup lang="ts">
import SceneViewport from './SceneViewport.vue'
import type { AssetGeometryPayload, Box3D, RoomAnchor, WorkspaceAsset, WorkspaceMeshes } from '../types/workspace'

const props = defineProps<{
  assets: WorkspaceAsset[]
  box3d: Box3D | null
  meshes: WorkspaceMeshes | null
  roomAnchor: RoomAnchor | null
  selectedAsset: WorkspaceAsset
  selectedAssetId: string
  selectedViews: string[]
  statusChips: Array<{ label: string; color: string }>
}>()

const emit = defineEmits<{
  'asset-geometry-loaded': [payload: AssetGeometryPayload]
  'confirm-asset': []
  'reset-asset': []
  'toggle-view': [view: string]
}>()

const assetMetrics = [
  { label: 'Category', key: 'category' },
  { label: 'Pose', value: 'camera focus' },
  { label: 'Scale', key: 'scaleLabel' },
  { label: 'Anchor', value: 'scene pose' },
] as const

function metricValue(metric: (typeof assetMetrics)[number], selectedAsset: WorkspaceAsset): string {
  if (metric.key === 'scaleLabel') {
    return selectedAsset.pose.scale.map((item) => item.toFixed(2)).join(' / ')
  }
  if (metric.key === 'category') {
    return selectedAsset.category
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
        <div class="metric-pill">Scene pose linked</div>
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

      <SceneViewport
        :assets="assets"
        :box3d="box3d"
        :meshes="meshes"
        :room-anchor="roomAnchor"
        :selected-asset-id="selectedAssetId"
        :selected-views="selectedViews"
        @asset-geometry-loaded="emit('asset-geometry-loaded', $event)"
      />

      <div class="coords-panel">
        <div class="coords-panel__line">
          X {{ selectedAsset.pose.translation[0].toFixed(2) }}m&nbsp;&nbsp;
          Y {{ selectedAsset.pose.translation[1].toFixed(2) }}m&nbsp;&nbsp;
          Z {{ selectedAsset.pose.translation[2].toFixed(2) }}m
        </div>
        <div class="coords-panel__hint">Selecting an asset recenters the viewport here</div>
      </div>

      <div class="asset-inspector">
        <h3>Selected Asset</h3>
        <div v-for="metric in assetMetrics" :key="metric.label" class="asset-inspector__row">
          <span>{{ metric.label }}</span>
          <strong>{{ metricValue(metric, props.selectedAsset) }}</strong>
        </div>
        <div v-if="box3d" class="asset-inspector__row asset-inspector__row--stack">
          <span>Box JSON</span>
          <strong>{{ box3d.size.map((item) => item.toFixed(2)).join(' / ') }} @ {{ box3d.yaw.toFixed(2) }} rad</strong>
        </div>
        <div class="asset-inspector__actions">
          <button class="action-btn action-btn--ghost action-btn--small" type="button" @click="emit('reset-asset')">Reset Pose</button>
          <button class="action-btn action-btn--primary action-btn--small" type="button" @click="emit('confirm-asset')">Confirm</button>
        </div>
      </div>
    </div>
  </section>
</template>
