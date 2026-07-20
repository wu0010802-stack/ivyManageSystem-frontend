<script setup lang="ts">
import { Warning, RefreshRight } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    message?: string
    /** 是否顯示重試按鈕（無 retry handler 時可關） */
    retryable?: boolean
  }>(),
  { message: '', retryable: true },
)

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="portal-error-state" role="alert">
    <el-icon class="pes-icon" aria-hidden="true"><Warning /></el-icon>
    <p class="pes-message">{{ message || '載入失敗，請稍後再試' }}</p>
    <el-button
      v-if="retryable"
      type="primary"
      plain
      :icon="RefreshRight"
      @click="$emit('retry')"
    >
      重新載入
    </el-button>
  </div>
</template>

<style scoped>
.portal-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.pes-icon {
  font-size: 40px;
  color: var(--el-color-warning);
}
.pes-message {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
}
</style>
