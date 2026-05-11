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
    <div class="pt-section-head">
      <h3 class="pt-section-title">常用操作</h3>
    </div>
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
.quick-section {
  display: flex;
  flex-direction: column;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.quick-tile {
  background: var(--pt-surface-card);
  border-radius: var(--pt-card-radius, 14px);
  padding: 13px;
  border: 1px solid var(--pt-page-border, var(--pt-border));
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  cursor: pointer;
  min-height: 68px;
  text-align: left;
}
.quick-tile:active { background: var(--pt-surface-mute-soft); }
.quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
}
.quick-icon.tint-contact     { background: var(--pt-tint-contact);     color: var(--pt-tint-contact-fg);    border: 1px solid color-mix(in srgb, var(--pt-tint-contact-fg) 34%, transparent); }
.quick-icon.tint-calendar    { background: var(--pt-tint-calendar);    color: var(--pt-tint-calendar-fg);   border: 1px solid color-mix(in srgb, var(--pt-tint-calendar-fg) 34%, transparent); }
.quick-icon.tint-leave       { background: var(--pt-tint-leave);       color: var(--pt-tint-leave-fg);      border: 1px solid color-mix(in srgb, var(--pt-tint-leave-fg) 34%, transparent); }
.quick-icon.tint-medication  { background: var(--pt-tint-medication);  color: var(--pt-tint-medication-fg); border: 1px solid color-mix(in srgb, var(--pt-tint-medication-fg) 34%, transparent); }
.quick-label {
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  font-weight: 800;
}
</style>
