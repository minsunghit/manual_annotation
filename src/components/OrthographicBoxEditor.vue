<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { createBoxDragState, type BoxHandle, updateBox3DFromDrag } from '../composables/useBox3DTransform'
import { createPointCloudObject, applyBoxTransformToGroup, type LocalBounds } from '../utils/assetBoxTransform'
import { inverseRotateXZ, rotateXZ } from '../utils/box3dMath'
import type { Box3D, ProjectionView, Vec2, Vec3 } from '../types/workspace'

const props = defineProps<{
  box: Box3D | null
  localBounds: LocalBounds | null
  localPoints: Vec3[]
  meshes: { layoutUrl: string; rawUrl: string } | null
  hasGeometryCollision: boolean
  selectedAssetId: string
  selectedViews: string[]
  subtitle: string
  title: string
  view: ProjectionView
  workspaceZoom: number
}>()

const emit = defineEmits<{
  'update:box': [box: Box3D]
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const activeHandle = ref<BoxHandle | null>(null)
const projectionVersion = ref(0)
const panOffset = ref<Vec2>([0, 0])
const framedCenter = ref<Vec3 | null>(null)
const framedAssetId = ref('')

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let animationFrame = 0
let resizeObserver: ResizeObserver | null = null
let layoutGroup: THREE.Group | null = null
let rawGroup: THREE.Group | null = null
let assetGroup: THREE.Group | null = null
let sceneBounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1))
const loader = new GLTFLoader()

let dragState: ReturnType<typeof createBoxDragState> | null = null
let activePointerId: number | null = null
let panPointerId: number | null = null
let panStartPointer: Vec2 | null = null
let panStartOffset: Vec2 = [0, 0]
let panContext:
  | {
      camera: THREE.OrthographicCamera
      planeNormal: THREE.Vector3
      planeOrigin: THREE.Vector3
      boxCenter: Vec3 | null
      boxYaw: number
    }
  | null = null
let dragContext:
  | {
      camera: THREE.OrthographicCamera
      planeNormal: THREE.Vector3
      planeOrigin: THREE.Vector3
      boxCenter: Vec3 | null
      boxYaw: number
    }
  | null = null

function applyClippingToGroup(group: THREE.Group | null) {
  if (!group) {
    return
  }

  const clippingPlanes: THREE.Plane[] = []
  if (props.box) {
    const [cx, cy, cz] = props.box.center
    const [sx, sy, sz] = props.box.size
    const groupBounds = new THREE.Box3().setFromObject(group)
    const groupSize = groupBounds.isEmpty() ? new THREE.Vector3(1, 1, 1) : groupBounds.getSize(new THREE.Vector3())
    const horizontalExtent = Math.max(groupSize.x, groupSize.z, sx, sz)
    const verticalExtent = Math.max(groupSize.y, sy)
    const clipFactor = 0.58
    const slabPadding = Math.max(horizontalExtent * 0.12, 0.32) * clipFactor

    if (props.view === 'front') {
      const halfDepth = Math.max(horizontalExtent * (0.34 + clipFactor * 0.34), sz * (0.8 + clipFactor * 0.8), 0.48) + slabPadding
      clippingPlanes.push(
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -(cz - halfDepth)),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), cz + halfDepth),
      )
    } else if (props.view === 'side') {
      const halfDepth = Math.max(horizontalExtent * (0.34 + clipFactor * 0.34), sx * (0.8 + clipFactor * 0.8), 0.48) + slabPadding
      clippingPlanes.push(
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(cx - halfDepth)),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), cx + halfDepth),
      )
    } else {
      const halfDepth = Math.max(verticalExtent * (0.24 + clipFactor * 0.22), sy * (0.78 + clipFactor * 0.52), 0.24) + slabPadding * 0.6
      clippingPlanes.push(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(cy - halfDepth)),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), cy + halfDepth),
      )
    }
  }

  group.traverse((node) => {
    const maybe = node as THREE.Mesh
    const material = maybe.material as THREE.Material | THREE.Material[] | undefined
    if (!material) {
      return
    }

    const materials = Array.isArray(material) ? material : [material]
    for (const entry of materials) {
      const clippingCapable = entry as THREE.Material & { clippingPlanes?: THREE.Plane[] }
      clippingCapable.clippingPlanes = clippingPlanes
      entry.needsUpdate = true
    }
  })
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
            opacity: 0.24,
            roughness: 0.95,
            metalness: 0.02,
            depthTest: false,
            depthWrite: false,
          })
        : (() => {
            const baseMaterial = (Array.isArray(node.material) ? node.material[0] : node.material).clone()
            if ('transparent' in baseMaterial) {
              baseMaterial.transparent = baseMaterial.transparent || (baseMaterial.opacity ?? 1) < 1
            }
            if ('opacity' in baseMaterial) {
              baseMaterial.opacity = Math.min(baseMaterial.opacity ?? 1, 0.72)
            }
            if ('depthWrite' in baseMaterial) {
              baseMaterial.depthWrite = false
            }
            if ('depthTest' in baseMaterial) {
              baseMaterial.depthTest = true
            }
            return baseMaterial
          })()

    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 0
    mesh.position.copy(node.position)
    mesh.quaternion.copy(node.quaternion)
    mesh.scale.copy(node.scale)
    container.add(mesh)

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, variant === 'layout' ? 22 : 28),
      new THREE.LineBasicMaterial({
        color: variant === 'layout' ? 0x99f6e4 : 0xe2e8f0,
        transparent: true,
        opacity: variant === 'layout' ? 0.34 : 0.08,
        depthTest: false,
      }),
    )
    edges.renderOrder = 1
    edges.position.copy(node.position)
    edges.quaternion.copy(node.quaternion)
    edges.scale.copy(node.scale)
    container.add(edges)
  })

  return container
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose()
    }
  } else {
    material.dispose()
  }
}

