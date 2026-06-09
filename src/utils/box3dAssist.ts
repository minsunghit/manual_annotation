import type { AssetCollisionProxy, Box3D, Box3DUpdatePayload, SceneSnapEnvironment, Vec3 } from '../types/workspace'
import type { LocalBounds } from './assetBoxTransform'
import { getBox3DCorners, inverseRotateXZ, rotateXZ } from './box3dMath'

const SNAP_DISTANCE = 0.08
const OBJECT_SNAP_DISTANCE = 0.16
const YAW_SNAP_RADIANS = (5 * Math.PI) / 180
const COLLISION_DISTANCE = 0.02
const MAX_COLLISION_POINTS = 2000
const WALL_COLLISION_DISTANCE = 0.035

export interface AssistState {
  box: Box3D
  collision: boolean
  collisionResolved: boolean
  message: string
}

type CollisionKind = 'asset' | 'room'

function cloneBox(box: Box3D): Box3D {
  return {
    center: [...box.center] as Vec3,
    size: [...box.size] as Vec3,
    yaw: box.yaw,
  }
}

function normalizeYaw(yaw: number): number {
  let nextYaw = yaw
  while (nextYaw > Math.PI) nextYaw -= Math.PI * 2
  while (nextYaw < -Math.PI) nextYaw += Math.PI * 2
  return nextYaw
}

function yawDistance(left: number, right: number): number {
  return Math.abs(normalizeYaw(left - right))
}

function samplePoints(points: Vec3[], maxPoints = MAX_COLLISION_POINTS): Vec3[] {
  if (points.length <= maxPoints) {
    return points
  }

  const step = Math.max(Math.floor(points.length / maxPoints), 1)
  const sampled: Vec3[] = []
  for (let index = 0; index < points.length && sampled.length < maxPoints; index += step) {
    sampled.push(points[index])
  }
  return sampled
}

function getFootprintEdges(box: Box3D) {
  const corners = getBox3DCorners(box)
    .filter((point) => point[1] < box.center[1])
    .map(([x, , z]) => [x, z] as [number, number])
  const xs = corners.map(([x]) => x)
  const zs = corners.map(([, z]) => z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function getLocalAabbEdges(localBounds: LocalBounds, box: Box3D) {
  const halfX = localBounds.size[0] * 0.5 * (box.size[0] / Math.max(localBounds.size[0], 1e-4))
  const halfZ = localBounds.size[2] * 0.5 * (box.size[2] / Math.max(localBounds.size[2], 1e-4))
  return {
    minX: box.center[0] - halfX,
    maxX: box.center[0] + halfX,
    minZ: box.center[2] - halfZ,
    maxZ: box.center[2] + halfZ,
  }
}

function snapScalar(value: number, references: number[], threshold: number): number {
  let bestValue = value
  let bestDistance = threshold
  for (const reference of references) {
    const distance = Math.abs(reference - value)
    if (distance < bestDistance) {
      bestDistance = distance
      bestValue = reference
    }
  }
  return bestValue
}

function getSnapDelta(value: number, references: number[], threshold: number): { delta: number; distance: number } | null {
  let best: { delta: number; distance: number } | null = null
  for (const reference of references) {
    const distance = Math.abs(reference - value)
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { delta: reference - value, distance }
    }
  }
  return best
}

function snapYaw(yaw: number, wallYaws: number[]): number {
  const references = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5, ...wallYaws]
  let bestYaw = yaw
  let bestDistance = YAW_SNAP_RADIANS
  for (const reference of references) {
    const distance = yawDistance(yaw, reference)
    if (distance < bestDistance) {
      bestDistance = distance
      bestYaw = reference
    }
  }
  return normalizeYaw(bestYaw)
}

