export const sceneOptions = [
  'Loft_02 / kitchen-living',
  'Apartment_07 / dining-room',
  'Studio_03 / open-space',
]

export const assetCatalog = [
  {
    id: 'chair-a13',
    name: 'Dining Chair A13',
    pano: 'pano_011',
    category: 'chair',
    status: 'Selected for placement',
    accent: ['#0f172a', '#334155'],
  },
  {
    id: 'table-b04',
    name: 'Coffee Table B04',
    pano: 'pano_008',
    category: 'table',
    status: 'Queued for review',
    accent: ['#78350f', '#b45309'],
  },
  {
    id: 'lamp-f02',
    name: 'Floor Lamp F02',
    pano: 'pano_011',
    category: 'lighting',
    status: 'Queued for review',
    accent: ['#1f2937', '#64748b'],
  },
  {
    id: 'wardrobe-w09',
    name: 'Wardrobe W09',
    pano: 'pano_006',
    category: 'storage',
    status: 'Queued for review',
    accent: ['#3f3f46', '#71717a'],
  },
  {
    id: 'sofa-s03',
    name: 'Sofa S03',
    pano: 'pano_014',
    category: 'seating',
    status: 'Queued for review',
    accent: ['#1d4ed8', '#60a5fa'],
  },
]

export const placementStatusChips = [
  { label: 'Surface Snap', color: '#22c55e' },
  { label: 'Mesh Occlusion', color: '#38bdf8' },
  { label: 'Collision Check', color: '#f59e0b' },
]

export const orthographicViews = [
  {
    key: 'top',
    title: 'Top',
    subtitle: 'Footprint and orientation',
    roomPath: 'M10 68 L108 26 L250 18 L360 50 L280 76 L120 80 Z',
  },
  {
    key: 'side',
    title: 'Side',
    subtitle: 'Height against floor plane',
    roomPath: 'M16 74 L88 18 L324 18 L352 74 Z',
  },
  {
    key: 'front',
    title: 'Front',
    subtitle: 'Symmetry and wall clearance',
    roomPath: 'M26 76 L26 18 L338 18 L338 76 Z',
  },
]
