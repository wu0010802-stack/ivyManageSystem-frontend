<script setup lang="ts">
// P2-FE-Parent-2：Vue 3 prop type 不接受 `null` constructor；改用
// `default: null` 表達「可空」。原寫法會跳 [Vue warn]: Invalid prop type。
withDefaults(defineProps<{
  icon: string
  iconTone?: string
  label: string
  value?: string | number | null
  detail?: string | null
  hideConnector?: boolean
}>(), {
  iconTone: 'green',
  value: null,
  detail: null,
  hideConnector: false,
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

.tone-green .dot  { color: var(--pt-accent-leaf-on); background: var(--pt-accent-leaf-container); }
.tone-coral .dot  { color: var(--pt-accent-coral-on); background: var(--pt-accent-coral-container); }
.tone-grape .dot  { color: var(--pt-accent-grape-on); background: var(--pt-accent-grape-container); }
.tone-sun   .dot  { color: var(--pt-accent-sun-on); background: var(--pt-accent-sun-container); }
.tone-sky   .dot  { color: var(--pt-accent-sky-on); background: var(--pt-accent-sky-container); }

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