function disposeGroup(group: THREE.Group | null) {
  if (!group || !scene) {
    return
  }

  scene.remove(group)
  group.traverse((node) => {
    const maybe = node as THREE.Mesh
    maybe.geometry?.dispose?.()
    if (maybe.material) {
      disposeMaterial(maybe.material)
    }
  })
}

async function loadMeshes() {
  if (!scene) {
    return
  }

  disposeGroup(layoutGroup)
  disposeGroup(rawGroup)
  layoutGroup = null
  rawGroup = null

  if (!props.meshes?.layoutUrl || !props.meshes?.rawUrl) {
    updateSceneBounds()
    return
  }

  const [layoutGltf, rawGltf] = await Promise.all([loader.loadAsync(props.meshes.layoutUrl), loader.loadAsync(props.meshes.rawUrl)])
  layoutGroup = buildDisplayGroup(layoutGltf.scene, 'layout')
  rawGroup = buildDisplayGroup(rawGltf.scene, 'mesh')
  layoutGroup.visible = props.selectedViews.includes('Layout')
  rawGroup.visible = props.selectedViews.includes('Mesh')
  scene.add(layoutGroup)
  scene.add(rawGroup)
  applyClippingToGroup(layoutGroup)
  applyClippingToGroup(rawGroup)
  updateSceneBounds()
}

function rebuildAssetGroup() {
  disposeGroup(assetGroup)
  assetGroup = null
  if (!scene || !props.localBounds || props.localPoints.length === 0) {
    updateSceneBounds()
    return
  }

  const root = new THREE.Group()
  const points = createPointCloudObject(props.localPoints, 0x5eead4, 0.04)
  points.position.set(-props.localBounds.center[0], -props.localBounds.center[1], -props.localBounds.center[2])
  root.add(points)
  root.renderOrder = 20
  assetGroup = root
  scene.add(root)
  updateAssetTransform()
}

function updateAssetTransform() {
  if (!assetGroup || !props.box || !props.localBounds) {
    updateSceneBounds()
    return
  }

  applyBoxTransformToGroup(assetGroup, props.box, props.localBounds)
  updateSceneBounds()
}

function updateSceneBounds() {
  const nextBounds = new THREE.Box3()
  if (layoutGroup?.visible) {
    nextBounds.expandByObject(layoutGroup)
  }
  if (rawGroup?.visible) {
    nextBounds.expandByObject(rawGroup)
  }
  if (assetGroup) {
    nextBounds.expandByObject(assetGroup)
  }

  if (!nextBounds.isEmpty()) {
    sceneBounds = nextBounds
  }
  updateCamera()
}

