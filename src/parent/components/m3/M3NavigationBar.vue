<script setup lang="ts">
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

interface NavItem {
  key: string
  icon: string
  activeIcon?: string
  label: string
  badge?: number
  /** 隆起的圓形主按鈕（bottom-app-bar FAB 造型），一列最多一顆 */
  prominent?: boolean
}

/**
 * Material 3 Navigation Bar.
 *
 * 底部導航。Active tab 用 active indicator pill (32×32 secondary-container)，
 * icon 切 filled 變體。Inactive 用 outline。
 *
 * `prominent` 的 tab 改成「永久隆起」的圓形 FAB：導航列在它下方挖一個凹槽
 * （radial-gradient 挖洞的 `::before` 背景層），圓鈕懸浮於凹槽上方。隆起與陰影
 * 是靜態的，不隨 hover / active 變化；hover / press 只改按鈕顏色（state layer）。
 * 「目前分頁」另用 filled icon + 標籤色 + 標籤下方小圓點表達，與隆起語意分開。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.1
 */
const props = defineProps<{
  items: NavItem[]
  currentKey: string
}>()

/** 凹槽的水平中心：對齊第一顆 prominent tab 的中線（tab 等寬 flex: 1）。 */
const notchX = computed<string | null>(() => {
  const idx = props.items.findIndex((it) => it.prominent)
  if (idx < 0) return null
  return `${((idx + 0.5) / props.items.length) * 100}%`
})

const emit = defineEmits<{
  'select': [key: string, item: NavItem]
}>()

function badgeLabel(badge: number | undefined): string | null {
  if (!badge || badge < 1) return null
  return badge > 99 ? '99+' : String(badge)
}

function iconName(item: NavItem, isActive: boolean): string {
  if (isActive && item.activeIcon) return item.activeIcon
  return item.icon
}

function onTabClick(item: NavItem): void {
  emit('select', item.key, item)
}
</script>

