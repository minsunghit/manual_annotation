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
  name: string
  pano: string
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
