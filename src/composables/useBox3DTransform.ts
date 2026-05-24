import type { Box3D, ProjectionView, Vec2 } from '../types/workspace'
import { clampBoxSize, inverseRotateXZ, rotateXZ } from '../utils/box3dMath'

export type BoxHandle =
  | 'move'
  | 'rotate'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'

interface DragState {
  handle: BoxHandle
  view: ProjectionView
  startPointer: Vec2
  startCenter: Box3D['center']
  startSize: Box3D['size']
  startYaw: number
}

interface Rect2D {
  minU: number
  maxU: number
  minV: number
  maxV: number
}

function updateRectFromHandle(
  rect: Rect2D,
  handle: BoxHandle,
  pointer: Vec2,
  minWidth: number,
  minHeight: number,
  verticalTopIsMax: boolean,
): Rect2D {
  let { minU, maxU, minV, maxV } = rect
  const [u, v] = pointer

  if (handle.includes('w')) {
    minU = Math.min(u, maxU - minWidth)
  }
  if (handle.includes('e')) {
    maxU = Math.max(u, minU + minWidth)
  }

  if (handle.includes('n')) {
    if (verticalTopIsMax) {
      maxV = Math.max(v, minV + minHeight)
    } else {
      minV = Math.min(v, maxV - minHeight)
    }
  }
  if (handle.includes('s')) {
    if (verticalTopIsMax) {
      minV = Math.min(v, maxV - minHeight)
    } else {
      maxV = Math.max(v, minV + minHeight)
    }
  }

  return { minU, maxU, minV, maxV }
}

function updateTopBox(state: DragState, pointer: Vec2): Box3D {
  const box: Box3D = {
    center: [...state.startCenter] as Box3D['center'],
    size: [...state.startSize] as Box3D['size'],
    yaw: state.startYaw,
  }

  if (state.handle === 'move') {
    box.center[0] += pointer[0] - state.startPointer[0]
    box.center[2] += pointer[1] - state.startPointer[1]
    return box
  }

  if (state.handle === 'rotate') {
    const startAngle = Math.atan2(state.startPointer[1] - state.startCenter[2], state.startPointer[0] - state.startCenter[0])
    const currentAngle = Math.atan2(pointer[1] - state.startCenter[2], pointer[0] - state.startCenter[0])
    box.yaw = state.startYaw - (currentAngle - startAngle)
    return box
  }

  const [pointerLocalX, pointerLocalZ] = inverseRotateXZ(
    pointer[0] - state.startCenter[0],
    pointer[1] - state.startCenter[2],
    state.startYaw,
  )

  const updated = updateRectFromHandle(
    {
      minU: -state.startSize[0] * 0.5,
      maxU: state.startSize[0] * 0.5,
      minV: -state.startSize[2] * 0.5,
      maxV: state.startSize[2] * 0.5,
    },
    state.handle,
    [pointerLocalX, pointerLocalZ],
    clampBoxSize(0),
    clampBoxSize(0),
    false,
  )

  const localCenterX = (updated.minU + updated.maxU) * 0.5
  const localCenterZ = (updated.minV + updated.maxV) * 0.5
  const [deltaX, deltaZ] = rotateXZ(localCenterX, localCenterZ, state.startYaw)

  box.center[0] = state.startCenter[0] + deltaX
  box.center[2] = state.startCenter[2] + deltaZ
  box.size[0] = clampBoxSize(updated.maxU - updated.minU)
  box.size[2] = clampBoxSize(updated.maxV - updated.minV)
  return box
}

function updateFrontBox(state: DragState, pointer: Vec2): Box3D {
  const box: Box3D = {
    center: [...state.startCenter] as Box3D['center'],
    size: [...state.startSize] as Box3D['size'],
    yaw: state.startYaw,
  }

  if (state.handle === 'move') {
    const [deltaX, deltaZ] = rotateXZ(pointer[0] - state.startPointer[0], 0, state.startYaw)
    box.center[0] += deltaX
    box.center[2] += deltaZ
    box.center[1] += pointer[1] - state.startPointer[1]
    return box
  }

  const updated = updateRectFromHandle(
    {
      minU: -state.startSize[0] * 0.5,
      maxU: state.startSize[0] * 0.5,
      minV: -state.startSize[1] * 0.5,
      maxV: state.startSize[1] * 0.5,
    },
    state.handle,
    pointer,
    clampBoxSize(0),
    clampBoxSize(0),
    true,
  )

  const localCenterX = (updated.minU + updated.maxU) * 0.5
  const [deltaX, deltaZ] = rotateXZ(localCenterX, 0, state.startYaw)
  box.center[0] = state.startCenter[0] + deltaX
  box.center[2] = state.startCenter[2] + deltaZ
  box.center[1] = state.startCenter[1] + (updated.minV + updated.maxV) * 0.5
  box.size[0] = clampBoxSize(updated.maxU - updated.minU)
  box.size[1] = clampBoxSize(updated.maxV - updated.minV)
  return box
}

function updateSideBox(state: DragState, pointer: Vec2): Box3D {
  const box: Box3D = {
    center: [...state.startCenter] as Box3D['center'],
    size: [...state.startSize] as Box3D['size'],
    yaw: state.startYaw,
  }

  if (state.handle === 'move') {
    const [deltaX, deltaZ] = rotateXZ(0, pointer[0] - state.startPointer[0], state.startYaw)
    box.center[0] += deltaX
    box.center[2] += deltaZ
    box.center[1] += pointer[1] - state.startPointer[1]
    return box
  }

  const updated = updateRectFromHandle(
    {
      minU: -state.startSize[2] * 0.5,
      maxU: state.startSize[2] * 0.5,
      minV: -state.startSize[1] * 0.5,
      maxV: state.startSize[1] * 0.5,
    },
    state.handle,
    pointer,
    clampBoxSize(0),
    clampBoxSize(0),
    true,
  )

  const localCenterZ = (updated.minU + updated.maxU) * 0.5
  const [deltaX, deltaZ] = rotateXZ(0, localCenterZ, state.startYaw)
  box.center[0] = state.startCenter[0] + deltaX
  box.center[2] = state.startCenter[2] + deltaZ
  box.center[1] = state.startCenter[1] + (updated.minV + updated.maxV) * 0.5
  box.size[2] = clampBoxSize(updated.maxU - updated.minU)
  box.size[1] = clampBoxSize(updated.maxV - updated.minV)
  return box
}

export function createBoxDragState(box: Box3D, view: ProjectionView, handle: BoxHandle, pointer: Vec2): DragState {
  return {
    view,
    handle,
    startPointer: pointer,
    startCenter: [...box.center] as Box3D['center'],
    startSize: [...box.size] as Box3D['size'],
    startYaw: box.yaw,
  }
}

export function updateBox3DFromDrag(state: DragState, pointer: Vec2): Box3D {
  if (state.view === 'top') {
    return updateTopBox(state, pointer)
  }
  if (state.view === 'front') {
    return updateFrontBox(state, pointer)
  }
  return updateSideBox(state, pointer)
}
