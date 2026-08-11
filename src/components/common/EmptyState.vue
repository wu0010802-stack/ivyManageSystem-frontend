<template>
  <div
    class="empty-state"
    :class="[`empty-state--${variant}`]"
    role="status"
    aria-live="polite"
  >
    <component
      v-if="iconType === 'el'"
      :is="resolvedIcon"
      class="empty-state__icon"
      :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
      aria-hidden="true"
    />
    <component
      v-else-if="iconType === 'component'"
      :is="resolvedIcon"
      class="empty-state__icon empty-state__icon--brand"
      aria-hidden="true"
    />

    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>

    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 共用空狀態元件。跨 admin/portal/parent 三 app。
 *
 * 為什麼增強：UI/UX 體檢發現 EmptyState 只被引入 9 次，但 inline「暫無資料 / 沒有資料」
 * 字串散落 89 處。這次加 variant + brand icon slot，方便 parent app 也採用。
 *
 * Variants：
 *  - default：桌面（admin）預設，padding 大、icon 48
 *  - mobile：行動（parent/portal）較緊湊，padding 中、icon 40
 *  - error：錯誤態，icon 紅
 *  - inline：列表內無資料（無 padding 撐高，icon 32）
 *
 * Icon：
 *  - 預設用內建的 folder-opened / warning 線稿（inline SVG，見下方 FolderOpenedIcon/
 *    WarningFilledIcon，圖形取自 Element Plus 的 FolderOpened/WarningFilled 原始
 *    path data，視覺等價）——此元件被 14 個 parent lazy route 引入，靜態 import
 *    `@element-plus/icons-vue` + `<el-icon>` 會讓這些 route chunk 額外橋接到
 *    `admin-core` chunk（實測 gzip ~28KB，parent 端從未真正用到 admin-core 其他內容），
 *    改 inline SVG 後徹底斷開這條依賴
 *  - 傳 Vue component（如 ParentIcon、KawaiiStar）→ 支援，直接渲染
 */
import { computed, h, type FunctionalComponent } from 'vue'

/** 對應 Element Plus FolderOpened 的 path data（viewBox 0 0 1024 1024）。 */
const FolderOpenedIcon: FunctionalComponent = () => h(
  'svg',
  { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 1024 1024' },
  [h('path', {
    fill: 'currentColor',
    d: 'M878.08 448H241.92l-96 384h636.16zM832 384v-64H485.76L357.504 192H128v448l57.92-231.744A32 32 0 0 1 216.96 384zm-24.96 512H96a32 32 0 0 1-32-32V160a32 32 0 0 1 32-32h287.872l128.384 128H864a32 32 0 0 1 32 32v96h23.04a32 32 0 0 1 31.04 39.744l-112 448A32 32 0 0 1 807.04 896',
  })],
)

/** 對應 Element Plus WarningFilled 的 path data（viewBox 0 0 1024 1024）。 */
const WarningFilledIcon: FunctionalComponent = () => h(
  'svg',
  { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 1024 1024' },
  [h('path', {
    fill: 'currentColor',
    d: 'M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 192a58.43 58.43 0 0 0-58.24 63.744l23.36 256.384a35.072 35.072 0 0 0 69.76 0l23.296-256.384A58.43 58.43 0 0 0 512 256m0 512a51.2 51.2 0 1 0 0-102.4 51.2 51.2 0 0 0 0 102.4',
  })],
)

const props = withDefaults(defineProps<{
  icon?: string | object | ((...args: unknown[]) => unknown) | null
  title?: string
  description?: string
  variant?: 'default' | 'mobile' | 'error' | 'inline'
}>(), {
  icon: null,
  title: '暫無資料',
  description: '',
  variant: 'default',
})

const iconSize = computed(() => {
  if (props.variant === 'inline') return 32
  if (props.variant === 'mobile') return 40
  return 48
})

// Element Plus icons 是物件且有 name 是 '名'結尾；自訂 Vue component 通常是 SFC default export
// 簡易判斷：icon 是 object 且有 render 或 setup 等 component option → 視為 component
const iconType = computed(() => {
  const i = props.icon
  if (!i) return 'el'
  if (typeof i === 'object') {
    const obj = i as Record<string, unknown>
    if (obj.render || obj.setup || obj.template) return 'component'
  }
  return 'el'
})

const resolvedIcon = computed(() => {
  if (props.icon) return props.icon
  return props.variant === 'error' ? WarningFilledIcon : FolderOpenedIcon
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-state--default {
  padding: var(--space-8) var(--space-4);
}
.empty-state--mobile {
  padding: var(--space-6) var(--space-4);
}
.empty-state--error {
  padding: var(--space-8) var(--space-4);
}
.empty-state--inline {
  padding: var(--space-4) var(--space-2);
}

.empty-state__icon {
  color: var(--text-tertiary, #94a3b8);
  margin-bottom: var(--space-4);
}
.empty-state--error .empty-state__icon {
  color: var(--color-danger, #ef4444);
}
.empty-state__icon--brand {
  width: 48px;
  height: 48px;
}
.empty-state--mobile .empty-state__icon--brand { width: 40px; height: 40px; }
.empty-state--inline .empty-state__icon--brand { width: 32px; height: 32px; }

.empty-state__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--text-secondary, #64748b);
}
.empty-state--inline .empty-state__title {
  font-size: var(--text-base);
}

.empty-state__desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary, #94a3b8);
  max-width: 320px;
  line-height: var(--line-height-base, 1.5);
}

.empty-state__action {
  margin-top: var(--space-4);
}
</style>
