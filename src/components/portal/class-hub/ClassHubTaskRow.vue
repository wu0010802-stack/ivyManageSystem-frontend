<template>
  <div class="task-row" :class="{ 'task-row--empty': count === 0 }">
    <span class="task-row__icon" :class="`task-row__icon--${iconKind}`">
      <svg v-if="iconKind === 'attendance'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
        <path d="M9 4.5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
        <path d="M9 12.5l2.2 2.2 4.3-4.4" />
      </svg>
      <svg v-else-if="iconKind === 'medication'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(-40 12 12)" />
        <path d="M9.5 9.7l5 5" />
      </svg>
      <svg v-else-if="iconKind === 'observation'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg v-else-if="iconKind === 'incident'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3.5 22 20H2Z" />
        <path d="M12 10v4.5" />
        <path d="M12 17.5h.01" />
      </svg>
      <svg v-else-if="iconKind === 'contact_book'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4.5 4.5a2 2 0 0 1 2-2H19.5v19H6.5a2 2 0 0 1-2-2Z" />
        <path d="M8.5 2.5v19" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
      </svg>
    </span>
    <span class="task-row__label">{{ meta.label }}</span>
    <span v-if="count > 0" class="task-row__count">（{{ count }}）</span>
    <span v-else class="task-row__none">無</span>
    <span class="task-row__action">
      <el-button
        v-if="actionMode === 'sheet'"
        type="primary"
        link
        @click="$emit('open-sheet')"
      >
        快速處理
      </el-button>
      <el-button
        v-else-if="actionMode === 'page'"
        type="primary"
        link
        @click="$emit('jump-page')"
      >
        跳頁面 →
      </el-button>
      <el-button
        v-else-if="actionMode === 'inline_button'"
        type="primary"
        link
        @click="$emit('open-sheet')"
      >
        + 新增
      </el-button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Phase 1 殼層改版：emoji 圖示改線稿 SVG，tint 色塊對應 soft-ui.css 的 --pt-tint-*
const KIND_META: Record<string, { label: string }> = {
  attendance:   { label: '到園點名' },
  medication:   { label: '用藥執行' },
  observation:  { label: '課堂觀察' },
  incident:     { label: '事件紀錄' },
  contact_book: { label: '每日聯絡簿' },
}

const props = withDefaults(defineProps<{
  kind: string
  count?: number
  actionMode?: string
}>(), {
  count: 0,
  actionMode: 'sheet',
})
defineEmits<{ 'open-sheet': []; 'jump-page': [] }>()

const meta = computed(
  () => KIND_META[props.kind] ?? { label: props.kind }
)

// 未知 kind 走 fallback 圓點圖示（template v-else 分支）與中性 tint
const iconKind = computed(() => (KIND_META[props.kind] ? props.kind : 'unknown'))
</script>

<style scoped>
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.task-row:last-child {
  border-bottom: none;
}
.task-row--empty {
  opacity: 0.6;
}
.task-row__icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.task-row__icon svg {
  width: 16px;
  height: 16px;
}
.task-row__icon--attendance { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.task-row__icon--medication { background: var(--pt-tint-medication); color: var(--pt-tint-medication-fg); }
.task-row__icon--observation { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }
.task-row__icon--incident { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.task-row__icon--contact_book { background: var(--pt-tint-contact); color: var(--pt-tint-contact-fg); }
.task-row__icon--unknown { background: var(--pt-surface-mute); color: var(--pt-text-muted); }
.task-row__label {
  font-weight: 500;
}
.task-row__count {
  color: var(--el-color-primary);
  font-weight: 600;
}
.task-row__none {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.task-row__action {
  margin-left: auto;
}
</style>
