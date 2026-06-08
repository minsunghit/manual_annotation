<script setup lang="ts">
import OrthographicBoxEditor from './OrthographicBoxEditor.vue'
import type { Box3D, ProjectionView, Vec3 } from '../types/workspace'
import type { LocalBounds } from '../utils/assetBoxTransform'

const props = defineProps<{
  box: Box3D | null
  localBounds: LocalBounds | null
  localPoints: Vec3[]
  meshes: { layoutUrl: string; rawUrl: string } | null
  selectedAssetId: string
  selectedViews: string[]
  orthoZoom: number
  hasGeometryCollision: boolean
}>()

const emit = defineEmits<{
  'update:box': [box: Box3D]
  'update:ortho-zoom': [zoom: number]
}>()

const viewCards: Array<{ key: ProjectionView; title: string; subtitle: string }> = [
  { key: 'top', title: 'Top', subtitle: 'Footprint, translation, and yaw on the x-z plane' },
  { key: 'side', title: 'Side', subtitle: 'Edit z/y extent against the vertical plane' },
  { key: 'front', title: 'Front', subtitle: 'Edit x/y extent against the vertical plane' },
]

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const nextZoom = event.deltaY > 0 ? props.orthoZoom * 1.08 : props.orthoZoom / 1.08
  emit('update:ortho-zoom', Math.min(Math.max(nextZoom, 0.35), 3.5))
}
</script>

<template>
  <section class="orthographic-panel">
    <div class="orthographic-panel__header">
      <div>
        <h2>Orthographic Review</h2>
        <p>Top / Side / Front projections share one Box3D state and update the 3D viewport in real time.</p>
      </div>

      <div class="legend-row">
        <span class="legend-item"><i class="legend-dot legend-dot--room"></i>Asset point cloud</span>
        <span class="legend-item"><i class="legend-dot legend-dot--placed"></i>Editable box</span>
        <span class="legend-item"><i class="legend-dot legend-dot--candidate"></i>Rotation handle</span>
      </div>
    </div>

    <div class="ortho-grid" @wheel.prevent="onWheel">
      <OrthographicBoxEditor
        v-for="view in viewCards"
        :key="view.key"
        :box="box"
        :local-bounds="localBounds"
        :local-points="localPoints"
        :meshes="meshes"
        :has-geometry-collision="hasGeometryCollision"
        :selected-asset-id="selectedAssetId"
        :selected-views="selectedViews"
        :subtitle="view.subtitle"
        :title="view.title"
        :view="view.key"
        :workspace-zoom="orthoZoom"
        @update:box="emit('update:box', $event)"
      />
    </div>
  </section>
</template>
