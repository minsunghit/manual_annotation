<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  applyBoxTransformToGroup,
  createPointCloudObject,
  getAssetBaseTranslation,
  createInitialBoxFromAsset,
  estimateLocalYaw,
  getLocalBounds,
  rotateLocalPointsY,
  type LocalBounds,
} from '../utils/assetBoxTransform'
import type { AssetGeometryPayload, Box3D, WorkspaceAsset } from '../types/workspace'

const props = defineProps<{
  assets: WorkspaceAsset[]
  box3d: Box3D | null
  meshes: { layoutUrl: string; rawUrl: string } | null
  roomAnchor: { position: [number, number, number]; longitude: number } | null
  selectedAssetId: string
  selectedViews: string[]
}>()

const emit = defineEmits<{
  'asset-geometry-loaded': [payload: AssetGeometryPayload]
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animationFrame = 0
let resizeObserver: ResizeObserver | null = null
let layoutGroup: THREE.Group | null = null
let rawGroup: THREE.Group | null = null
let markerGroup: THREE.Group | null = null
let assetRootGroup: THREE.Group | null = null
let assetContentGroup: THREE.Group | null = null
let boxOverlayGroup: THREE.Group | null = null
let roomFloorY: number | null = null
let selectedAssetLocalBounds: LocalBounds | null = null
let selectedAssetLocalPoints: Array<[number, number, number]> = []
let selectedAssetLocalYaw = 0
let isCtrlPanActive = false
let assetCloudLoadVersion = 0
const loader = new GLTFLoader()

interface AssetGeometryCacheEntry {
  localBounds: LocalBounds
  localPoints: Array<[number, number, number]>
  localYaw: number
}

const assetGeometryCache = new Map<string, AssetGeometryCacheEntry>()

function roomOffset(): [number, number, number] {
  const offset = props.roomAnchor?.position
  return Array.isArray(offset) && offset.length === 3 ? offset : [0, 0, 0]
}

function resolvedFloorY(): number {
  if (typeof roomFloorY === 'number') {
    return roomFloorY
  }

  const [, offsetY] = roomOffset()
  return offsetY
}

function markerSizeFromAsset(asset: WorkspaceAsset): number {
  const scale = Array.isArray(asset.pose.scale) ? asset.pose.scale : [1, 1, 1]
  const averageScale = scale.reduce((sum, value) => sum + value, 0) / scale.length
  return THREE.MathUtils.clamp(averageScale * 0.34, 0.16, 0.72)
}

function updateNavigationMode() {
  if (!controls) {
    return
  }

  controls.mouseButtons.LEFT = isCtrlPanActive ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
  controls.update()
}

function onKeyStateChange(event: KeyboardEvent) {
  const nextCtrlPan = event.ctrlKey
  if (nextCtrlPan === isCtrlPanActive) {
    return
  }

  isCtrlPanActive = nextCtrlPan
  updateNavigationMode()
}

function updateMeshVisibility() {
  if (layoutGroup) {
    layoutGroup.visible = props.selectedViews.includes('Layout')
  }
  if (rawGroup) {
    rawGroup.visible = props.selectedViews.includes('Mesh')
  }
}

function updateCameraClipping() {
  if (!camera) {
    return
  }

  const box = new THREE.Box3()
  if (layoutGroup) {
    box.expandByObject(layoutGroup)
  }
  if (rawGroup) {
    box.expandByObject(rawGroup)
  }
  if (markerGroup) {
    box.expandByObject(markerGroup)
  }
  if (assetRootGroup) {
    box.expandByObject(assetRootGroup)
  }
  if (boxOverlayGroup) {
    box.expandByObject(boxOverlayGroup)
  }

  if (box.isEmpty()) {
    return
  }

  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1)
  camera.near = 0.01
  camera.far = maxDim * 20
  camera.updateProjectionMatrix()
}

function refreshRoomFloorY() {
  const candidates: number[] = []

  if (layoutGroup) {
    const layoutBox = new THREE.Box3().setFromObject(layoutGroup)
    if (!layoutBox.isEmpty()) {
      candidates.push(layoutBox.min.y)
    }
  }

  if (rawGroup) {
    const rawBox = new THREE.Box3().setFromObject(rawGroup)
    if (!rawBox.isEmpty()) {
      candidates.push(rawBox.min.y)
    }
  }

  roomFloorY = candidates.length > 0 ? Math.max(...candidates) : null
}