function getBottomProbePoints(box: Box3D): Vec3[] {
  const bottomY = box.center[1] - box.size[1] * 0.5
  const halfX = box.size[0] * 0.5
  const halfZ = box.size[2] * 0.5
  const probes: Vec3[] = [[box.center[0], bottomY, box.center[2]]]
  for (const [localX, localZ] of [
    [-halfX, -halfZ],
    [halfX, -halfZ],
    [halfX, halfZ],
    [-halfX, halfZ],
  ] as Array<[number, number]>) {
    const [x, z] = rotateXZ(localX, localZ, box.yaw)
    probes.push([box.center[0] + x, bottomY, box.center[2] + z])
  }
  return probes
}

function findSupportY(box: Box3D, environment: SceneSnapEnvironment): number | null {
  const probes = getBottomProbePoints(box)
  let bestY: number | null = null
  let bestDistance = SNAP_DISTANCE
  const radiusSq = 0.12 * 0.12

  for (const probe of probes) {
    for (const support of environment.supportSurfaces) {
      const dx = support[0] - probe[0]
      const dz = support[2] - probe[2]
      const distanceSq = dx * dx + dz * dz
      if (distanceSq > radiusSq) {
        continue
      }
      if (support[1] > probe[1] + box.size[1]) {
        continue
      }

      const verticalDistance = Math.abs(probe[1] - support[1])
      if (verticalDistance < bestDistance) {
        bestDistance = verticalDistance
        bestY = support[1]
      }
    }
  }

  const bottomY = box.center[1] - box.size[1] * 0.5
  if (typeof environment.floorY === 'number' && Math.abs(bottomY - environment.floorY) < bestDistance) {
    bestY = environment.floorY
  }

  return bestY
}

function getTransformedAssetBounds(asset: AssetCollisionProxy) {
  if (asset.localPoints.length === 0) {
    return getFootprintEdges(asset.box)
  }

  const points = getWorldPoints(asset.localPoints, asset.box, asset.localBounds)
  return getPointCloudBounds(points)
}

function snapVerticalIfClose(box: Box3D, environment: SceneSnapEnvironment): Box3D {
  const nextBox = cloneBox(box)
  const supportY = findSupportY(nextBox, environment)
  if (typeof supportY === 'number') {
    nextBox.center[1] = supportY + nextBox.size[1] * 0.5
    return nextBox
  }

  if (typeof environment.ceilingY === 'number') {
    const topY = nextBox.center[1] + nextBox.size[1] * 0.5
    if (Math.abs(topY - environment.ceilingY) <= SNAP_DISTANCE) {
      nextBox.center[1] = environment.ceilingY - nextBox.size[1] * 0.5
    }
  }

  const bottomY = nextBox.center[1] - nextBox.size[1] * 0.5
  const topY = nextBox.center[1] + nextBox.size[1] * 0.5
  const objectReferences: number[] = []
  for (const asset of environment.assets) {
    const bounds = getTransformedAssetBounds(asset)
    objectReferences.push(bounds.minY, bounds.maxY)
  }

  const bottomSnap = getSnapDelta(bottomY, objectReferences, OBJECT_SNAP_DISTANCE)
  const topSnap = getSnapDelta(topY, objectReferences, OBJECT_SNAP_DISTANCE)
  if (bottomSnap && (!topSnap || bottomSnap.distance <= topSnap.distance)) {
    nextBox.center[1] += bottomSnap.delta
  } else if (topSnap) {
    nextBox.center[1] += topSnap.delta
  }

  return nextBox
}