function getViewBasis() {
  if (props.view === 'top') {
    return {
      forward: new THREE.Vector3(0, -1, 0),
      up: new THREE.Vector3(0, 0, -1),
      planeNormal: new THREE.Vector3(0, 1, 0),
      planeOrigin: props.box ? new THREE.Vector3(props.box.center[0], props.box.center[1], props.box.center[2]) : sceneBounds.getCenter(new THREE.Vector3()),
    }
  }
  if (props.view === 'front') {
    const [fx, fz] = rotateXZ(0, -1, props.box?.yaw ?? 0)
    return {
      forward: new THREE.Vector3(fx, 0, fz),
      up: new THREE.Vector3(0, 1, 0),
      planeNormal: new THREE.Vector3(fx, 0, fz),
      planeOrigin: props.box ? new THREE.Vector3(props.box.center[0], props.box.center[1], props.box.center[2]) : sceneBounds.getCenter(new THREE.Vector3()),
    }
  }

  const [sx, sz] = rotateXZ(-1, 0, props.box?.yaw ?? 0)
  return {
    forward: new THREE.Vector3(sx, 0, sz),
    up: new THREE.Vector3(0, 1, 0),
    planeNormal: new THREE.Vector3(sx, 0, sz),
    planeOrigin: props.box ? new THREE.Vector3(props.box.center[0], props.box.center[1], props.box.center[2]) : sceneBounds.getCenter(new THREE.Vector3()),
  }
}

function updateCamera() {
  if (!camera || !viewportRef.value) {
    return
  }

  const width = viewportRef.value.clientWidth || 1
  const height = viewportRef.value.clientHeight || 1
  const aspect = width / height
  const baseCenter = framedCenter.value
    ? new THREE.Vector3(framedCenter.value[0], framedCenter.value[1], framedCenter.value[2])
    : props.box
      ? new THREE.Vector3(props.box.center[0], props.box.center[1], props.box.center[2])
      : sceneBounds.getCenter(new THREE.Vector3())
  const center = baseCenter.clone()
  if (props.view === 'top') {
    center.x += panOffset.value[0]
    center.z += panOffset.value[1]
  } else if (props.view === 'front') {
    const [dx, dz] = rotateXZ(panOffset.value[0], 0, props.box?.yaw ?? 0)
    center.x += dx
    center.z += dz
    center.y += panOffset.value[1]
  } else {
    const [dx, dz] = rotateXZ(0, panOffset.value[0], props.box?.yaw ?? 0)
    center.x += dx
    center.z += dz
    center.y += panOffset.value[1]
  }
  const size = sceneBounds.getSize(new THREE.Vector3())
  const maxWidth = props.view === 'top' ? size.x : props.view === 'front' ? size.x : size.z
  const maxHeight = props.view === 'top' ? size.z : size.y
  const targetCoverage = 0.4
  const boxWidth = props.box ? (props.view === 'top' ? props.box.size[0] : props.view === 'front' ? props.box.size[0] : props.box.size[2]) : 0
  const boxHeight = props.box ? (props.view === 'top' ? props.box.size[2] : props.box.size[1]) : 0
  const objectFrustumHeight =
    props.box && boxWidth > 0 && boxHeight > 0
      ? Math.max(boxHeight / targetCoverage, boxWidth / (Math.max(aspect, 0.1) * targetCoverage), 1)
      : 0
  const sceneFrustumHeight = Math.max(maxHeight * 1.18, maxWidth / Math.max(aspect, 0.1), 1)
  const baseFrustumHeight = props.box ? Math.max(objectFrustumHeight, 1) : sceneFrustumHeight
  const frustumHeight = baseFrustumHeight * Math.max(props.workspaceZoom, 0.2)
  const frustumWidth = frustumHeight * aspect
  const { forward, up } = getViewBasis()
  const distance = Math.max(size.length(), 8)

  camera.left = -frustumWidth * 0.5
  camera.right = frustumWidth * 0.5
  camera.top = frustumHeight * 0.5
  camera.bottom = -frustumHeight * 0.5
  camera.near = 0.01
  camera.far = distance * 4
  camera.position.copy(center.clone().sub(forward.clone().multiplyScalar(distance)))
  camera.up.copy(up)
  camera.lookAt(center)
  camera.updateProjectionMatrix()

  renderer?.setSize(width, height, false)
  projectionVersion.value += 1
}

function animate() {
  animationFrame = requestAnimationFrame(animate)
  renderer?.render(scene!, camera!)
}

function resizeRenderer() {
  updateCamera()
}

function worldToSvg(world: THREE.Vector3): Vec2 {
  if (!camera) {
    return [0, 0]
  }

  const projected = world.clone().project(camera)
  return [((projected.x + 1) * 0.5) * 392, ((1 - projected.y) * 0.5) * 154]
}