function fitCameraToCurrentContent() {
  if (!camera || !controls) {
    return
  }

  const box = new THREE.Box3()
  if (layoutGroup?.visible) {
    box.expandByObject(layoutGroup)
  }
  if (rawGroup?.visible) {
    box.expandByObject(rawGroup)
  }
  if (assetRootGroup) {
    box.expandByObject(assetRootGroup)
  }
  if (boxOverlayGroup) {
    box.expandByObject(boxOverlayGroup)
  }

  if (box.isEmpty()) {
    return
  }

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1)
  controls.target.copy(center)
  camera.position.set(center.x + maxDim * 1.1, center.y + maxDim * 0.72, center.z + maxDim * 1.1)
  updateCameraClipping()
  controls.update()
}

function focusSelectedAsset() {
  if (!camera || !controls) {
    return
  }

  const selectedAsset = props.assets.find((item) => item.id === props.selectedAssetId)
  if (!selectedAsset) {
    return
  }

  const [baseX, baseY, baseZ] = getAssetBaseTranslation(selectedAsset, props.roomAnchor, resolvedFloorY())
  const target = props.box3d
    ? new THREE.Vector3(props.box3d.center[0], props.box3d.center[1], props.box3d.center[2])
    : new THREE.Vector3(baseX, baseY, baseZ)
  const viewDirection = new THREE.Vector3().subVectors(camera.position, controls.target)
  if (viewDirection.lengthSq() < 1e-6) {
    viewDirection.set(2.8, 1.8, 2.8)
  }

  const desiredDistance = Math.max(markerSizeFromAsset(selectedAsset) * 8, 2.4)
  viewDirection.normalize().multiplyScalar(desiredDistance)
  controls.target.copy(target)
  camera.position.copy(target.clone().add(viewDirection))
  updateCameraClipping()
  controls.update()
}

function samplePointCloud(points: Array<[number, number, number]>, maxPoints: number): Array<[number, number, number]> {
  if (points.length <= maxPoints) {
    return points
  }

  const step = Math.max(Math.floor(points.length / maxPoints), 1)
  const sampled: Array<[number, number, number]> = []
  for (let index = 0; index < points.length; index += step) {
    sampled.push(points[index])
  }
  return sampled
}

async function loadAssetGeometryCache(asset: WorkspaceAsset): Promise<AssetGeometryCacheEntry | null> {
  const cached = assetGeometryCache.get(asset.id)
  if (cached) {
    return cached
  }

  if (!asset.objectGlbUrl) {
    return null
  }

  const gltf = await loader.loadAsync(asset.objectGlbUrl)
  const rawLocalPoints = buildLocalPointCloudFromAssetModel(gltf.scene)
  if (rawLocalPoints.length === 0) {
    return null
  }

  const localYaw = estimateLocalYaw(rawLocalPoints)
  const localPoints = rotateLocalPointsY(rawLocalPoints, -localYaw)
  const localBounds = getLocalBounds(localPoints)
  const entry = {
    localBounds,
    localPoints,
    localYaw,
  }

  assetGeometryCache.set(asset.id, entry)
  return entry
}

function buildAssetPointCloudGroup(
  asset: WorkspaceAsset,
  geometry: AssetGeometryCacheEntry,
  options: { color: number; pointSize: number; maxPoints: number },
): THREE.Group {
  const root = new THREE.Group()
  const points = createPointCloudObject(samplePointCloud(geometry.localPoints, options.maxPoints), options.color, options.pointSize)
  points.position.set(
    -geometry.localBounds.center[0],
    -geometry.localBounds.center[1],
    -geometry.localBounds.center[2],
  )
  root.add(points)
  const box = createInitialBoxFromAsset(asset, props.roomAnchor, resolvedFloorY(), geometry.localBounds, geometry.localYaw)
  applyBoxTransformToGroup(root, box, geometry.localBounds)
  return root
}

async function rebuildMarkers() {
  if (!scene) {
    return
  }

  if (!markerGroup) {
    markerGroup = new THREE.Group()
    scene.add(markerGroup)
  }

  markerGroup.clear()

  const currentVersion = ++assetCloudLoadVersion
  const unselectedAssets = props.assets.filter((asset) => asset.id !== props.selectedAssetId)
  const groups = await Promise.all(
    unselectedAssets.map(async (asset) => {
      const geometry = await loadAssetGeometryCache(asset)
      if (!geometry) {
        return null
      }

      return buildAssetPointCloudGroup(asset, geometry, {
        color: 0xc084fc,
        pointSize: 0.022,
        maxPoints: 3200,
      })
    }),
  )

  if (currentVersion !== assetCloudLoadVersion || !markerGroup) {
    return
  }

  markerGroup.clear()
  for (const group of groups) {
    if (group) {
      markerGroup.add(group)
    }
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose()
    }
    return
  }

  material.dispose()
}