function snapAxisAlignedFootprint(box: Box3D, environment: SceneSnapEnvironment, localBounds: LocalBounds | null): Box3D {
  const nextBox = cloneBox(box)
  const referencesX: number[] = []
  const referencesZ: number[] = []

  if (environment.roomBounds) {
    referencesX.push(environment.roomBounds.minX, environment.roomBounds.maxX)
    referencesZ.push(environment.roomBounds.minZ, environment.roomBounds.maxZ)
  }

  for (const asset of environment.assets) {
    const bounds = getTransformedAssetBounds(asset)
    referencesX.push(bounds.minX, bounds.maxX)
    referencesZ.push(bounds.minZ, bounds.maxZ)
  }

  if (localBounds) {
    const edges = getLocalAabbEdges(localBounds, nextBox)
    referencesX.push(edges.minX, edges.maxX)
    referencesZ.push(edges.minZ, edges.maxZ)
  }

  const edges = getFootprintEdges(nextBox)
  const candidates: Array<{ axis: 0 | 2; delta: number; distance: number }> = []
  for (const [, value] of [
    ['minX', edges.minX],
    ['maxX', edges.maxX],
  ] as const) {
    const snapped = snapScalar(value, referencesX, OBJECT_SNAP_DISTANCE)
    if (snapped !== value) {
      candidates.push({ axis: 0, delta: snapped - value, distance: Math.abs(snapped - value) })
    }
  }
  for (const [, value] of [
    ['minZ', edges.minZ],
    ['maxZ', edges.maxZ],
  ] as const) {
    const snapped = snapScalar(value, referencesZ, OBJECT_SNAP_DISTANCE)
    if (snapped !== value) {
      candidates.push({ axis: 2, delta: snapped - value, distance: Math.abs(snapped - value) })
    }
  }

  candidates.sort((left, right) => left.distance - right.distance)
  const usedAxes = new Set<0 | 2>()
  for (const candidate of candidates) {
    if (usedAxes.has(candidate.axis)) {
      continue
    }
    nextBox.center[candidate.axis] += candidate.delta
    usedAxes.add(candidate.axis)
  }

  return nextBox
}

function snapObjectFaceIfClose(box: Box3D, environment: SceneSnapEnvironment): Box3D {
  const nextBox = cloneBox(box)
  const edges = getFootprintEdges(nextBox)
  const candidates: Array<{ axis: 0 | 2; delta: number; distance: number }> = []

  for (const asset of environment.assets) {
    const bounds = getTransformedAssetBounds(asset)
    const xPairs: Array<[number, number]> = [
      [edges.minX, bounds.maxX],
      [edges.maxX, bounds.minX],
      [edges.minX, bounds.minX],
      [edges.maxX, bounds.maxX],
    ]
    const zPairs: Array<[number, number]> = [
      [edges.minZ, bounds.maxZ],
      [edges.maxZ, bounds.minZ],
      [edges.minZ, bounds.minZ],
      [edges.maxZ, bounds.maxZ],
    ]

    for (const [edge, reference] of xPairs) {
      const distance = Math.abs(reference - edge)
      if (distance <= OBJECT_SNAP_DISTANCE) {
        candidates.push({ axis: 0, delta: reference - edge, distance })
      }
    }
    for (const [edge, reference] of zPairs) {
      const distance = Math.abs(reference - edge)
      if (distance <= OBJECT_SNAP_DISTANCE) {
        candidates.push({ axis: 2, delta: reference - edge, distance })
      }
    }
  }

  candidates.sort((left, right) => left.distance - right.distance)
  const usedAxes = new Set<0 | 2>()
  for (const candidate of candidates) {
    if (usedAxes.has(candidate.axis)) {
      continue
    }
    nextBox.center[candidate.axis] += candidate.delta
    usedAxes.add(candidate.axis)
  }

  return nextBox
}

function snapToWallPlaneIfClose(box: Box3D, environment: SceneSnapEnvironment): Box3D {
  const nextBox = cloneBox(box)
  const footprint = getBox3DCorners(nextBox).filter((point) => point[1] < nextBox.center[1])
  let best: { deltaX: number; deltaZ: number; distance: number } | null = null

  for (const wall of environment.wallSurfaces) {
    for (const point of footprint) {
      if (point[1] < wall.minY - SNAP_DISTANCE || point[1] > wall.maxY + SNAP_DISTANCE) {
        continue
      }

      const tangentValue = point[0] * wall.tangent[0] + point[1] * wall.tangent[1] + point[2] * wall.tangent[2]
      if (tangentValue < wall.minT - SNAP_DISTANCE || tangentValue > wall.maxT + SNAP_DISTANCE) {
        continue
      }

      const signedDistance =
        (point[0] - wall.point[0]) * wall.normal[0] + (point[2] - wall.point[2]) * wall.normal[2]
      const distance = Math.abs(signedDistance)
      if (distance > SNAP_DISTANCE || (best && distance >= best.distance)) {
        continue
      }

      best = {
        deltaX: -signedDistance * wall.normal[0],
        deltaZ: -signedDistance * wall.normal[2],
        distance,
      }
    }
  }

  if (best) {
    nextBox.center[0] += best.deltaX
    nextBox.center[2] += best.deltaZ
  }

  return nextBox
}

