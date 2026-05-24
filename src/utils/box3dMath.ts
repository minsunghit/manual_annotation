import type { Box3D, ProjectionView, Vec2, Vec3 } from '../types/workspace'

const MIN_BOX_SIZE = 0.08

export function clampBoxSize(value: number): number {
  return Math.max(MIN_BOX_SIZE, value)
}

export function createBox3DFromPoints(points: Vec3[]): Box3D {
  if (points.length === 0) {
    return {
      center: [0, 0, 0],
      size: [1, 1, 1],
      yaw: 0,
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
    yaw: 0,
  }
}

export function rotateXZ(x: number, z: number, yaw: number): Vec2 {
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  return [x * cosYaw + z * sinYaw, -x * sinYaw + z * cosYaw]
}

export function inverseRotateXZ(x: number, z: number, yaw: number): Vec2 {
  return rotateXZ(x, z, -yaw)
}

export function getBox3DCorners(box: Box3D): Vec3[] {
  const [cx, cy, cz] = box.center
  const [sx, sy, sz] = box.size
  const halfX = sx * 0.5
  const halfY = sy * 0.5
  const halfZ = sz * 0.5

  const corners: Vec3[] = []
  for (const localY of [-halfY, halfY]) {
    for (const localZ of [-halfZ, halfZ]) {
      for (const localX of [-halfX, halfX]) {
        const [worldX, worldZ] = rotateXZ(localX, localZ, box.yaw)
        corners.push([cx + worldX, cy + localY, cz + worldZ])
      }
    }
  }

  return corners
}

export function projectPointToView(point: Vec3, view: ProjectionView): Vec2 {
  if (view === 'top') {
    // Top uses the world x-z plane.
    return [point[0], point[2]]
  }
  if (view === 'front') {
    // Front uses the world x-y plane.
    return [point[0], point[1]]
  }

  // Side uses the world z-y plane.
  return [point[2], point[1]]
}

export function getProjectedBoxPolygon(box: Box3D, view: ProjectionView): Vec2[] {
  const [cx, cy, cz] = box.center
  const [sx, sy, sz] = box.size

  if (view === 'top') {
    const halfX = sx * 0.5
    const halfZ = sz * 0.5
    return [
      rotateXZ(-halfX, -halfZ, box.yaw),
      rotateXZ(halfX, -halfZ, box.yaw),
      rotateXZ(halfX, halfZ, box.yaw),
      rotateXZ(-halfX, halfZ, box.yaw),
    ].map(([x, z]) => [cx + x, cz + z])
  }

  const corners = getBox3DCorners(box).map((point) => projectPointToView(point, view))
  const uValues = corners.map(([u]) => u)
  const vValues = corners.map(([, v]) => v)
  const minU = Math.min(...uValues)
  const maxU = Math.max(...uValues)
  const minV = Math.min(...vValues)
  const maxV = Math.max(...vValues)

  return [
    [minU, minV],
    [maxU, minV],
    [maxU, maxV],
    [minU, maxV],
  ]
}

export function getViewBounds(points: Vec2[], paddingRatio = 0.18): {
  minU: number
  maxU: number
  minV: number
  maxV: number
  width: number
  height: number
} {
  if (points.length === 0) {
    return {
      minU: -1,
      maxU: 1,
      minV: -1,
      maxV: 1,
      width: 2,
      height: 2,
    }
  }

  const uValues = points.map(([u]) => u)
  const vValues = points.map(([, v]) => v)
  const minU = Math.min(...uValues)
  const maxU = Math.max(...uValues)
  const minV = Math.min(...vValues)
  const maxV = Math.max(...vValues)
  const width = Math.max(maxU - minU, 1)
  const height = Math.max(maxV - minV, 1)
  const padding = Math.max(width, height) * paddingRatio

  return {
    minU: minU - padding,
    maxU: maxU + padding,
    minV: minV - padding,
    maxV: maxV + padding,
    width: width + padding * 2,
    height: height + padding * 2,
  }
}

export function getBox3DJson(box: Box3D): string {
  return JSON.stringify(
    {
      center: box.center.map((value) => Number(value.toFixed(6))),
      size: box.size.map((value) => Number(value.toFixed(6))),
      yaw: Number(box.yaw.toFixed(6)),
    },
    null,
    2,
  )
}