function disposeGroup(group: THREE.Group | null) {
  if (!group || !scene) {
    return
  }

  scene.remove(group)
  group.traverse((node) => {
    const maybeMesh = node as THREE.Mesh
    maybeMesh.geometry?.dispose?.()
    if (maybeMesh.material) {
      disposeMaterial(maybeMesh.material)
    }
  })
}

function clearSelectedAssetGeometry() {
  disposeGroup(assetRootGroup)
  assetRootGroup = null
  assetContentGroup = null
  selectedAssetLocalBounds = null
  selectedAssetLocalPoints = []
  selectedAssetLocalYaw = 0
}

function clearBoxOverlay() {
  disposeGroup(boxOverlayGroup)
  boxOverlayGroup = null
}

function buildLocalPointCloudFromAssetModel(gltfScene: THREE.Group): Array<[number, number, number]> {
  const sampledPoints: Array<[number, number, number]> = []

  gltfScene.updateMatrixWorld(true)
  gltfScene.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.geometry?.attributes?.position) {
      return
    }

    const sourcePosition = node.geometry.attributes.position
    const samplingStep = Math.max(Math.floor(sourcePosition.count / 12000), 1)
    for (let index = 0; index < sourcePosition.count; index += samplingStep) {
      const localPoint = new THREE.Vector3().fromBufferAttribute(sourcePosition, index).applyMatrix4(node.matrixWorld)
      sampledPoints.push([localPoint.x, localPoint.y, localPoint.z])
    }
  })

  return sampledPoints
}

function emitSelectedAssetGeometry(asset: WorkspaceAsset) {
  if (!selectedAssetLocalBounds || selectedAssetLocalPoints.length === 0) {
    return
  }

  emit('asset-geometry-loaded', {
    assetId: asset.id,
    box: createInitialBoxFromAsset(asset, props.roomAnchor, resolvedFloorY(), selectedAssetLocalBounds, selectedAssetLocalYaw),
    localBounds: selectedAssetLocalBounds,
    localPoints: selectedAssetLocalPoints,
    localYaw: selectedAssetLocalYaw,
  })
}

function updateSelectedAssetTransform() {
  if (!assetRootGroup || !props.box3d || !selectedAssetLocalBounds) {
    return
  }

  applyBoxTransformToGroup(assetRootGroup, props.box3d, selectedAssetLocalBounds)
  updateCameraClipping()
}

async function loadSelectedAssetGeometry() {
  clearSelectedAssetGeometry()

  const selectedAsset = props.assets.find((item) => item.id === props.selectedAssetId)
  if (!selectedAsset?.objectGlbUrl || !scene) {
    clearBoxOverlay()
    return
  }

  const geometry = await loadAssetGeometryCache(selectedAsset)
  if (!geometry) {
    clearBoxOverlay()
    return
  }

  selectedAssetLocalYaw = geometry.localYaw
  selectedAssetLocalPoints = geometry.localPoints
  selectedAssetLocalBounds = geometry.localBounds

  assetRootGroup = new THREE.Group()
  assetContentGroup = new THREE.Group()
  const points = createPointCloudObject(samplePointCloud(selectedAssetLocalPoints, 12000), 0x5eead4, 0.038)
  points.position.set(
    -selectedAssetLocalBounds.center[0],
    -selectedAssetLocalBounds.center[1],
    -selectedAssetLocalBounds.center[2],
  )
  assetContentGroup.add(points)
  assetRootGroup.add(assetContentGroup)
  scene.add(assetRootGroup)

  emitSelectedAssetGeometry(selectedAsset)
  if (props.box3d) {
    updateSelectedAssetTransform()
  }
}

function buildDisplayGroup(gltfScene: THREE.Group, variant: 'layout' | 'mesh'): THREE.Group {
  const container = new THREE.Group()

  gltfScene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return
    }

    const geometry = node.geometry.clone()
    const material =
      variant === 'layout'
        ? new THREE.MeshStandardMaterial({
            color: 0x5eead4,
            transparent: true,
            opacity: 0.34,
            roughness: 0.95,
            metalness: 0.02,
            depthWrite: false,
          })
        : (() => {
            const baseMaterial = (Array.isArray(node.material) ? node.material[0] : node.material).clone()
            baseMaterial.transparent = true
            baseMaterial.opacity = Math.min(baseMaterial.opacity ?? 1, 0.92)
            baseMaterial.depthWrite = false
            return baseMaterial
          })()

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(node.position)
    mesh.quaternion.copy(node.quaternion)
    mesh.scale.copy(node.scale)
    container.add(mesh)

    const edgeColor = variant === 'layout' ? 0x99f6e4 : 0xcbd5e1
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, variant === 'layout' ? 22 : 28),
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: variant === 'layout' ? 0.44 : 0.12,
      }),
    )
    edges.position.copy(node.position)
    edges.quaternion.copy(node.quaternion)
    edges.scale.copy(node.scale)
    container.add(edges)
  })

  return container
}

