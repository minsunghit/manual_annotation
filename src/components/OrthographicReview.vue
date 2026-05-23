<script setup>
defineProps({
  views: {
    type: Array,
    required: true,
  },
})
</script>

<template>
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

    <div class="ortho-grid">
      <article v-for="view in views" :key="view.key" class="ortho-card">
        <div class="ortho-card__header">
          <div>
            <h3>{{ view.title }}</h3>
            <p>{{ view.subtitle }}</p>
          </div>
          <span class="aligned-pill">Aligned</span>
        </div>

        <svg class="ortho-card__svg" viewBox="0 0 392 108" preserveAspectRatio="none" aria-hidden="true">
          <path :d="view.roomPath" class="line-ortho-room" />
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
    </div>
  </section>
</template>
