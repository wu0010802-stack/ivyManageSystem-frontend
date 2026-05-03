<script setup>
/**
 * 家長 More 頁「外觀 + 無障礙」偏好設定區塊。
 *
 * 內含：
 *  - 主題切換：跟隨系統 / 亮色 / 深色（呼叫 useTheme）
 *  - 字級：sm / md / lg / xl（呼叫 useA11y）
 *  - 高對比 toggle（呼叫 useA11y）
 *
 * 自包含元件：直接 import composables，無 props/emits。
 * 與其他元件可正交組合（不依賴父層 state）。
 */
import { useTheme } from '../../composables/useTheme'
import { useA11y } from '../../composables/useA11y'

const { preference: themePref, setPreference: setTheme } = useTheme()
const { fontSize, highContrast, setFontSize, setHighContrast } = useA11y()

const THEME_OPTIONS = [
  { key: 'system', label: '跟隨系統' },
  { key: 'light', label: '亮色' },
  { key: 'dark', label: '深色' },
]

const FONT_SIZE_OPTIONS = [
  { key: 'sm', label: '小' },
  { key: 'md', label: '中' },
  { key: 'lg', label: '大' },
  { key: 'xl', label: '特大' },
]
</script>

<template>
  <!-- 外觀（亮 / 深 / 跟隨系統） -->
  <div class="group">
    <div class="group-title">外觀</div>
    <div
      class="theme-card"
      role="radiogroup"
      aria-label="主題顏色偏好"
    >
      <button
        v-for="opt in THEME_OPTIONS"
        :key="opt.key"
        type="button"
        class="theme-btn press-scale"
        :class="{ active: themePref === opt.key }"
        role="radio"
        :aria-checked="themePref === opt.key"
        @click="setTheme(opt.key)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>

  <!-- 無障礙：字級 + 高對比 -->
  <div class="group">
    <div class="group-title">無障礙</div>
    <div class="a11y-card">
      <div class="a11y-row">
        <div class="a11y-label">
          <strong>字級</strong>
          <span class="a11y-sub">調整 App 內全部文字大小</span>
        </div>
        <div
          class="size-grid"
          role="radiogroup"
          aria-label="字級偏好"
        >
          <button
            v-for="opt in FONT_SIZE_OPTIONS"
            :key="opt.key"
            type="button"
            class="size-btn press-scale"
            :class="{ active: fontSize === opt.key }"
            role="radio"
            :aria-checked="fontSize === opt.key"
            @click="setFontSize(opt.key)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="a11y-row">
        <div class="a11y-label">
          <strong>高對比</strong>
          <span class="a11y-sub">加深文字與框線、提高 brand 色對比度</span>
        </div>
        <button
          type="button"
          class="hc-toggle press-scale"
          :class="{ active: highContrast }"
          role="switch"
          :aria-checked="highContrast"
          @click="setHighContrast(!highContrast)"
        >
          <span class="hc-thumb" />
          <span class="sr-only">{{ highContrast ? '已開啟' : '已關閉' }}</span>
        </button>
      </div>
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

/* ===== 外觀切換 ===== */
.theme-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2, 8px);
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-2, 8px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}

.theme-btn {
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px);
  background: transparent;
  border: 1px solid var(--pt-border);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.theme-btn.active {
  background: var(--brand-primary-soft);
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}

/* ===== 無障礙偏好 ===== */
.a11y-card {
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.a11y-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.a11y-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.a11y-label strong {
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  font-weight: var(--font-weight-medium, 500);
}

.a11y-label .a11y-sub {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-soft);
}

/* 字級 4 連按 */
.size-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  flex-shrink: 0;
}

.size-btn {
  min-width: 38px;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-2, 8px);
  background: transparent;
  border: 1px solid var(--pt-border);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.size-btn.active {
  background: var(--brand-primary-soft);
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}

/* iOS-style switch */
.hc-toggle {
  position: relative;
  width: 50px;
  height: 30px;
  border-radius: 15px;
  background: var(--pt-border-strong);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--transition-fast, 0.15s ease);
}

.hc-toggle.active {
  background: var(--brand-primary);
}

.hc-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: var(--neutral-0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-fast, 0.15s ease);
}

.hc-toggle.active .hc-thumb {
  transform: translateX(20px);
}

@media (prefers-reduced-motion: reduce) {
  .hc-thumb,
  .hc-toggle {
    transition: none;
  }
}
</style>