function updateBoxOverlay() {
  clearBoxOverlay()
  if (!scene || !props.box3d) {
    return
  }

  const root = new THREE.Group()
  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 0.6,
      metalness: 0.04,
    }),
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({
      color: 0xfcd34d,
      transparent: true,
      opacity: 0.94,
    }),
  )

  root.add(fill)
  root.add(edges)
  boxOverlayGroup = root
  scene.add(root)
  root.position.set(props.box3d.center[0], props.box3d.center[1], props.box3d.center[2])
  root.rotation.set(0, props.box3d.yaw, 0)
  root.scale.set(props.box3d.size[0], props.box3d.size[1], props.box3d.size[2])
  updateCameraClipping()
}

async function loadMeshes() {
  if (!scene) {
    return
  }

  loading.value = true
  disposeGroup(layoutGroup)
  disposeGroup(rawGroup)
  layoutGroup = null
  rawGroup = null

  if (!props.meshes?.layoutUrl || !props.meshes?.rawUrl) {
    loading.value = false
    return
  }

  const [layoutGltf, rawGltf] = await Promise.all([loader.loadAsync(props.meshes.layoutUrl), loader.loadAsync(props.meshes.rawUrl)])

  layoutGroup = buildDisplayGroup(layoutGltf.scene, 'layout')
  rawGroup = buildDisplayGroup(rawGltf.scene, 'mesh')
  scene.add(layoutGroup)
  scene.add(rawGroup)
  refreshRoomFloorY()
  updateMeshVisibility()
  await rebuildMarkers()
  await loadSelectedAssetGeometry()
  updateBoxOverlay()
  if (props.box3d) {
    updateSelectedAssetTransform()
  }
  fitCameraToCurrentContent()
  focusSelectedAsset()
  loading.value = false
}

function resizeRenderer() {
  if (!viewportRef.value || !renderer || !camera) {
    return
  }

  const width = viewportRef.value.clientWidth
  const height = viewportRef.value.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
}

function animate() {
  animationFrame = requestAnimationFrame(animate)
  controls?.update()
  renderer?.render(scene!, camera!)
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1e293b)
  camera = new THREE.PerspectiveCamera(55, 1, 0.01, 200)
  camera.position.set(3.5, 2.8, 3.5)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  viewportRef.value?.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)
  updateNavigationMode()
  window.addEventListener('keydown', onKeyStateChange)
  window.addEventListener('keyup', onKeyStateChange)

  scene.add(new THREE.AmbientLight(0xffffff, 1.5))
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3)
  directionalLight.position.set(6, 8, 4)
  scene.add(directionalLight)

  resizeRenderer()
  resizeObserver = new ResizeObserver(() => resizeRenderer())
  if (viewportRef.value) {
    resizeObserver.observe(viewportRef.value)
  }
  animate()
  loadMeshes().catch((error) => {
    console.error(error)
    loading.value = false
  })
})

onBeforeUnmount(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  resizeObserver?.disconnect()
  clearSelectedAssetGeometry()
  clearBoxOverlay()
  window.removeEventListener('keydown', onKeyStateChange)
  window.removeEventListener('keyup', onKeyStateChange)
  controls?.dispose()
  renderer?.dispose()
})

watch(
  () => props.meshes,
  () => {
    loadMeshes().catch((error) => {
      console.error(error)
      loading.value = false
    })
  },
  { deep: true },
)

watch(
  () => props.assets,
  async () => {
    await rebuildMarkers()
    await loadSelectedAssetGeometry()
    if (props.box3d) {
      updateSelectedAssetTransform()
    }
    updateBoxOverlay()
    focusSelectedAsset()
  },
  { deep: true },
)

watch(
  () => props.roomAnchor,
  async () => {
    await rebuildMarkers()
    await loadSelectedAssetGeometry()
    if (props.box3d) {
      updateSelectedAssetTransform()
    }
    updateBoxOverlay()
    focusSelectedAsset()
  },
  { deep: true },
)

watch(
  () => props.selectedAssetId,
  async () => {
    await rebuildMarkers()
    await loadSelectedAssetGeometry()
    focusSelectedAsset()
  },
)

watch(
  () => props.selectedViews,
  () => {
    updateMeshVisibility()
    updateCameraClipping()
  },
  { deep: true },
)

watch(
  () => props.box3d,
  () => {
    updateSelectedAssetTransform()
    updateBoxOverlay()
  },
  { deep: true },
)
</script>

<template>
  <div ref="viewportRef" class="scene-viewport">
    <div v-if="loading" class="scene-viewport__loading">Loading scene meshes...</div>
  </div>
</template>
