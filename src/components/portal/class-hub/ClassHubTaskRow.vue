<template>
  <div class="task-row" :class="{ 'task-row--empty': count === 0 }">
    <span class="task-row__icon">{{ meta.icon }}</span>
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

<script setup>
import { computed } from 'vue'

const KIND_META = {
  attendance:   { icon: '📋', label: '到園點名' },
  medication:   { icon: '💊', label: '用藥執行' },
  observation:  { icon: '🔍', label: '課堂觀察' },
  incident:     { icon: '⚠️', label: '事件紀錄' },
  contact_book: { icon: '📓', label: '每日聯絡簿' },
}

const props = defineProps({
  kind: { type: String, required: true },
  count: { type: Number, default: 0 },
  actionMode: { type: String, default: 'sheet' },
})
defineEmits(['open-sheet', 'jump-page'])

const meta = computed(
  () => KIND_META[props.kind] ?? { icon: '•', label: props.kind }
)
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
  font-size: 18px;
}
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
