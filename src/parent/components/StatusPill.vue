<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
  icon?: string
}>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="status-pill" :class="`tone-${tone}`">
    <span v-if="icon" class="status-pill-icon material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
    {{ label }}
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 11px);
  font-weight: 700;
  line-height: 1;
  padding: 4px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.status-pill-icon { font-size: 13px; }
.tone-ok { background: var(--color-success-soft, #dcfce7); color: var(--pt-success-text, #15803d); }
.tone-warn { background: var(--color-warning-soft, #fff3e0); color: var(--pt-warning-text, #c2740a); }
.tone-danger { background: var(--color-danger-soft, #fee2e2); color: var(--coral-700, #b14545); }
.tone-neutral { background: var(--m3-surface-container-highest, #e7edf3); color: var(--pt-text-soft, #64748b); }
.tone-info { background: var(--color-info-soft, #e0f2fe); color: var(--pt-info-text, #2d6f8e); }
</style>
