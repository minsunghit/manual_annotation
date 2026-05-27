import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const SCENE_ROOT = path.join(ROOT_DIR, 'scene')
const OUTPUTS_ROOT = path.join(ROOT_DIR, 'outputs')
const PORT = Number(process.env.MANUAL_ANNOTATION_API_PORT || 8788)

const ROOM_NAME_TO_LAYOUT = {
  '\u5367\u5BA4A': 'bedroom_a',
  '\u5367\u5BA4B': 'bedroom_b',
  '\u536B\u751F\u95F4': 'bathroom',
  '\u53A8\u623F': 'kitchen',
  '\u5BA2\u5385': 'living_room',
  '\u8FC7\u9053': 'corridor',
  '\u95E8\u5385': 'foyer',
  '\u9633\u53F0': 'balcony',
}

const ROOM_NAME_TO_RAW = {
  '\u5367\u5BA4A': 'bedroom_a',
  '\u5367\u5BA4B': 'bedroom_b',
  '\u536B\u751F\u95F4': 'bathroom',
  '\u53A8\u623F': 'kitchen',
  '\u5BA2\u5385': 'corridor__living_room',
  '\u8FC7\u9053': 'corridor__living_room',
  '\u95E8\u5385': 'foyer',
  '\u9633\u53F0': 'balcony',
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function pathToUrl(prefix, absolutePath, rootDir) {
  const relative = path.relative(rootDir, absolutePath).split(path.sep).join('/')
  return `${prefix}/${encodeURI(relative)}`
}

function resolvePanoramaFolder(sceneId, roomTask, result) {
  const candidates = [
    result?.room_context?.panorama_folder,
    roomTask?.scene_snapshot?.panoramaFolder,
    roomTask?.panoramaFolder,
    roomTask?.panorama_folder,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) {
      continue
    }

    const directPath = path.join(SCENE_ROOT, sceneId, 'panorama', candidate)
    if (fs.existsSync(directPath)) {
      return candidate
    }

    const matchedDir = fs
      .readdirSync(path.join(SCENE_ROOT, sceneId, 'panorama'), { withFileTypes: true })
      .find((entry) => entry.isDirectory() && (entry.name === candidate || entry.name.endsWith(`_${candidate}`)))

    if (matchedDir) {
      return matchedDir.name
    }
  }

  return ''
}

function findRoomTaskDirs(sceneId) {
  const sceneOutputDir = path.join(OUTPUTS_ROOT, sceneId)
  if (!fs.existsSync(sceneOutputDir)) {
    return []
  }

  const result = []
  for (const roomEntry of fs.readdirSync(sceneOutputDir, { withFileTypes: true })) {
    if (!roomEntry.isDirectory()) {
      continue
    }

    const roomDir = path.join(sceneOutputDir, roomEntry.name)
    for (const taskEntry of fs.readdirSync(roomDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory() || !taskEntry.name.startsWith('room_')) {
        continue
      }

      const roomTaskDir = path.join(roomDir, taskEntry.name)
      const roomTaskPath = path.join(roomTaskDir, 'room_task.json')
      if (!fs.existsSync(roomTaskPath)) {
        continue
      }

      result.push({
        roomName: roomEntry.name,
        roomTaskDir,
        roomTask: readJson(roomTaskPath),
      })
    }
  }

  return result
}

