<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { confirmAsset, fetchScenes, fetchWorkspace } from './api/workspaceApi'
import AnnotationWorkspace from './components/AnnotationWorkspace.vue'
import AssetSidebar from './components/AssetSidebar.vue'
import OrthographicReview from './components/OrthographicReview.vue'
import WorkspaceTopbar from './components/WorkspaceTopbar.vue'
import { placementStatusChips } from './data/workspaceData'
import type { LocalBounds } from './utils/assetBoxTransform'
import { roomYaw } from './utils/assetBoxTransform'
import { getBox3DJson, rotateXZ } from './utils/box3dMath'
import type {
  AssetGeometryPayload,
  AssetPose,
  Box3D,
  RoomAnchor,
  SceneOption,
  Vec3,
  WorkspaceAsset,
  WorkspaceMeshes,
} from './types/workspace'

interface WorkspaceState {
  assets: WorkspaceAsset[]
  meshes: WorkspaceMeshes | null
  roomAnchor: RoomAnchor | null
}

interface AssetGeometryState {
  floorY: number
  initialBox: Box3D
  localBounds: LocalBounds
  localYaw: number
}

interface SavedAssetState {
  box: Box3D
  pose: AssetPose
  savedAtIso: string
}

const sceneOptions = ref<SceneOption[]>([])
const selectedScene = ref('')
const selectedAssetId = ref('')
const selectedViews = ref<string[]>(['Layout'])
const workspace = ref<WorkspaceState>({
  assets: [],
  meshes: null,
  roomAnchor: null,
})
const box3d = ref<Box3D | null>(null)
const assetLocalPoints = ref<Vec3[]>([])
const assetLocalBounds = ref<LocalBounds | null>(null)
const assetLocalYaw = ref(0)
const activeBoxAssetId = ref('')
const orthoZoom = ref(1)
const loading = ref(true)
const errorText = ref('')
const assetGeometryMap = ref<Record<string, AssetGeometryState>>({})
const savedAssetMap = ref<Record<string, SavedAssetState>>({})

const selectedAsset = computed<WorkspaceAsset | null>(
  () => workspace.value.assets.find((item) => item.id === selectedAssetId.value) || workspace.value.assets[0] || null,
)

const savedLabel = computed(() => {
  const savedAtIso = selectedAsset.value ? savedAssetMap.value[selectedAsset.value.id]?.savedAtIso : ''
  return savedAtIso ? `Saved ${formatSavedTime(savedAtIso)}` : 'Saved --'
})

function cloneBox(box: Box3D): Box3D {
  return {
    center: [...box.center] as Box3D['center'],
    size: [...box.size] as Box3D['size'],
    yaw: box.yaw,
  }
}

function clonePose(pose: AssetPose): AssetPose {
  return {
    translation: [...pose.translation] as AssetPose['translation'],
    rotation: [...pose.rotation] as AssetPose['rotation'],
    scale: [...pose.scale] as AssetPose['scale'],
  }
}

