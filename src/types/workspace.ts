export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
export type Vec4 = [number, number, number, number]

export interface SceneOption {
  value: string
  label: string
}

export interface RoomAnchor {
  position: Vec3
  longitude: number
}

export interface AssetPose {
  translation: Vec3
  rotation: Vec4
  scale: Vec3
}

export interface WorkspaceAsset {
  id: string
  revisionId: string
  sceneId?: string
  roomName?: string
  name: string
  pano: string
  panoUrl?: string | null
  category: string
  status: string
  pose: AssetPose
  previewUrl: string | null
  objectGlbUrl?: string | null
  bbox?: {
    x: number
    y: number
    width: number
    height: number
  } | null
  savedAtIso?: string
  savedBox?: Box3D | null
}

export interface WorkspaceMeshes {
  layoutUrl: string
  rawUrl: string
}

export interface Box3D {
  center: Vec3
  size: Vec3
  yaw: number
}

export type ProjectionView = 'top' | 'front' | 'side'
export type Box3DHandle = 'move' | 'rotate' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface Box3DUpdatePayload {
  box: Box3D
  view: ProjectionView
  handle: Box3DHandle
}

export interface AssetCollisionProxy {
  assetId: string
  box: Box3D
  localBounds: {
    center: Vec3
    size: Vec3
  }
  localPoints: Vec3[]
}

export interface SceneSnapEnvironment {
  floorY: number | null
  ceilingY: number | null
  supportSurfaces: Vec3[]
  wallSurfaces: Array<{
    point: Vec3
    normal: Vec3
    tangent: Vec3
    minY: number
    maxY: number
    minT: number
    maxT: number
  }>
  roomBounds: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  } | null
  wallYaws: number[]
  assets: AssetCollisionProxy[]
}

export interface AssetGeometryPayload {
  assetId: string
  box: Box3D
  localBounds: {
    center: Vec3
    size: Vec3
  }
  localPoints: Vec3[]
  localYaw: number
}