function collectAssets(sceneId, roomTaskDir, roomTask) {
  const objectsDir = path.join(roomTaskDir, 'objects')
  if (!fs.existsSync(objectsDir)) {
    return []
  }

  const assets = []
  for (const objectEntry of fs.readdirSync(objectsDir, { withFileTypes: true })) {
    if (!objectEntry.isDirectory()) {
      continue
    }

    const objectDir = path.join(objectsDir, objectEntry.name)
    const objectInstancePath = path.join(objectDir, 'object_instance.json')
    if (!fs.existsSync(objectInstancePath)) {
      continue
    }

    const objectInstance = readJson(objectInstancePath)
    if ((objectInstance.status || 'active') !== 'active') {
      continue
    }

    const revisionId = objectInstance.active_revision_id
    if (!revisionId) {
      continue
    }

    const revisionDir = path.join(objectDir, 'revisions', revisionId)
    const resultPath = path.join(revisionDir, 'result.json')
    if (!fs.existsSync(resultPath)) {
      continue
    }

    const result = readJson(resultPath)
    const previewPath = path.join(revisionDir, 'segmentation', 'segmentation_preview.png')
    const pose = result.pose || {}
    const annotation = result.manual_annotation || {}
    const objectGlbPath = path.join(revisionDir, 'generated', path.basename(result.generated_dir || ''), 'object.glb')
    const panoFolder = resolvePanoramaFolder(sceneId, roomTask, result)
    const panoDir = panoFolder ? path.join(SCENE_ROOT, sceneId, 'panorama', panoFolder) : ''

    assets.push({
      id: objectInstance.id,
      revisionId,
      sceneId,
      roomName: roomTask?.panorama_folder || roomTask?.display_name || '',
      name:
        objectInstance.metadata?.furniture_object_name ||
        objectInstance.object_type ||
        objectInstance.display_name ||
        objectInstance.id,
      pano: panoFolder || result?.room_context?.panorama_folder || objectInstance.metadata?.panorama_folder || objectInstance.metadata?.panorama || roomTask?.panorama_folder || 'room-view',
      panoUrl: panoDir ? pathToUrl('/api/static/scene', panoDir, SCENE_ROOT) : null,
      category: objectInstance.object_type || 'object',
      status: 'active',
      pose: {
        translation: Array.isArray(pose.translation_xyz) ? pose.translation_xyz : [0, 0, 0],
        rotation: Array.isArray(pose.rotation_quat_wxyz) ? pose.rotation_quat_wxyz : [1, 0, 0, 0],
        scale: Array.isArray(pose.scale_xyz) ? pose.scale_xyz : [1, 1, 1],
      },
      previewUrl: fs.existsSync(previewPath)
        ? pathToUrl('/api/static/outputs', previewPath, OUTPUTS_ROOT)
        : null,
      objectGlbUrl: fs.existsSync(objectGlbPath)
        ? pathToUrl('/api/static/outputs', objectGlbPath, OUTPUTS_ROOT)
        : null,
      bbox: result.bbox || null,
      savedAtIso: typeof annotation.savedAtIso === 'string' ? annotation.savedAtIso : '',
      savedBox: annotation.box3d || null,
    })
  }

  return assets.sort((left, right) => left.name.localeCompare(right.name))
}