export function applySnap(
  box: Box3D,
  previousBox: Box3D | null,
  environment: SceneSnapEnvironment | null,
  localBounds: LocalBounds | null,
  context: Pick<Box3DUpdatePayload, 'view' | 'handle'> | null = null,
): Box3D {
  if (!environment) {
    return cloneBox(box)
  }

  const nextBox = cloneBox(box)
  const handle = context?.handle
  const view = context?.view
  const shouldSnapYaw = !handle || handle === 'rotate'
  const shouldSnapHorizontal = !handle || view === 'top' || handle === 'move' || ['e', 'w', 'ne', 'nw', 'se', 'sw'].includes(handle)
  const shouldSnapVertical = !handle || view === 'front' || view === 'side'

  if (shouldSnapYaw) {
    nextBox.yaw = snapYaw(nextBox.yaw, environment.wallYaws)
  }

  let snappedBox = nextBox
  if (shouldSnapHorizontal) {
    snappedBox = snapAxisAlignedFootprint(snappedBox, environment, localBounds)
    snappedBox = snapObjectFaceIfClose(snappedBox, environment)
    snappedBox = snapToWallPlaneIfClose(snappedBox, environment)
  }
  if (shouldSnapVertical) {
    snappedBox = snapVerticalIfClose(snappedBox, environment)
  }

  return previousBox ? snappedBox : cloneBox(snappedBox)
}

function transformPointToWorld(point: Vec3, box: Box3D, localBounds: LocalBounds): Vec3 {
  const scaleX = box.size[0] / Math.max(localBounds.size[0], 1e-4)
  const scaleY = box.size[1] / Math.max(localBounds.size[1], 1e-4)
  const scaleZ = box.size[2] / Math.max(localBounds.size[2], 1e-4)
  const localX = (point[0] - localBounds.center[0]) * scaleX
  const localY = (point[1] - localBounds.center[1]) * scaleY
  const localZ = (point[2] - localBounds.center[2]) * scaleZ
  const [x, z] = rotateXZ(localX, localZ, box.yaw)
  return [box.center[0] + x, box.center[1] + localY, box.center[2] + z]
}

function getWorldPoints(points: Vec3[], box: Box3D, localBounds: LocalBounds): Vec3[] {
  return samplePoints(points).map((point) => transformPointToWorld(point, box, localBounds))
}

function broadPhaseOverlaps(left: Box3D, right: Box3D): boolean {
  const leftEdges = getFootprintEdges(left)
  const rightEdges = getFootprintEdges(right)
  const yOverlap = Math.abs(left.center[1] - right.center[1]) <= (left.size[1] + right.size[1]) * 0.5
  return (
    yOverlap &&
    leftEdges.minX <= rightEdges.maxX &&
    leftEdges.maxX >= rightEdges.minX &&
    leftEdges.minZ <= rightEdges.maxZ &&
    leftEdges.maxZ >= rightEdges.minZ
  )
}

function hasPointCloudCollision(currentPoints: Vec3[], otherPoints: Vec3[]): boolean {
  const thresholdSq = COLLISION_DISTANCE * COLLISION_DISTANCE
  const cellSize = COLLISION_DISTANCE
  const buckets = new Map<string, Vec3[]>()
  const keyOf = ([x, y, z]: Vec3) =>
    `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`

  for (const point of otherPoints) {
    const key = keyOf(point)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(point)
    } else {
      buckets.set(key, [point])
    }
  }

  for (const left of currentPoints) {
    const baseX = Math.floor(left[0] / cellSize)
    const baseY = Math.floor(left[1] / cellSize)
    const baseZ = Math.floor(left[2] / cellSize)
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          const bucket = buckets.get(`${baseX + offsetX},${baseY + offsetY},${baseZ + offsetZ}`)
          if (!bucket) {
            continue
          }

          for (const right of bucket) {
            const dx = left[0] - right[0]
            const dy = left[1] - right[1]
            const dz = left[2] - right[2]
            if (dx * dx + dy * dy + dz * dz < thresholdSq) {
              return true
            }
          }
        }
      }
    }
  }
  return false
}

