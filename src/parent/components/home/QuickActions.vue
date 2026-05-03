<script setup>
/**
 * 家長首頁「常用操作」四宮格。
 *
 * 接受 actions 陣列（每項：{ icon, label, path, tint }），渲染 grid 按鈕。
 * 為純呈現元件，路由由父層透過 `@navigate="go"` 接住。
 */
import ParentIcon from '../ParentIcon.vue'

defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <section class="quick-section">
    <h3 class="section-title">常用操作</h3>
    <div class="quick-grid pt-stagger">
      <button
        v-for="q in actions"
        :key="q.path"
        class="quick-tile press-scale"
        type="button"
        @click="emit('navigate', q.path)"
      >
        <span class="quick-icon" :class="`tint-${q.tint}`">
          <ParentIcon :name="q.icon" size="md" />
        </span>
        <span class="quick-label">{{ q.label }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 0 0 8px 4px;
  letter-spacing: 0.02em;
}

.quick-section {
  display: flex;
  flex-direction: column;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quick-tile {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 6px 12px;
  border: var(--pt-hairline);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: var(--pt-elev-1);
  cursor: pointer;
}
.quick-tile:active { background: var(--pt-surface-mute-soft); }
.quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
}
.quick-icon.tint-contact     { background: var(--pt-tint-contact);     color: var(--pt-tint-contact-fg); }
.quick-icon.tint-calendar    { background: var(--pt-tint-calendar);    color: var(--pt-tint-calendar-fg); }
.quick-icon.tint-leave       { background: var(--pt-tint-leave);       color: var(--pt-tint-leave-fg); }
.quick-icon.tint-medication  { background: var(--pt-tint-medication);  color: var(--pt-tint-medication-fg); }
.quick-label {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-muted);
  font-weight: var(--font-weight-medium, 500);
}
</style>
