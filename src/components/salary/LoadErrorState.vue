<!-- src/components/salary/LoadErrorState.vue
     資料載入失敗的錯誤態（含重新載入）。薪資獎金頁用：失敗時不能退回「尚無資料」——
     行政會把「載入失敗」誤讀成「沒有這筆錢」，進而重複登記或漏發。
     compact：頁內某一區塊失敗時用（縮小留白）；預設為整頁／主內容區用。 -->
<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'

withDefaults(defineProps<{
  title?: string
  description?: string
  retryText?: string
  /** 重試中（按鈕 loading，避免連點重送） */
  retrying?: boolean
  compact?: boolean
}>(), {
  title: '載入失敗',
  description: '載入成功前請勿視為沒有資料，請重新載入。',
  retryText: '重新載入',
  retrying: false,
  compact: false,
})

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="load-error-state" :class="{ 'load-error-state--compact': compact }" data-test="load-error-state">
    <EmptyState variant="error" :title="title" :description="description">
      <template #action>
        <el-button type="primary" :loading="retrying" data-test="load-error-retry" @click="$emit('retry')">
          {{ retryText }}
        </el-button>
      </template>
    </EmptyState>
  </div>
</template>

<style scoped>
.load-error-state--compact :deep(.empty-state--error) {
  padding: var(--space-4) var(--space-2);
}
</style>
