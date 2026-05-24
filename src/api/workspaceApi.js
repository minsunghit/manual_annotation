export async function fetchScenes() {
  const response = await fetch('/api/scenes')
  if (!response.ok) {
    throw new Error(`Failed to fetch scenes: ${response.status}`)
  }

  return response.json()
}

export async function fetchWorkspace(sceneId, roomName) {
  const search = new URLSearchParams()
  if (roomName) {
    search.set('room', roomName)
  }

  const response = await fetch(`/api/workspace/${encodeURIComponent(sceneId)}?${search.toString()}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch workspace: ${response.status}`)
  }

  return response.json()
}
