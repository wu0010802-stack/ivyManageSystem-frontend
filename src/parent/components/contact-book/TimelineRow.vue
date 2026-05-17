<script setup>
const props = defineProps({
  icon: { type: String, required: true },
  iconTone: { type: String, default: 'green' },
  label: { type: String, required: true },
  value: { type: [String, Number, null], default: null },
  detail: { type: String, default: null },
  hideConnector: { type: Boolean, default: false },
})
</script>

<template>
  <div class="row">
    <div class="rail" :class="`tone-${iconTone}`">
      <span class="dot">
        <span class="material-symbols-rounded">{{ icon }}</span>
      </span>
      <span v-if="!hideConnector" class="line" aria-hidden="true" />
    </div>
    <div class="content">
      <p class="label">{{ label }}</p>
      <p v-if="value != null && value !== ''" class="value">{{ value }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 14px;
  align-items: stretch;
}

.rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  flex-shrink: 0;
}
.dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--cream, #fffcf2);
  border: 1.5px solid currentColor;
  color: var(--brand-primary, #0d9053);
  z-index: 1;
}
.dot .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.line {
  flex: 1;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--leaf-300, #a8e6cf) 0 4px,
    transparent 4px 8px
  );
  margin-top: -2px;
  min-height: 18px;
}

.tone-green .dot  { color: var(--brand-primary, #0d9053); background: var(--leaf-100, #dcf4e6); }
.tone-coral .dot  { color: var(--coral-700, #b14545); background: var(--coral-100, #ffe3e0); }
.tone-grape .dot  { color: var(--grape-700, #6e3f94); background: var(--grape-100, #ebe0f5); }
.tone-sun   .dot  { color: var(--sun-700, #c99500); background: var(--sun-100, #fff4c9); }
.tone-sky   .dot  { color: var(--sky-700, #2d6f8e); background: var(--sky-100, #dceef5); }

.content {
  flex: 1;
  min-width: 0;
  padding-bottom: 18px;
  padding-top: 4px;
}
.label {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pt-text-muted);
}
.value {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--pt-text-strong);
  line-height: 1.4;
}
.detail {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--pt-text-body);
  line-height: 1.65;
  white-space: pre-wrap;
}
</style>
