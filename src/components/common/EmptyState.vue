<template>
  <div
    class="empty-state"
    :class="[`empty-state--${variant}`]"
    role="status"
    aria-live="polite"
  >
    <el-icon v-if="iconType === 'el'" class="empty-state__icon" :size="iconSize">
      <component :is="resolvedIcon" />
    </el-icon>
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

<script setup>
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
 *  - 預設用 Element Plus 的 FolderOpened
 *  - 傳 ElIcon 物件（如 import { Warning } from '@element-plus/icons-vue'）→ 自動偵測
 *  - 傳 Vue component（如 ParentIcon、KawaiiStar）→ 也支援
 */
import { computed } from 'vue'
import { FolderOpened, WarningFilled } from '@element-plus/icons-vue'

const props = defineProps({
  icon: { type: [String, Object, Function], default: null },
  title: { type: String, default: '暫無資料' },
  description: { type: String, default: '' },
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'mobile', 'error', 'inline'].includes(v),
  },
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
  if (typeof i === 'object' && (i.render || i.setup || i.template)) return 'component'
  return 'el'
})

const resolvedIcon = computed(() => {
  if (props.icon) return props.icon
  return props.variant === 'error' ? WarningFilled : FolderOpened
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