function buildRoomOptions(roomTasks, sceneId) {
  const uniqueRooms = new Map()

  for (const entry of roomTasks) {
    if (uniqueRooms.has(entry.roomName)) {
      continue
    }

    uniqueRooms.set(entry.roomName, {
      sceneId,
      roomName: entry.roomName,
      roomTaskId: entry.roomTask.id,
      label: `${sceneId} / ${entry.roomName}`,
    })
  }

  return Array.from(uniqueRooms.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

function buildRoomMeshUrls(sceneId, roomName) {
  const sceneDir = path.join(SCENE_ROOT, sceneId)
  const layoutName = ROOM_NAME_TO_LAYOUT[roomName]
  const rawName = ROOM_NAME_TO_RAW[roomName]
  if (!layoutName || !rawName) {
    return null
  }

  const layoutPath = path.join(sceneDir, 'mesh', 'room_layout', 'rooms', `${layoutName}.glb`)
  const rawPath = path.join(sceneDir, 'mesh', 'room_raw', 'rooms', `${rawName}.glb`)
  if (!fs.existsSync(layoutPath) || !fs.existsSync(rawPath)) {
    return null
  }

  return {
    layoutUrl: pathToUrl('/api/static/scene', layoutPath, SCENE_ROOT),
    rawUrl: pathToUrl('/api/static/scene', rawPath, SCENE_ROOT),
  }
}

function getRoomAnchor(sceneId, roomName) {
  const floorplanPath = path.join(SCENE_ROOT, sceneId, 'json', 'floorplan.json')
  if (!fs.existsSync(floorplanPath)) {
    return null
  }

  const floorplan = readJson(floorplanPath)
  const roomLabel = floorplan?.data?.modelRoomLabels?.find((item) => item.name === roomName)
  if (!roomLabel?.position) {
    return null
  }

  return {
    position: [roomLabel.position.x, roomLabel.position.y, roomLabel.position.z],
    longitude: roomLabel.longitude ?? 0,
  }
}

function buildWorkspacePayload(sceneId, roomName) {
  const roomTasks = findRoomTaskDirs(sceneId)
  const roomOptions = buildRoomOptions(roomTasks, sceneId)

  const currentRoom = roomTasks.find((entry) => entry.roomName === roomName) || roomTasks[0]
  if (!currentRoom) {
    return {
      sceneId,
      roomOptions: [],
      roomName: '',
      roomLabel: '',
      meshes: null,
      roomAnchor: null,
      assets: [],
    }
  }

  return {
    sceneId,
    roomName: currentRoom.roomName,
    roomTaskId: currentRoom.roomTask.id,
    roomLabel: `${sceneId} / ${currentRoom.roomName}`,
    roomOptions,
    meshes: buildRoomMeshUrls(sceneId, currentRoom.roomName),
    roomAnchor: getRoomAnchor(sceneId, currentRoom.roomName),
    assets: collectAssets(sceneId, currentRoom.roomTaskDir, currentRoom.roomTask),
  }
}

function getCurrentRoomTask(sceneId, roomName) {
  const roomTasks = findRoomTaskDirs(sceneId)
  return roomTasks.find((entry) => entry.roomName === roomName) || null
}

function getRevisionResultPath(sceneId, roomName, assetId, revisionId) {
  const roomTask = getCurrentRoomTask(sceneId, roomName)
  if (!roomTask) {
    return null
  }

  const objectDir = path.join(roomTask.roomTaskDir, 'objects', assetId)
  const resultPath = path.join(objectDir, 'revisions', revisionId, 'result.json')
  return fs.existsSync(resultPath) ? resultPath : null
}

function isVec3(value) {
  return Array.isArray(value) && value.length === 3 && value.every((item) => Number.isFinite(item))
}

function isVec4(value) {
  return Array.isArray(value) && value.length === 4 && value.every((item) => Number.isFinite(item))
}

function isBox3D(value) {
  return Boolean(
    value &&
      isVec3(value.center) &&
      isVec3(value.size) &&
      Number.isFinite(value.yaw),
  )
}

const app = express()

app.use(express.json())
app.use('/api/static/scene', express.static(SCENE_ROOT))
app.use('/api/static/outputs', express.static(OUTPUTS_ROOT))

app.get('/api/scenes', (_req, res) => {
  const sceneIds = fs
    .readdirSync(SCENE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const scenes = sceneIds.map((sceneId) => {
    const roomTasks = findRoomTaskDirs(sceneId)
    return {
      id: sceneId,
      roomOptions: buildRoomOptions(roomTasks, sceneId),
    }
  })

  res.json({ scenes })
})

app.get('/api/workspace/:sceneId', (req, res) => {
  const { sceneId } = req.params
  const roomName = typeof req.query.room === 'string' ? req.query.room : ''
  res.json(buildWorkspacePayload(sceneId, roomName))
})

app.post('/api/assets/:assetId/confirm', (req, res) => {
  const { assetId } = req.params
  const { sceneId, roomName, revisionId, pose, box, savedAtIso } = req.body || {}

  if (
    typeof sceneId !== 'string' ||
    typeof roomName !== 'string' ||
    typeof revisionId !== 'string' ||
    !pose ||
    !isVec3(pose.translation) ||
    !isVec4(pose.rotation) ||
    !isVec3(pose.scale) ||
    !isBox3D(box)
  ) {
    res.status(400).json({ error: 'Invalid confirm payload.' })
    return
  }

  const resultPath = getRevisionResultPath(sceneId, roomName, assetId, revisionId)
  if (!resultPath) {
    res.status(404).json({ error: 'Revision result.json not found.' })
    return
  }

  const result = readJson(resultPath)
  result.pose = {
    ...(result.pose || {}),
    translation_xyz: pose.translation,
    rotation_quat_wxyz: pose.rotation,
    scale_xyz: pose.scale,
  }
  result.manual_annotation = {
    ...(result.manual_annotation || {}),
    box3d: box,
    savedAtIso: typeof savedAtIso === 'string' && savedAtIso ? savedAtIso : new Date().toISOString(),
  }

  writeJson(resultPath, result)
  res.json({
    ok: true,
    savedAtIso: result.manual_annotation.savedAtIso,
    pose: {
      translation: result.pose.translation_xyz,
      rotation: result.pose.rotation_quat_wxyz,
      scale: result.pose.scale_xyz,
    },
    box: result.manual_annotation.box3d,
  })
})

app.listen(PORT, () => {
  console.log(`manual_annotation api listening on http://127.0.0.1:${PORT}`)
})
