<script setup>
/**
 * 家長 More 頁可重用的 menu group 元件。
 *
 * 渲染：title（小灰標）+ 卡片，內含多個 router-link menu items。
 * 每個 item: { icon, tint, title, path }
 *
 * 純呈現元件，路由由 router-link 處理；無 emits。
 *
 * Props:
 *  - title: 群組標題（必填）
 *  - items: menu 項目陣列（必填）
 */
import ParentIcon from '../ParentIcon.vue'

defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
})
</script>

<template>
  <div class="group">
    <div class="group-title">{{ title }}</div>
    <div class="menu-card">
      <router-link
        v-for="item in items"
        :key="item.path"
        :to="item.path"
        class="menu-item press-scale"
      >
        <span class="icon" :class="`tint-${item.tint}`">
          <ParentIcon :name="item.icon" size="sm" />
        </span>
        <span class="title">{{ item.title }}</span>
        <ParentIcon name="chevron-right" size="sm" class="arrow" />
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
}

.group-title {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 4px 4px 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.menu-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  min-height: 52px;
  padding: 10px var(--space-4, 16px);
  border-bottom: 1px solid var(--pt-border-light);
  text-decoration: none;
  color: var(--pt-text-strong);
  transition: background var(--transition-fast, 0.15s ease);
}

.menu-item:last-child { border-bottom: none; }

.menu-item:active {
  background: var(--pt-surface-mute-soft);
}

.menu-item .icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
.menu-item .icon.tint-money       { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg); }
.menu-item .icon.tint-message     { background: var(--pt-tint-message);      color: var(--pt-tint-message-fg); }
.menu-item .icon.tint-event       { background: var(--pt-tint-event);        color: var(--pt-tint-event-fg); }
.menu-item .icon.tint-announcement{ background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.menu-item .icon.tint-leave       { background: var(--pt-tint-leave);        color: var(--pt-tint-leave-fg); }
.menu-item .icon.tint-activity    { background: var(--pt-tint-activity);     color: var(--pt-tint-activity-fg); }
.menu-item .icon.tint-medication  { background: var(--pt-tint-medication);   color: var(--pt-tint-medication-fg); }
.menu-item .icon.tint-calendar    { background: var(--pt-tint-calendar);     color: var(--pt-tint-calendar-fg); }
.menu-item .icon.tint-contact     { background: var(--pt-tint-contact);      color: var(--pt-tint-contact-fg); }

.menu-item .title {
  flex: 1;
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-medium, 500);
}

.menu-item .arrow {
  color: var(--pt-text-hint);
  flex-shrink: 0;
}
</style>
