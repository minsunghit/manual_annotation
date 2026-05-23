<script setup>
import { computed, ref } from 'vue'

import AnnotationWorkspace from './components/AnnotationWorkspace.vue'
import AssetSidebar from './components/AssetSidebar.vue'
import OrthographicReview from './components/OrthographicReview.vue'
import WorkspaceTopbar from './components/WorkspaceTopbar.vue'
import {
  assetCatalog,
  orthographicViews,
  placementStatusChips,
  sceneOptions,
} from './data/workspaceData'

const selectedScene = ref(sceneOptions[0])
const selectedAssetId = ref(assetCatalog[0].id)
const selectedViews = ref(['Layout'])

const selectedAsset = computed(
  () => assetCatalog.find((item) => item.id === selectedAssetId.value) || assetCatalog[0],
)

function toggleView(view) {
  if (selectedViews.value.includes(view)) {
    if (selectedViews.value.length > 1) {
      selectedViews.value = selectedViews.value.filter((item) => item !== view)
    }
    return
  }

  selectedViews.value = [...selectedViews.value, view]
}
</script>

<template>
  <div class="workspace-shell">
    <WorkspaceTopbar
      :scene-options="sceneOptions"
      :selected-asset-name="selectedAsset.name"
      :selected-scene="selectedScene"
      @update:selectedScene="selectedScene = $event"
    />

    <main class="workspace-grid">
      <AssetSidebar
        :assets="assetCatalog"
        :selected-asset-id="selectedAssetId"
        @select-asset="selectedAssetId = $event"
      />

      <AnnotationWorkspace
        :selected-asset="selectedAsset"
        :selected-views="selectedViews"
        :status-chips="placementStatusChips"
        @toggle-view="toggleView"
      />
    </main>

    <OrthographicReview :views="orthographicViews" />
  </div>
</template>