function planeToWorld([u, v]: Vec2): THREE.Vector3 {
  if (!props.box) {
    return new THREE.Vector3()
  }

  if (props.view === 'top') {
    return new THREE.Vector3(u, props.box.center[1], v)
  }
  if (props.view === 'front') {
    const [dx, dz] = rotateXZ(u, 0, props.box.yaw)
    return new THREE.Vector3(props.box.center[0] + dx, props.box.center[1] + v, props.box.center[2] + dz)
  }

  const [dx, dz] = rotateXZ(0, u, props.box.yaw)
  return new THREE.Vector3(props.box.center[0] + dx, props.box.center[1] + v, props.box.center[2] + dz)
}

const polygon = computed<Vec2[]>(() => {
  if (!props.box) {
    return []
  }

  if (props.view === 'top') {
    const [cx, , cz] = props.box.center
    const halfX = props.box.size[0] * 0.5
    const halfZ = props.box.size[2] * 0.5
    return [
      rotateXZ(-halfX, -halfZ, props.box.yaw),
      rotateXZ(halfX, -halfZ, props.box.yaw),
      rotateXZ(halfX, halfZ, props.box.yaw),
      rotateXZ(-halfX, halfZ, props.box.yaw),
    ].map(([x, z]) => [cx + x, cz + z])
  }

  const halfU = props.view === 'front' ? props.box.size[0] * 0.5 : props.box.size[2] * 0.5
  const halfV = props.box.size[1] * 0.5
  return [
    [-halfU, halfV],
    [halfU, halfV],
    [halfU, -halfV],
    [-halfU, -halfV],
  ]
})

const polygonPath = computed(() => {
  projectionVersion.value
  if (!props.box || polygon.value.length === 0) {
    return ''
  }

  return polygon.value
    .map((point, index) => {
      const world =
        props.view === 'top' ? new THREE.Vector3(point[0], props.box!.center[1], point[1]) : planeToWorld(point)
      const [x, y] = worldToSvg(world)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ') + ' Z'
})

interface HandleDefinition {
  key: BoxHandle
  planePosition: Vec2
  svgPosition: Vec2
}

const handles = computed<HandleDefinition[]>(() => {
  projectionVersion.value
  if (!props.box) {
    return []
  }

  if (props.view === 'top') {
    const [cx, , cz] = props.box.center
    const halfX = props.box.size[0] * 0.5
    const halfZ = props.box.size[2] * 0.5
    const localAnchors: Array<[BoxHandle, Vec2]> = [
      ['nw', [-halfX, -halfZ]],
      ['n', [0, -halfZ]],
      ['ne', [halfX, -halfZ]],
      ['e', [halfX, 0]],
      ['se', [halfX, halfZ]],
      ['s', [0, halfZ]],
      ['sw', [-halfX, halfZ]],
      ['w', [-halfX, 0]],
    ]

    const projectedHandles = localAnchors.map(([key, [localX, localZ]]) => {
      const [worldX, worldZ] = rotateXZ(localX, localZ, props.box!.yaw)
      const planePosition: Vec2 = [cx + worldX, cz + worldZ]
      return {
        key,
        planePosition,
        svgPosition: worldToSvg(new THREE.Vector3(planePosition[0], props.box!.center[1], planePosition[1])),
      }
    })

    const rotationOffset = halfZ + Math.max(props.box.size[0], props.box.size[2]) * 0.24
    const [rotationX, rotationZ] = rotateXZ(0, -rotationOffset, props.box.yaw)
    const rotationPosition: Vec2 = [cx + rotationX, cz + rotationZ]
    projectedHandles.push({
      key: 'rotate',
      planePosition: rotationPosition,
      svgPosition: worldToSvg(new THREE.Vector3(rotationPosition[0], props.box!.center[1], rotationPosition[1])),
    })

    return projectedHandles
  }

  const points = polygon.value.map((point) => {
    return worldToSvg(planeToWorld(point))
  })
  const planePoints = polygon.value
  const [nw, ne, se, sw] = points
  const [pnw, pne, pse, psw] = planePoints
  const middle = (first: Vec2, second: Vec2): Vec2 => [(first[0] + second[0]) * 0.5, (first[1] + second[1]) * 0.5]
  return [
    { key: 'nw', planePosition: pnw, svgPosition: nw },
    { key: 'n', planePosition: middle(pnw, pne), svgPosition: middle(nw, ne) },
    { key: 'ne', planePosition: pne, svgPosition: ne },
    { key: 'e', planePosition: middle(pne, pse), svgPosition: middle(ne, se) },
    { key: 'se', planePosition: pse, svgPosition: se },
    { key: 's', planePosition: middle(pse, psw), svgPosition: middle(se, sw) },
    { key: 'sw', planePosition: psw, svgPosition: sw },
    { key: 'w', planePosition: middle(psw, pnw), svgPosition: middle(sw, nw) },
  ]
})

function screenToPlane(
  clientX: number,
  clientY: number,
  context?: {
    camera: THREE.OrthographicCamera
    planeNormal: THREE.Vector3
    planeOrigin: THREE.Vector3
    boxCenter: Vec3 | null
    boxYaw: number
  },
): Vec2 {
  const activeCamera = context?.camera || camera
  if (!activeCamera || !viewportRef.value) {
    return [0, 0]
  }

  const rect = viewportRef.value.getBoundingClientRect()
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, activeCamera)
  const planeNormal = context?.planeNormal || getViewBasis().planeNormal
  const planeOrigin = context?.planeOrigin || getViewBasis().planeOrigin
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeOrigin)
  const hit = new THREE.Vector3()
  raycaster.ray.intersectPlane(plane, hit)
  const boxCenter = context?.boxCenter || (props.box ? props.box.center : null)
  const boxYaw = context?.boxYaw ?? props.box?.yaw ?? 0

  if (props.view === 'top') {
    return [hit.x, hit.z]
  }
  if (props.view === 'front') {
    if (!boxCenter) {
      return [hit.x, hit.y]
    }
    const [localX] = inverseRotateXZ(hit.x - boxCenter[0], hit.z - boxCenter[2], boxYaw)
    return [localX, hit.y - boxCenter[1]]
  }
  if (!boxCenter) {
    return [hit.z, hit.y]
  }
  const [, localZ] = inverseRotateXZ(hit.x - boxCenter[0], hit.z - boxCenter[2], boxYaw)
  return [localZ, hit.y - boxCenter[1]]
}