function formatSavedTime(savedAtIso: string): string {
  const date = new Date(savedAtIso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function toggleView(view: string) {
  if (selectedViews.value.includes(view)) {
    if (selectedViews.value.length > 1) {
      selectedViews.value = selectedViews.value.filter((item) => item !== view)
    }
    return
  }

  selectedViews.value = [...selectedViews.value, view]
}

function clearBoxState() {
  box3d.value = null
  assetLocalPoints.value = []
  assetLocalBounds.value = null
  assetLocalYaw.value = 0
  activeBoxAssetId.value = ''
  orthoZoom.value = 1
}

function clearSceneState() {
  clearBoxState()
  assetGeometryMap.value = {}
  savedAssetMap.value = {}
}

function updateWorkspaceAssetPose(assetId: string, pose: AssetPose) {
  workspace.value = {
    ...workspace.value,
    assets: workspace.value.assets.map((asset) => (asset.id === assetId ? { ...asset, pose: clonePose(pose) } : asset)),
  }
}

function applySavedStatesToAssets(assets: WorkspaceAsset[], savedMap: Record<string, SavedAssetState>): WorkspaceAsset[] {
  return assets.map((asset) => {
    const savedState = savedMap[asset.id]
    return savedState ? { ...asset, pose: clonePose(savedState.pose) } : asset
  })
}

function buildSavedAssetMapFromAssets(assets: WorkspaceAsset[]): Record<string, SavedAssetState> {
  return assets.reduce<Record<string, SavedAssetState>>((result, asset) => {
    if (!asset.savedAtIso || !asset.savedBox) {
      return result
    }

    result[asset.id] = {
      box: cloneBox(asset.savedBox),
      pose: clonePose(asset.pose),
      savedAtIso: asset.savedAtIso,
    }
    return result
  }, {})
}

function deriveFloorY(asset: WorkspaceAsset, payload: AssetGeometryPayload): number {
  const scale = asset.pose.scale
  const scaledCenterX = payload.localBounds.center[0] * scale[0]
  const scaledCenterY = payload.localBounds.center[1] * scale[1]
  const scaledCenterZ = payload.localBounds.center[2] * scale[2]
  const [deltaX, deltaZ] = rotateXZ(scaledCenterX, scaledCenterZ, payload.box.yaw)
  const baseWorldY = payload.box.center[1] - scaledCenterY
  return baseWorldY - asset.pose.translation[1]
}

function derivePoseFromBox(
  box: Box3D,
  geometry: AssetGeometryState,
  roomAnchorState: RoomAnchor | null,
  previousPose: AssetPose,
): AssetPose {
  const scale: Vec3 = [
    box.size[0] / Math.max(geometry.localBounds.size[0], 1e-4),
    box.size[1] / Math.max(geometry.localBounds.size[1], 1e-4),
    box.size[2] / Math.max(geometry.localBounds.size[2], 1e-4),
  ]

  const scaledCenterX = geometry.localBounds.center[0] * scale[0]
  const scaledCenterY = geometry.localBounds.center[1] * scale[1]
  const scaledCenterZ = geometry.localBounds.center[2] * scale[2]
  const [deltaX, deltaZ] = rotateXZ(scaledCenterX, scaledCenterZ, box.yaw)
  const baseWorldX = box.center[0] - deltaX
  const baseWorldY = box.center[1] - scaledCenterY
  const baseWorldZ = box.center[2] - deltaZ

  const offset = roomAnchorState?.position || [0, 0, 0]
  const localSceneYaw = roomYaw(roomAnchorState)
  const worldLocalX = baseWorldX - offset[0]
  const worldLocalZ = baseWorldZ - offset[2]
  const cosYaw = Math.cos(localSceneYaw)
  const sinYaw = Math.sin(localSceneYaw)
  const assetYaw = -localSceneYaw + geometry.localYaw - box.yaw
  const halfYaw = assetYaw * 0.5

  return {
    translation: [
      worldLocalX * cosYaw - worldLocalZ * sinYaw,
      baseWorldY - geometry.floorY,
      worldLocalX * sinYaw + worldLocalZ * cosYaw,
    ],
    rotation: [Math.cos(halfYaw), 0, Math.sin(halfYaw), 0],
    scale,
  }
}

function onAssetGeometryLoaded(payload: AssetGeometryPayload) {
  if (payload.assetId !== selectedAssetId.value || !selectedAsset.value) {
    return
  }

  assetLocalPoints.value = payload.localPoints
  assetLocalBounds.value = payload.localBounds
  assetLocalYaw.value = payload.localYaw

  assetGeometryMap.value = {
    ...assetGeometryMap.value,
    [payload.assetId]: {
      floorY: deriveFloorY(selectedAsset.value, payload),
      initialBox: cloneBox(payload.box),
      localBounds: payload.localBounds,
      localYaw: payload.localYaw,
    },
  }

  const savedState = savedAssetMap.value[payload.assetId]
  if (activeBoxAssetId.value !== payload.assetId) {
    box3d.value = savedState ? cloneBox(savedState.box) : cloneBox(payload.box)
    activeBoxAssetId.value = payload.assetId
  }
}

async function onConfirmAsset() {
  if (!selectedAsset.value || !box3d.value) {
    return
  }

  const geometry = assetGeometryMap.value[selectedAsset.value.id]
  if (!geometry) {
    return
  }

  const pose = derivePoseFromBox(box3d.value, geometry, workspace.value.roomAnchor, selectedAsset.value.pose)
  const savedAtIso = new Date().toISOString()
  const response = await confirmAsset(
    'scene_000',
    selectedScene.value,
    selectedAsset.value.id,
    selectedAsset.value.revisionId,
    pose,
    box3d.value,
    savedAtIso,
  )
  const nextSavedMap = {
    ...savedAssetMap.value,
    [selectedAsset.value.id]: {
      box: cloneBox(response.box || box3d.value),
      pose: clonePose(response.pose || pose),
      savedAtIso: response.savedAtIso || savedAtIso,
    },
  }

  savedAssetMap.value = nextSavedMap
  updateWorkspaceAssetPose(selectedAsset.value.id, response.pose || pose)
}

function onResetAsset() {
  if (!selectedAsset.value) {
    return
  }

  const savedState = savedAssetMap.value[selectedAsset.value.id]
  if (!savedState) {
    return
  }

  box3d.value = cloneBox(savedState.box)
  updateWorkspaceAssetPose(selectedAsset.value.id, savedState.pose)
}

function exportBoxJson() {
  if (!box3d.value || !selectedAsset.value) {
    return
  }

  const json = getBox3DJson(box3d.value)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `scene_000-${selectedScene.value}-${selectedAsset.value.name}-box3d.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function loadSceneOptions() {
  const payload = await fetchScenes()
  const rooms =
    payload.scenes.find((item: { id: string; roomOptions?: Array<{ roomName: string; label: string }> }) => item.id === 'scene_000')
      ?.roomOptions || []
  sceneOptions.value = rooms.map((item) => ({
    value: item.roomName,
    label: item.label,
  }))

  if (!selectedScene.value) {
    selectedScene.value = sceneOptions.value.find((item) => item.value === '客厅')?.value || sceneOptions.value[0]?.value || ''
  }
}

async function loadWorkspace(roomName: string) {
  if (!roomName) {
    return
  }

  loading.value = true
  errorText.value = ''
  clearSceneState()

  try {
    const payload = await fetchWorkspace('scene_000', roomName)
    const loadedSavedMap = buildSavedAssetMapFromAssets(payload.assets || [])
    savedAssetMap.value = loadedSavedMap
    workspace.value = {
      assets: applySavedStatesToAssets(payload.assets || [], loadedSavedMap),
      meshes: payload.meshes || null,
      roomAnchor: payload.roomAnchor || null,
    }

    if (!workspace.value.assets.some((item) => item.id === selectedAssetId.value)) {
      selectedAssetId.value = workspace.value.assets[0]?.id || ''
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Failed to load workspace.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await loadSceneOptions()
  } catch (error) {
    loading.value = false
    errorText.value = error instanceof Error ? error.message : 'Failed to load scene options.'
  }
})

watch(selectedScene, async (roomName, previousRoomName) => {
  if (!roomName || roomName === previousRoomName) {
    return
  }

  await loadWorkspace(roomName)
})

watch(selectedAssetId, (assetId, previousAssetId) => {
  if (!assetId || assetId === previousAssetId) {
    return
  }

  clearBoxState()
})
</script>

<template>
  <div class="workspace-shell">
    <WorkspaceTopbar
      :saved-label="savedLabel"
      :scene-options="sceneOptions"
      :selected-asset-name="selectedAsset?.name || 'No asset'"
      :selected-scene="selectedScene"
      @export-box="exportBoxJson"
      @update:selected-scene="selectedScene = $event"
    />

    <main class="workspace-grid">
      <div class="workspace-grid__sidebar">
        <AssetSidebar
          :assets="workspace.assets"
          :selected-asset-id="selectedAssetId"
          @select-asset="selectedAssetId = $event"
        />
      </div>

      <div class="workspace-grid__main">
        <AnnotationWorkspace
          v-if="selectedAsset"
          :assets="workspace.assets"
          :box3d="box3d"
          :meshes="workspace.meshes"
          :room-anchor="workspace.roomAnchor"
          :selected-asset="selectedAsset"
          :selected-asset-id="selectedAssetId"
          :selected-views="selectedViews"
          :status-chips="placementStatusChips"
          @asset-geometry-loaded="onAssetGeometryLoaded"
          @confirm-asset="onConfirmAsset"
          @reset-asset="onResetAsset"
          @toggle-view="toggleView"
        />
        <section v-else class="annotation-panel annotation-panel--empty">
          <div class="annotation-panel__empty">
            <div v-if="loading">Loading workspace...</div>
            <div v-else-if="errorText">{{ errorText }}</div>
            <div v-else>No assets available for this room.</div>
          </div>
        </section>
      </div>

      <OrthographicReview
        :box="box3d"
        :local-bounds="assetLocalBounds"
        :local-points="assetLocalPoints"
        :meshes="workspace.meshes"
        :ortho-zoom="orthoZoom"
        :selected-asset-id="selectedAssetId"
        :selected-views="selectedViews"
        @update:box="box3d = $event"
        @update:ortho-zoom="orthoZoom = $event"
      />
    </main>
  </div>
</template>
