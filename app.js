const state = {
  scenes: ['Loft_02 / kitchen-living', 'Apartment_07 / dining-room', 'Studio_03 / open-space'],
  selectedScene: 'Loft_02 / kitchen-living',
  selectedAssetId: 'chair-a13',
  selectedViews: ['Layout'],
  assetListScrollTop: 0,
  assets: [
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
  ],
  statusChips: [
    { label: 'Surface Snap', color: '#22c55e' },
    { label: 'Mesh Occlusion', color: '#38bdf8' },
    { label: 'Collision Check', color: '#f59e0b' },
  ],
  orthographicViews: [
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
  ],
}

function selectedAsset() {
  return state.assets.find((item) => item.id === state.selectedAssetId) || state.assets[0]
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function render() {
  const currentList = document.querySelector('.asset-list')
  if (currentList instanceof HTMLElement) {
    state.assetListScrollTop = currentList.scrollTop
  }

  const asset = selectedAsset()
  const assetCards = state.assets
    .map(
      (item) => `
        <button
          class="asset-card ${item.id === state.selectedAssetId ? 'asset-card--active' : ''}"
          data-action="select-asset"
          data-asset-id="${escapeHtml(item.id)}"
        >
          <div class="asset-card__thumb" style="background: linear-gradient(135deg, ${item.accent[0]}, ${item.accent[1]})">
            <div class="asset-card__thumb-shell"></div>
            <div class="asset-card__thumb-box"></div>
            <div class="asset-card__thumb-base"></div>
          </div>
          <div class="asset-card__meta">
            <div>
              <div class="asset-card__title">${escapeHtml(item.name)}</div>
              <div class="asset-card__pano">Pano: ${escapeHtml(item.pano)}</div>
            </div>
            <div class="asset-card__footer">
              <span class="asset-tag ${item.id === state.selectedAssetId ? 'asset-tag--active' : ''}">${escapeHtml(item.category)}</span>
              <span class="asset-card__status">${escapeHtml(item.status)}</span>
            </div>
          </div>
        </button>
      `,
    )
    .join('')

  const sceneOptions = state.scenes
    .map(
      (scene) =>
        `<option value="${escapeHtml(scene)}" ${scene === state.selectedScene ? 'selected' : ''}>${escapeHtml(scene)}</option>`,
    )
    .join('')

  const statusChips = state.statusChips
    .map(
      (chip) => `
        <span class="overlay-chip overlay-chip--status">
          <span class="overlay-chip__dot" style="background-color: ${chip.color}"></span>
          ${escapeHtml(chip.label)}
        </span>
      `,
    )
    .join('')

  const orthographicViews = state.orthographicViews
    .map(
      (view) => `
        <article class="ortho-card">
          <div class="ortho-card__header">
            <div>
              <h3>${escapeHtml(view.title)}</h3>
              <p>${escapeHtml(view.subtitle)}</p>
            </div>
            <span class="aligned-pill">Aligned</span>
          </div>
          <svg class="ortho-card__svg" viewBox="0 0 392 108" preserveAspectRatio="none" aria-hidden="true">
            <path d="${view.roomPath}" class="line-ortho-room" />
            <path
              d="M116 52 L176 40 L214 56 L154 68 Z M116 52 L154 68 L154 86 L116 74 Z M154 68 L214 56 L214 82 L154 86 Z"
              class="line-object line-object--primary"
            />
            <path
              d="M238 60 L286 50 L318 60 L270 70 Z M238 60 L270 70 L270 88 L238 78 Z M270 70 L318 60 L318 84 L270 88 Z"
              class="line-object line-object--secondary"
            />
          </svg>
        </article>
      `,
    )
    .join('')

  document.querySelector('#app').innerHTML = `
    <div class="workspace-shell">
      <header class="topbar">
        <div class="topbar__left">
          <div class="brand-pill">
            <div class="brand-pill__icon">3D</div>
            <div>
              <div class="brand-pill__title">SceneAlign</div>
              <div class="brand-pill__subtitle">Furniture placement annotation</div>
            </div>
          </div>

          <label class="select-pill">
            <span class="select-pill__label">Scene</span>
            <select class="select-pill__control" data-action="select-scene">${sceneOptions}</select>
          </label>

          <div class="select-pill select-pill--readonly">
            <span class="select-pill__label">Current Asset</span>
            <strong class="select-pill__value">${escapeHtml(asset.name)}</strong>
          </div>
        </div>

        <div class="topbar__right">
          <div class="status-badge">
            <span class="status-badge__dot"></span>
            Auto-saved 18s ago
          </div>
          <button class="action-btn action-btn--ghost" type="button">Save Draft</button>
          <button class="action-btn action-btn--primary" type="button">Export JSON</button>
        </div>
      </header>

      <main class="workspace-grid">
        <aside class="asset-pane">
          <div class="asset-pane__header">
            <div>
              <h1>3D Assets</h1>
              <p>Objects extracted from pano-aligned reconstruction</p>
            </div>
            <span class="count-pill">${state.assets.length} items</span>
          </div>

          <div class="search-box">
            <span class="search-box__icon">⌕</span>
            <span>Search asset / pano / category</span>
          </div>

          <div class="asset-list">${assetCards}</div>
        </aside>

        <section class="annotation-panel">
          <div class="annotation-panel__header">
            <div>
              <h2>Placement Workspace</h2>
              <p>Align furniture against reconstructed room geometry</p>
            </div>

            <div class="annotation-panel__controls">
              <div class="metric-pill">Room scale 1.00m</div>
              <div class="tab-switcher">
                <button class="${state.selectedViews.includes('Layout') ? 'active' : ''}" type="button" data-action="toggle-view" data-view="Layout">Layout</button>
                <button class="${state.selectedViews.includes('Mesh') ? 'active' : ''}" type="button" data-action="toggle-view" data-view="Mesh">Mesh</button>
              </div>
            </div>
          </div>

          <div class="main-view">
            <div class="main-view__overlay">
              <div class="overlay-group">
                <span class="overlay-chip">Asset: ${escapeHtml(asset.name)}</span>
                <span class="overlay-chip">Pano ${escapeHtml(asset.pano)}</span>
              </div>
              <div class="overlay-group">${statusChips}</div>
            </div>

            <svg class="main-view__svg" viewBox="0 0 1118 588" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M126 408 L324 292 L748 292 L894 360 M126 408 L284 454 L828 454 L894 360 M324 292 L284 454 M748 292 L828 454 M474 292 L474 454 M610 292 L610 454 M126 408 L126 228 L324 140 L748 140 L894 228 L894 360 M126 228 L324 140 M894 228 L748 140"
                class="line-room"
              />
              <path
                d="M362 270 L430 234 L480 260 L412 292 Z M362 270 L412 292 L412 360 L362 334 Z M412 292 L480 260 L480 332 L412 360 Z M390 306 L442 282 L442 346 L390 370 Z"
                class="line-object line-object--primary"
              />
              <path
                d="M626 226 L704 190 L752 216 L676 252 Z M626 226 L676 252 L676 330 L626 304 Z M676 252 L752 216 L752 290 L676 330 Z"
                class="line-object line-object--secondary"
              />
              <path
                d="M814 296 L870 270 L906 286 L850 312 Z M814 296 L850 312 L850 354 L814 338 Z M850 312 L906 286 L906 326 L850 354 Z"
                class="line-object line-object--warning"
              />
              <path d="M90 514 L332 538 L564 528 L786 548 L1018 518" class="line-floor" />
            </svg>

            <div class="coords-panel">
              <div class="coords-panel__line">X 2.38m&nbsp;&nbsp; Y 0.00m&nbsp;&nbsp; Z 4.92m</div>
              <div class="coords-panel__hint">Anchor: floor contact</div>
            </div>

            <div class="asset-inspector">
              <h3>Selected Asset</h3>
              <div class="asset-inspector__row"><span>Category</span><strong>${escapeHtml(asset.category)}</strong></div>
              <div class="asset-inspector__row"><span>Pose</span><strong>yaw 14°</strong></div>
              <div class="asset-inspector__row"><span>Height</span><strong>0.86m</strong></div>
              <div class="asset-inspector__row"><span>Anchor</span><strong>floor contact</strong></div>
              <div class="asset-inspector__actions">
                <button class="action-btn action-btn--ghost action-btn--small" type="button">Reset Pose</button>
                <button class="action-btn action-btn--primary action-btn--small" type="button">Confirm</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section class="orthographic-panel">
        <div class="orthographic-panel__header">
          <div>
            <h2>Orthographic Review</h2>
            <p>Top / Side / Front consistency checks for room-aligned placement</p>
          </div>

          <div class="legend-row">
            <span class="legend-item"><i class="legend-dot legend-dot--room"></i>Room hull</span>
            <span class="legend-item"><i class="legend-dot legend-dot--placed"></i>Placed asset</span>
            <span class="legend-item"><i class="legend-dot legend-dot--candidate"></i>Candidate asset</span>
          </div>
        </div>

        <div class="ortho-grid">${orthographicViews}</div>
      </section>
    </div>
  `

  const nextList = document.querySelector('.asset-list')
  if (nextList instanceof HTMLElement) {
    nextList.scrollTop = state.assetListScrollTop
  }
}

document.addEventListener('change', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.matches('[data-action="select-scene"]')) {
    state.selectedScene = target.value
    render()
  }
})

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const actionTarget = target.closest('[data-action]')
  if (!(actionTarget instanceof HTMLElement)) {
    return
  }

  const action = actionTarget.dataset.action
  if (action === 'select-asset') {
    state.selectedAssetId = actionTarget.dataset.assetId || state.selectedAssetId
    render()
  }

  if (action === 'toggle-view') {
    const view = actionTarget.dataset.view
    if (!view) {
      return
    }

    if (state.selectedViews.includes(view)) {
      if (state.selectedViews.length > 1) {
        state.selectedViews = state.selectedViews.filter((item) => item !== view)
      }
    } else {
      state.selectedViews = [...state.selectedViews, view]
    }

    render()
  }
})

document.addEventListener('scroll', (event) => {
  const target = event.target
  if (target instanceof HTMLElement && target.classList.contains('asset-list')) {
    state.assetListScrollTop = target.scrollTop
  }
}, true)

render()