<template>
  <nav
    class="m3-navigation-bar"
    :class="{ 'has-prominent': notchX !== null }"
    :style="notchX !== null ? { '--m3-nav-notch-x': notchX } : undefined"
    role="navigation"
    aria-label="主要功能"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="m3-nav-tab"
      :class="{ 'is-active': item.key === currentKey, 'is-prominent': item.prominent }"
      :aria-current="item.key === currentKey ? 'page' : undefined"
      :aria-label="item.label"
      @click="onTabClick(item)"
    >
      <span :class="item.prominent ? 'm3-nav-fab' : 'm3-nav-tab-icon-wrap'">
        <span v-if="!item.prominent" class="m3-nav-tab-indicator" aria-hidden="true" />
        <M3Icon
          class="m3-nav-tab-icon"
          :name="iconName(item, item.key === currentKey)"
          :filled="item.key === currentKey"
          :size="item.prominent ? 26 : 24"
          aria-hidden="true"
        />
        <span
          v-if="badgeLabel(item.badge)"
          class="m3-nav-tab-badge"
          :aria-label="`未讀 ${badgeLabel(item.badge)} 則`"
        >{{ badgeLabel(item.badge) }}</span>
      </span>
      <span class="m3-nav-tab-label m3-label-medium">{{ item.label }}</span>
      <span v-if="item.prominent" class="m3-nav-tab-dot" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.m3-navigation-bar {
  --m3-nav-bg: var(--m3-surface-container, #ebefe8);
  /* 凹槽半徑：FAB 56px 半徑 28 + 6px 呼吸間距（FAB 圓心在列頂上方 4px，見 .m3-nav-fab） */
  --m3-nav-notch-r: 34px;
  position: relative;
  display: flex;
  width: 100%;
  height: 80px;
  padding-bottom: env(safe-area-inset-bottom, 0);
  color: var(--m3-on-surface-variant, #424941);
}
/* 背景獨立成 ::before 圖層：有 prominent tab 時用 radial-gradient 在列頂挖一個
 * 透明圓洞當凹槽，FAB 才能「浮出」列面而不被自身背景蓋住。凹槽邊緣疊一圈淡陰影
 * 做內凹感。無 prominent tab 時就是原本的實色列底。 */
.m3-navigation-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--m3-nav-bg);
  pointer-events: none;
}
.m3-navigation-bar.has-prominent::before {
  background: radial-gradient(
    circle calc(var(--m3-nav-notch-r) + 6px) at var(--m3-nav-notch-x, 50%) 0,
    transparent var(--m3-nav-notch-r),
    rgba(27, 60, 38, 0.14) calc(var(--m3-nav-notch-r) + 0.6px),
    var(--m3-nav-bg) calc(var(--m3-nav-notch-r) + 6px)
  );
}
:root[data-theme='dark'] .m3-navigation-bar.has-prominent::before {
  background: radial-gradient(
    circle calc(var(--m3-nav-notch-r) + 6px) at var(--m3-nav-notch-x, 50%) 0,
    transparent var(--m3-nav-notch-r),
    rgba(0, 0, 0, 0.45) calc(var(--m3-nav-notch-r) + 0.6px),
    var(--m3-nav-bg) calc(var(--m3-nav-notch-r) + 6px)
  );
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
/* 圓形 hover/focus/press 狀態層：40×40 正圓，疊在橢圓 icon-wrap 正中央，
 * 樣式與命中區大小比照 M3IconButton 的 state-layer 慣例，讓 icon 有跟其他
 * 圓形 icon 按鈕一致的觸控回饋（此前底部導航列完全沒有 hover 樣式）。 */
.m3-nav-tab-icon-wrap::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 9999px;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-nav-tab:hover .m3-nav-tab-icon-wrap::after { opacity: var(--m3-state-hover, 0.08); }
.m3-nav-tab:focus-visible .m3-nav-tab-icon-wrap::after { opacity: var(--m3-state-focus, 0.12); }
.m3-nav-tab:active .m3-nav-tab-icon-wrap::after { opacity: var(--m3-state-pressed, 0.12); }
@media (prefers-reduced-motion: reduce) {
  .m3-nav-tab-icon-wrap::after { transition: none; }
}
.m3-nav-tab-indicator {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--m3-secondary-container, #d3e8d3);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity var(--motion-quick, 150ms) ease,
    transform var(--motion-base, 260ms) var(--motion-spring, ease);
}
.m3-nav-tab.is-active .m3-nav-tab-indicator { opacity: 1; transform: scale(1); }

.m3-nav-tab-icon {
  position: relative;
  z-index: 1;
  transition: transform var(--motion-base, 260ms) var(--motion-spring, ease);
}
.m3-nav-tab.is-active .m3-nav-tab-icon { transform: scale(1.06); }
@media (prefers-reduced-motion: reduce) {
  .m3-nav-tab-indicator,
  .m3-nav-tab-icon { transition: none; }
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

/* ============================================================
 * Prominent tab：永久隆起的圓形 FAB（bottom-app-bar 凹槽造型）
 * 隆起（位置 / 尺寸 / 陰影）全部是靜態值，不掛在 hover / active 上；
 * hover / press 只透過 ::after state layer 改顏色。
 * ============================================================ */
.m3-nav-tab.is-prominent {
  /* 標籤貼齊其他 tab 的標籤基線（12 + 32 + 4 = 48px 起），FAB 另行絕對定位 */
  justify-content: flex-end;
}
.m3-nav-fab {
  --m3-nav-fab-size: 56px;
  position: absolute;
  top: -32px; /* 圓心落在列頂上方 4px：上半身 32px 浮出列面，下半身 24px 嵌進凹槽 */
  left: 50%;
  margin-left: calc(var(--m3-nav-fab-size) / -2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--m3-nav-fab-size);
  height: var(--m3-nav-fab-size);
  border-radius: 9999px;
  /* 品牌綠漸層：亮綠 → 品牌深綠 → M3 primary，白 icon 對最亮端仍 ≥3:1（非文字 AA） */
  background: linear-gradient(
    145deg,
    var(--ivy-green-mid, #41a074) 0%,
    var(--brand-primary, #0d9053) 55%,
    var(--m3-primary, #006d3d) 100%
  );
  color: #ffffff;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.14),
    0 8px 18px -6px rgba(13, 144, 83, 0.55);
  z-index: 1;
}
/* 深色主題 --m3-primary 是淺綠，漸層尾端改用 primary-container 維持深綠收尾 */
:root[data-theme='dark'] .m3-nav-fab {
  background: linear-gradient(
    145deg,
    var(--ivy-green-mid, #41a074) 0%,
    var(--brand-primary, #0d9053) 55%,
    var(--m3-primary-container, #00522c) 100%
  );
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.5),
    0 8px 18px -6px rgba(0, 0, 0, 0.6);
}
/* state layer：hover 泛白、按下壓暗，只動顏色 */
.m3-nav-fab::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: #ffffff;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-nav-tab:hover .m3-nav-fab::after { opacity: 0.14; }
.m3-nav-tab:active .m3-nav-fab::after { background: #000000; opacity: 0.16; }

.m3-nav-tab.is-prominent .m3-nav-tab-icon {
  color: #ffffff;
  transform: none; /* 隆起鈕不做 active 放大，避免與「永久隆起」語意混淆 */
}
.m3-nav-fab .m3-nav-tab-badge {
  top: -2px;
  right: -4px;
  box-shadow: 0 0 0 2px var(--m3-nav-bg);
}

/* 鍵盤 focus：環在圓鈕上（原生 outline 會框住整個 tab 矩形，和圓鈕造型打架） */
.m3-nav-tab.is-prominent:focus-visible { outline: none; }
.m3-nav-tab.is-prominent:focus-visible .m3-nav-fab {
  outline: 3px solid var(--m3-primary, #006d3d);
  outline-offset: 3px;
}

/* 目前分頁指示：標籤下方小圓點（其他 tab 用 pill，隆起鈕永遠是綠底所以改用圓點） */
.m3-nav-tab-dot {
  position: absolute;
  bottom: 7px;
  left: 50%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: 9999px;
  background: var(--brand-primary, #0d9053);
  opacity: 0;
  transform: scale(0.5);
  transition: opacity var(--motion-quick, 150ms) ease,
    transform var(--motion-base, 260ms) var(--motion-spring, ease);
}
.m3-nav-tab.is-active .m3-nav-tab-dot { opacity: 1; transform: scale(1); }
@media (prefers-reduced-motion: reduce) {
  .m3-nav-fab::after,
  .m3-nav-tab-dot { transition: none; }
}
</style>