function onPointerDown(event: PointerEvent, handle: BoxHandle) {
  if (!props.box) {
    return
  }

  event.preventDefault()
  activeHandle.value = handle
  activePointerId = event.pointerId
  const basis = getViewBasis()
  dragContext = {
    camera: camera!.clone(),
    planeNormal: basis.planeNormal.clone(),
    planeOrigin: basis.planeOrigin.clone(),
    boxCenter: [...props.box.center] as Vec3,
    boxYaw: props.box.yaw,
  }
  dragState = createBoxDragState(props.box, props.view, handle, screenToPlane(event.clientX, event.clientY, dragContext))
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (dragState && activePointerId === event.pointerId) {
    emit('update:box', updateBox3DFromDrag(dragState, screenToPlane(event.clientX, event.clientY, dragContext || undefined)))
    return
  }

  if (panPointerId === event.pointerId && panStartPointer) {
    const pointer = screenToPlane(event.clientX, event.clientY, panContext || undefined)
    panOffset.value = [
      panStartOffset[0] - (pointer[0] - panStartPointer[0]),
      panStartOffset[1] - (pointer[1] - panStartPointer[1]),
    ]
    updateCamera()
  }
}

function onPointerUp(event: PointerEvent) {
  if (activePointerId === event.pointerId) {
    dragState = null
    activeHandle.value = null
    activePointerId = null
    dragContext = null
  }

  if (panPointerId === event.pointerId) {
    panPointerId = null
    panStartPointer = null
    panContext = null
  }
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function onViewportPanStart(event: PointerEvent) {
  if (event.target !== svgRef.value) {
    return
  }

  event.preventDefault()
  panPointerId = event.pointerId
  const basis = getViewBasis()
  panContext = {
    camera: camera!.clone(),
    planeNormal: basis.planeNormal.clone(),
    planeOrigin: basis.planeOrigin.clone(),
    boxCenter: props.box ? ([...props.box.center] as Vec3) : null,
    boxYaw: props.box?.yaw ?? 0,
  }
  panStartPointer = screenToPlane(event.clientX, event.clientY, panContext)
  panStartOffset = [...panOffset.value] as Vec2
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function recenterToCurrentAsset() {
  if (props.box) {
    framedCenter.value = [...props.box.center] as Vec3
    framedAssetId.value = props.selectedAssetId
  } else {
    framedCenter.value = null
    framedAssetId.value = ''
  }
  panOffset.value = [0, 0]
  updateCamera()
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8fafc)
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.localClippingEnabled = true
  viewportRef.value?.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xffffff, 1.6))
  const light = new THREE.DirectionalLight(0xffffff, 1.15)
  light.position.set(6, 8, 4)
  scene.add(light)

  resizeObserver = new ResizeObserver(() => resizeRenderer())
  if (viewportRef.value) {
    resizeObserver.observe(viewportRef.value)
  }

  loadMeshes().catch(console.error)
  rebuildAssetGroup()
  resizeRenderer()
  animate()
})

