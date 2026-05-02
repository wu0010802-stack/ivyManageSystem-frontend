<script setup>
/**
 * 家長 App 共用 SVG icon 元件。
 *
 * 為什麼自寫不裝 lucide-vue / @iconify？
 *  - 這個 app 只用約 22 個 icon，靜態打包進來最輕量（不額外加載 npm dep）。
 *  - 全部 24x24 viewBox + stroke-width 2 的單一視覺語言，與 tab bar 已用的 stroke svg 對齊。
 *  - 改色直接 currentColor，跟 design tokens 整合最自然。
 *
 * 使用：
 *   <ParentIcon name="message" />                     <!-- 預設 md (22px) 裝飾性 -->
 *   <ParentIcon name="back" size="lg" aria-label="返回" />  <!-- icon-only 按鈕 -->
 *
 * 加新 icon 的規則：
 *  1. 統一 24x24 viewBox、stroke="currentColor"、fill="none"、stroke-width="2"。
 *  2. 從 lucide.dev 取 path 為主（風格一致）。
 *  3. 命名用語意（不是形狀）：用 "back" 不用 "arrow-left"。
 */
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: String, default: 'md' }, // xs / sm / md / lg
  // 預設裝飾性（搭配旁邊有可讀文字 label 的場景）；若是 icon-only button，
  // 必須由父層傳 aria-label。
  decorative: { type: Boolean, default: true },
})

const sizeMap = {
  xs: 'var(--icon-xs, 14px)',
  sm: 'var(--icon-sm, 18px)',
  md: 'var(--icon-md, 22px)',
  lg: 'var(--icon-lg, 28px)',
}

const iconStyle = computed(() => {
  const s = sizeMap[props.size] || sizeMap.md
  return { width: s, height: s, flexShrink: 0 }
})

const ariaHidden = computed(() => (props.decorative ? 'true' : null))
</script>

<template>
  <svg
    :style="iconStyle"
    :aria-hidden="ariaHidden"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="parent-icon"
  >
    <!-- ===== Tab Bar 5 個（與 ParentLayout 已有 svg 對齊） ===== -->
    <template v-if="name === 'home'">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
    </template>
    <template v-else-if="name === 'attendance'">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M4 11h16M8 15h2M14 15h2M8 18h2M14 18h2" />
    </template>
    <template v-else-if="name === 'messages' || name === 'chat'">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </template>
    <template v-else-if="name === 'announcements' || name === 'megaphone'">
      <path d="M3 11l18-8v18l-18-8v-2z" />
      <path d="M11 14l1 6h3l-1-6" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </template>

    <!-- ===== 一般功能 icon ===== -->
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </template>
    <template v-else-if="name === 'clipboard'">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </template>
    <template v-else-if="name === 'notebook'">
      <path d="M2 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
      <path d="M2 10h2M2 14h2M2 18h2M8 4v18" />
    </template>
    <template v-else-if="name === 'pill' || name === 'medication'">
      <path d="M10.5 20.5a7 7 0 1 1 9.9-9.9l-9.9 9.9z" />
      <path d="M8.5 8.5l7 7" />
    </template>
    <template v-else-if="name === 'money' || name === 'fees'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5" />
    </template>
    <template v-else-if="name === 'bell' || name === 'notification'">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </template>
    <template v-else-if="name === 'envelope'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </template>
    <template v-else-if="name === 'document'">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </template>
    <template v-else-if="name === 'attachment' || name === 'paperclip'">
      <path d="M21.4 11l-9 9a5 5 0 1 1-7-7l9-9a3.5 3.5 0 1 1 5 5l-9 9a2 2 0 0 1-3-3l8.5-8.5" />
    </template>
    <template v-else-if="name === 'camera'">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </template>
    <template v-else-if="name === 'location' || name === 'pin'">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </template>
    <template v-else-if="name === 'signature'">
      <path d="M3 17l4-4 3 3 5-5 4 4" />
      <path d="M3 21h18" />
    </template>
    <template v-else-if="name === 'art' || name === 'palette'">
      <circle cx="12" cy="12" r="9" />
      <circle cx="6.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <path d="M12 21a3 3 0 0 1-3-3 3 3 0 0 1 3-3h2a2 2 0 0 0 0-4" />
    </template>
    <template v-else-if="name === 'pickup' || name === 'children'">
      <circle cx="9" cy="5" r="2" />
      <circle cx="17" cy="5" r="2" />
      <path d="M5 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5" />
      <path d="M13 21v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" />
    </template>

    <!-- ===== 操作型 icon ===== -->
    <template v-else-if="name === 'check'">
      <polyline points="20 6 9 17 4 12" />
    </template>
    <template v-else-if="name === 'check-circle'">
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </template>
    <template v-else-if="name === 'close' || name === 'x'">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </template>
    <template v-else-if="name === 'plus'">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </template>
    <template v-else-if="name === 'minus'">
      <line x1="5" y1="12" x2="19" y2="12" />
    </template>
    <template v-else-if="name === 'back' || name === 'arrow-left'">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </template>
    <template v-else-if="name === 'arrow-right' || name === 'chevron-right'">
      <polyline points="9 18 15 12 9 6" />
    </template>
    <template v-else-if="name === 'warn' || name === 'warning' || name === 'alert'">
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </template>
    <template v-else-if="name === 'refresh'">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </template>
    <template v-else-if="name === 'logout'">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </template>

    <!-- fallback：未知 name 顯示空白圓圈，提醒開發者加 icon -->
    <template v-else>
      <circle cx="12" cy="12" r="8" stroke-dasharray="3 3" />
    </template>
  </svg>
</template>

<style scoped>
.parent-icon {
  display: inline-block;
  vertical-align: middle;
  pointer-events: none;
}
</style>