function getPointCloudBounds(points: Vec3[]) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const zs = points.map(([, , z]) => z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function getRoomCollisionPush(points: Vec3[], environment: SceneSnapEnvironment): Vec3 | null {
  if (points.length === 0) {
    return null
  }

  const bounds = getPointCloudBounds(points)
  const pushes: Vec3[] = []

  if (typeof environment.floorY === 'number' && bounds.minY < environment.floorY - COLLISION_DISTANCE) {
    pushes.push([0, environment.floorY - bounds.minY + COLLISION_DISTANCE, 0])
  }
  if (typeof environment.ceilingY === 'number' && bounds.maxY > environment.ceilingY + COLLISION_DISTANCE) {
    pushes.push([0, environment.ceilingY - bounds.maxY - COLLISION_DISTANCE, 0])
  }
  let bestWallPush: Vec3 | null = null
  let bestWallPenetration = 0
  const roomPoints = samplePoints(points, 900)
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
  for (const wall of environment.wallSurfaces) {
    let minSigned = Number.POSITIVE_INFINITY
    let maxSigned = Number.NEGATIVE_INFINITY

    for (const point of roomPoints) {
      if (point[1] < wall.minY - COLLISION_DISTANCE || point[1] > wall.maxY + COLLISION_DISTANCE) {
        continue
      }

      const pointT = point[0] * wall.tangent[0] + point[1] * wall.tangent[1] + point[2] * wall.tangent[2]
      if (pointT < wall.minT - COLLISION_DISTANCE || pointT > wall.maxT + COLLISION_DISTANCE) {
        continue
      }

      const dx = point[0] - wall.point[0]
      const dz = point[2] - wall.point[2]
      const signedDistance = dx * wall.normal[0] + dz * wall.normal[2]
      minSigned = Math.min(minSigned, signedDistance)
      maxSigned = Math.max(maxSigned, signedDistance)
    }

    if (!Number.isFinite(minSigned) || !Number.isFinite(maxSigned)) {
      continue
    }

    const centerSignedDistance =
      centerX * wall.normal[0] +
      centerZ * wall.normal[2] -
      (wall.point[0] * wall.normal[0] + wall.point[2] * wall.normal[2])
    const directionSign = Math.sign(centerSignedDistance || 1)
    const sideDistance = directionSign > 0 ? minSigned : -maxSigned
    const crossedPlane = minSigned <= 0 && maxSigned >= 0
    const pushDistance = crossedPlane
      ? WALL_COLLISION_DISTANCE + Math.min(Math.abs(minSigned), Math.abs(maxSigned))
      : WALL_COLLISION_DISTANCE - sideDistance

    if (pushDistance > bestWallPenetration) {
      bestWallPenetration = pushDistance
      bestWallPush = [
        wall.normal[0] * directionSign * (pushDistance + COLLISION_DISTANCE),
        0,
        wall.normal[2] * directionSign * (pushDistance + COLLISION_DISTANCE),
      ]
    }
  }

  if (bestWallPush) {
    pushes.push(bestWallPush)
  }

  if (pushes.length === 0) {
    return null
  }

  return pushes.reduce<Vec3>(
    (sum, push) => [sum[0] + push[0], sum[1] + push[1], sum[2] + push[2]],
    [0, 0, 0],
  )
}

function getSeparationCandidate(currentBox: Box3D, otherBox: Box3D): Vec3 {
  const current = getFootprintEdges(currentBox)
  const other = getFootprintEdges(otherBox)
  const pushLeft = other.minX - current.maxX - SNAP_DISTANCE
  const pushRight = other.maxX - current.minX + SNAP_DISTANCE
  const pushBack = other.minZ - current.maxZ - SNAP_DISTANCE
  const pushForward = other.maxZ - current.minZ + SNAP_DISTANCE
  const candidates: Vec3[] = [
    [pushLeft, 0, 0],
    [pushRight, 0, 0],
    [0, 0, pushBack],
    [0, 0, pushForward],
  ]
  return candidates.reduce((best, candidate) => {
    const bestLength = Math.abs(best[0]) + Math.abs(best[2])
    const candidateLength = Math.abs(candidate[0]) + Math.abs(candidate[2])
    return candidateLength < bestLength ? candidate : best
  })
}

export function evaluateCollision(
  box: Box3D,
  localPoints: Vec3[],
  localBounds: LocalBounds | null,
  environment: SceneSnapEnvironment | null,
): { collision: boolean; kind: CollisionKind | null; collidingAsset: AssetCollisionProxy | null; roomPush: Vec3 | null } {
  if (!environment || !localBounds || localPoints.length === 0) {
    return { collision: false, kind: null, collidingAsset: null, roomPush: null }
  }

  const currentPoints = getWorldPoints(localPoints, box, localBounds)
  const roomPush = getRoomCollisionPush(currentPoints, environment)
  if (roomPush) {
    return { collision: true, kind: 'room', collidingAsset: null, roomPush }
  }

  for (const asset of environment.assets) {
    if (!broadPhaseOverlaps(box, asset.box)) {
      continue
    }

    const otherPoints = getWorldPoints(asset.localPoints, asset.box, asset.localBounds)
    if (hasPointCloudCollision(currentPoints, otherPoints)) {
      return { collision: true, kind: 'asset', collidingAsset: asset, roomPush: null }
    }
  }

  return { collision: false, kind: null, collidingAsset: null, roomPush: null }
}

export function applyCollisionAvoidance(
  box: Box3D,
  localPoints: Vec3[],
  localBounds: LocalBounds | null,
  environment: SceneSnapEnvironment | null,
  enabled: boolean,
): AssistState {
  const initial = evaluateCollision(box, localPoints, localBounds, environment)
  if (!initial.collision) {
    return {
      box,
      collision: false,
      collisionResolved: false,
      message: '',
    }
  }

  if (!enabled) {
    return {
      box,
      collision: true,
      collisionResolved: false,
      message: initial.kind === 'room' ? 'Room geometry collision detected' : 'Geometry collision detected',
    }
  }

  const resolvedBox = cloneBox(box)
  if (initial.kind === 'room' && initial.roomPush) {
    resolvedBox.center[0] += initial.roomPush[0]
    resolvedBox.center[1] += initial.roomPush[1]
    resolvedBox.center[2] += initial.roomPush[2]
  } else if (initial.collidingAsset) {
    const separation = getSeparationCandidate(box, initial.collidingAsset.box)
    resolvedBox.center[0] += separation[0]
    resolvedBox.center[2] += separation[2]
  }
  const resolved = evaluateCollision(resolvedBox, localPoints, localBounds, environment)

  if (!resolved.collision) {
    return {
      box: resolvedBox,
      collision: false,
      collisionResolved: true,
      message: 'Geometry collision resolved',
    }
  }

  return {
    box,
    collision: true,
    collisionResolved: false,
    message: initial.kind === 'room' ? 'Room geometry collision detected' : 'Geometry collision detected',
  }
}

export function getBoxLocalPointAabb(localPoints: Vec3[], localBounds: LocalBounds | null, box: Box3D) {
  if (!localBounds || localPoints.length === 0) {
    return null
  }

  const worldPoints = getWorldPoints(localPoints, box, localBounds)
  const xs = worldPoints.map(([x]) => x)
  const ys = worldPoints.map(([, y]) => y)
  const zs = worldPoints.map(([, , z]) => z)
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)] as Vec3,
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] as Vec3,
  }
}