onBeforeUnmount(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  dragContext = null
  disposeGroup(layoutGroup)
  disposeGroup(rawGroup)
  disposeGroup(assetGroup)
  renderer?.dispose()
})

watch(
  () => props.meshes,
  () => {
    loadMeshes().catch(console.error)
  },
  { deep: true },
)

watch(
  () => props.selectedViews,
  () => {
    if (layoutGroup) {
      layoutGroup.visible = props.selectedViews.includes('Layout')
    }
    if (rawGroup) {
      rawGroup.visible = props.selectedViews.includes('Mesh')
    }
    updateSceneBounds()
  },
  { deep: true },
)

watch(
  () => props.localPoints,
  () => {
    rebuildAssetGroup()
  },
  { deep: true },
)

watch(
  () => props.localBounds,
  () => {
    rebuildAssetGroup()
  },
  { deep: true },
)

watch(
  () => props.box,
  () => {
    updateAssetTransform()
    applyClippingToGroup(layoutGroup)
    applyClippingToGroup(rawGroup)
  },
  { deep: true },
)

watch(
  () => props.workspaceZoom,
  () => {
    updateCamera()
  },
)

watch(
  () => props.selectedAssetId,
  () => {
    recenterToCurrentAsset()
  },
)

watch(
  () => props.box,
  (box) => {
    if (box && framedAssetId.value !== props.selectedAssetId) {
      framedCenter.value = [...box.center] as Vec3
      framedAssetId.value = props.selectedAssetId
      panOffset.value = [0, 0]
      updateCamera()
      return
    }

    if (!framedCenter.value && box) {
      framedCenter.value = [...box.center] as Vec3
      framedAssetId.value = props.selectedAssetId
      updateCamera()
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <article class="ortho-card ortho-card--tall">
    <div class="ortho-card__header">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </div>
      <span class="aligned-pill">Aligned</span>
    </div>

    <div class="ortho-card__stage">
      <div ref="viewportRef" class="ortho-card__viewport"></div>
      <svg ref="svgRef" class="ortho-card__overlay" viewBox="0 0 392 154" preserveAspectRatio="none" @pointerdown="onViewportPanStart">
        <path v-if="polygonPath" class="ortho-box__fill" :d="polygonPath" @pointerdown="onPointerDown($event, 'move')" />
        <path
          v-if="polygonPath"
          class="ortho-box__stroke"
          :class="{ 'ortho-box__stroke--collision': hasGeometryCollision }"
          :d="polygonPath"
        />
        <line
          v-if="view === 'top' && handles.find((handle) => handle.key === 'rotate')"
          class="ortho-box__rotation-link"
          :x1="handles.find((handle) => handle.key === 'n')?.svgPosition[0] || 0"
          :y1="handles.find((handle) => handle.key === 'n')?.svgPosition[1] || 0"
          :x2="handles.find((handle) => handle.key === 'rotate')?.svgPosition[0] || 0"
          :y2="handles.find((handle) => handle.key === 'rotate')?.svgPosition[1] || 0"
        />
        <g class="ortho-box__handles">
          <circle
            v-for="handle in handles"
            :key="`${view}-${handle.key}`"
            :cx="handle.svgPosition[0]"
            :cy="handle.svgPosition[1]"
            :r="handle.key === 'rotate' ? 5 : 4.2"
            class="ortho-box__handle"
            :class="{
              'ortho-box__handle--active': activeHandle === handle.key,
              'ortho-box__handle--rotate': handle.key === 'rotate',
            }"
            @pointerdown="onPointerDown($event, handle.key)"
          />
        </g>
      </svg>
    </div>
  </article>
</template>
