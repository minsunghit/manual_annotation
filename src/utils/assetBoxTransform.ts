import * as THREE from 'three'

import type { Box3D, RoomAnchor, Vec3, Vec4, WorkspaceAsset } from '../types/workspace'
import { clampBoxSize, rotateXZ } from './box3dMath'

export interface LocalBounds {
  center: Vec3
  size: Vec3
}

function roomOffset(roomAnchor: RoomAnchor | null): Vec3 {
  const offset = roomAnchor?.position
  return Array.isArray(offset) && offset.length === 3 ? offset : [0, 0, 0]
}

export function roomYaw(roomAnchor: RoomAnchor | null): number {
  return typeof roomAnchor?.longitude === 'number' ? roomAnchor.longitude : 0
}

export function quaternionFromWxyz(rotation: Vec4): THREE.Quaternion {
  return new THREE.Quaternion(rotation[1], rotation[2], rotation[3], rotation[0]).normalize()
}

export function extractYaw(rotation: Vec4): number {
  const euler = new THREE.Euler().setFromQuaternion(quaternionFromWxyz(rotation), 'YXZ')
  return euler.y
}

export function getLocalBounds(points: Vec3[]): LocalBounds {
  if (points.length === 0) {
    return {
      center: [0, 0, 0],
      size: [1, 1, 1],
    }
  }

  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (const [x, y, z] of points) {
    min[0] = Math.min(min[0], x)
    min[1] = Math.min(min[1], y)
    min[2] = Math.min(min[2], z)
    max[0] = Math.max(max[0], x)
    max[1] = Math.max(max[1], y)
    max[2] = Math.max(max[2], z)
  }

  return {
    center: [(min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5],
    size: [clampBoxSize(max[0] - min[0]), clampBoxSize(max[1] - min[1]), clampBoxSize(max[2] - min[2])],
  }
}

export function estimateLocalYaw(points: Vec3[]): number {
  if (points.length < 2) {
    return 0
  }

  let meanX = 0
  let meanZ = 0
  for (const [x, , z] of points) {
    meanX += x
    meanZ += z
  }
  meanX /= points.length
  meanZ /= points.length

  let covXX = 0
  let covXZ = 0
  let covZZ = 0
  for (const [x, , z] of points) {
    const dx = x - meanX
    const dz = z - meanZ
    covXX += dx * dx
    covXZ += dx * dz
    covZZ += dz * dz
  }

  return 0.5 * Math.atan2(2 * covXZ, covXX - covZZ)
}

export function rotateLocalPointsY(points: Vec3[], yaw: number): Vec3[] {
  return points.map(([x, y, z]) => {
    const [rx, rz] = rotateXZ(x, z, yaw)
    return [rx, y, rz]
  })
}

export function getAssetBaseTranslation(asset: WorkspaceAsset, roomAnchor: RoomAnchor | null, floorY: number): Vec3 {
  const [offsetX, , offsetZ] = roomOffset(roomAnchor)
  const [tx, ty, tz] = asset.pose.translation
  const yaw = -roomYaw(roomAnchor)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  return [tx * cosYaw - tz * sinYaw + offsetX, floorY + ty, tx * sinYaw + tz * cosYaw + offsetZ]
}

export function createInitialBoxFromAsset(
  asset: WorkspaceAsset,
  roomAnchor: RoomAnchor | null,
  floorY: number,
  localBounds: LocalBounds,
  localYaw = 0,
): Box3D {
  const scale = asset.pose.scale
  const boxYaw = -roomYaw(roomAnchor) - extractYaw(asset.pose.rotation) + localYaw
  const scaledCenter: Vec3 = [
    localBounds.center[0] * scale[0],
    localBounds.center[1] * scale[1],
    localBounds.center[2] * scale[2],
  ]
  const [baseX, baseY, baseZ] = getAssetBaseTranslation(asset, roomAnchor, floorY)
  const [rotatedX, rotatedZ] = rotateXZ(scaledCenter[0], scaledCenter[2], boxYaw)

  return {
    center: [baseX + rotatedX, baseY + scaledCenter[1], baseZ + rotatedZ],
    size: [
      clampBoxSize(localBounds.size[0] * scale[0]),
      clampBoxSize(localBounds.size[1] * scale[1]),
      clampBoxSize(localBounds.size[2] * scale[2]),
    ],
    yaw: boxYaw,
  }
}

export function getAssetWorldQuaternion(asset: WorkspaceAsset, roomAnchor: RoomAnchor | null, localYaw = 0): THREE.Quaternion {
  const roomQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -roomYaw(roomAnchor))
  const assetQuaternion = quaternionFromWxyz(asset.pose.rotation)
  const localQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), localYaw)
  return roomQuaternion.multiply(assetQuaternion).multiply(localQuaternion).normalize()
}

export function getAssetWorldCenter(
  asset: WorkspaceAsset,
  roomAnchor: RoomAnchor | null,
  floorY: number,
  localBounds: LocalBounds,
  localYaw = 0,
): Vec3 {
  const [baseX, baseY, baseZ] = getAssetBaseTranslation(asset, roomAnchor, floorY)
  const scale = asset.pose.scale
  const scaledCenter = new THREE.Vector3(
    localBounds.center[0] * scale[0],
    localBounds.center[1] * scale[1],
    localBounds.center[2] * scale[2],
  )
  scaledCenter.applyQuaternion(getAssetWorldQuaternion(asset, roomAnchor, localYaw))
  return [baseX + scaledCenter.x, baseY + scaledCenter.y, baseZ + scaledCenter.z]
}

export function applyBoxTransformToGroup(
  group: THREE.Object3D,
  box: Box3D,
  localBounds: LocalBounds,
): void {
  const scaleX = box.size[0] / Math.max(localBounds.size[0], 1e-4)
  const scaleY = box.size[1] / Math.max(localBounds.size[1], 1e-4)
  const scaleZ = box.size[2] / Math.max(localBounds.size[2], 1e-4)

  group.position.set(box.center[0], box.center[1], box.center[2])
  group.rotation.set(0, box.yaw, 0)
  group.scale.set(scaleX, scaleY, scaleZ)
}

export function applyAssetPoseTransformToGroup(
  group: THREE.Object3D,
  asset: WorkspaceAsset,
  roomAnchor: RoomAnchor | null,
  floorY: number,
  localBounds: LocalBounds,
  localYaw = 0,
): void {
  const center = getAssetWorldCenter(asset, roomAnchor, floorY, localBounds, localYaw)
  const quaternion = getAssetWorldQuaternion(asset, roomAnchor, localYaw)
  const scale = asset.pose.scale

  group.position.set(center[0], center[1], center[2])
  group.quaternion.copy(quaternion)
  group.scale.set(scale[0], scale[1], scale[2])
}

export function createPointCloudObject(localPoints: Vec3[], color = 0x5eead4, pointSize = 0.028): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(localPoints.flat())
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size: pointSize,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  })

  const points = new THREE.Points(geometry, material)
  points.renderOrder = 20
  return points
}
