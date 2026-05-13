<script setup>
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Navigation Bar.
 *
 * 4-tab 底部導航。Active tab 用 active indicator pill (32×32 secondary-container)，
 * icon 切 filled 變體。Inactive 用 outline。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.1
 */
const props = defineProps({
  items: {
    type: Array,
    required: true,
    validator: (arr) =>
      Array.isArray(arr) &&
      arr.every((it) => typeof it.key === 'string' && typeof it.icon === 'string'),
  },
  currentKey: { type: String, required: true },
})

const emit = defineEmits(['select'])

function badgeLabel(badge) {
  if (!badge || badge < 1) return null
  return badge > 99 ? '99+' : String(badge)
}

function iconName(item, isActive) {
  if (isActive && item.activeIcon) return item.activeIcon
  return item.icon
}

function onTabClick(item) {
  emit('select', item.key, item)
}
</script>

<template>
  <nav class="m3-navigation-bar" role="navigation" aria-label="主要功能">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="m3-nav-tab"
      :class="{ 'is-active': item.key === currentKey }"
      :aria-current="item.key === currentKey ? 'page' : null"
      :aria-label="item.label"
      @click="onTabClick(item)"
    >
      <span class="m3-nav-tab-icon-wrap">
        <span class="m3-nav-tab-indicator" aria-hidden="true" />
        <M3Icon
          class="m3-nav-tab-icon"
          :name="iconName(item, item.key === currentKey)"
          :filled="item.key === currentKey"
          :size="24"
          aria-hidden="true"
        />
        <span
          v-if="badgeLabel(item.badge)"
          class="m3-nav-tab-badge"
          :aria-label="`未讀 ${badgeLabel(item.badge)} 則`"
        >{{ badgeLabel(item.badge) }}</span>
      </span>
      <span class="m3-nav-tab-label m3-label-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.m3-navigation-bar {
  display: flex;
  width: 100%;
  height: 80px;
  padding-bottom: env(safe-area-inset-bottom, 0);
  background: var(--m3-surface-container, #ebefe8);
  color: var(--m3-on-surface-variant, #424941);
}

.m3-nav-tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  padding: 12px 0 16px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.m3-nav-tab-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
}
.m3-nav-tab-indicator {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--m3-secondary-container, #d3e8d3);
  opacity: 0;
  transition: opacity var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease);
}
.m3-nav-tab.is-active .m3-nav-tab-indicator { opacity: 1; }

.m3-nav-tab-icon {
  position: relative;
  z-index: 1;
}
.m3-nav-tab.is-active .m3-nav-tab-icon {
  color: var(--m3-on-secondary-container, #0e1f12);
}

.m3-nav-tab-badge {
  position: absolute;
  top: -2px;
  right: 6px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--m3-error, #ba1a1a);
  color: var(--m3-on-error, #ffffff);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.m3-nav-tab-label {
  color: var(--m3-on-surface-variant, #424941);
}
.m3-nav-tab.is-active .m3-nav-tab-label {
  color: var(--m3-on-surface, #181d18);
}
</style>
