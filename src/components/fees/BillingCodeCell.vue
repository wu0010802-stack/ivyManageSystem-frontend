<template>
  <span v-if="!suffix" class="bcc-empty" data-test="bcc-empty">—</span>
  <el-popover
    v-else
    placement="top"
    :width="240"
    trigger="click"
  >
    <template #reference>
      <button
        type="button"
        class="bcc-suffix"
        data-test="bcc-suffix"
        :aria-label="`銷帳碼末四碼 ${suffix}，點擊查看完整編號`"
      >
        {{ suffix }}
      </button>
    </template>
    <div class="bcc-pop" data-test="bcc-pop">
      <template v-if="fullNumber">
        <p class="bcc-pop__label">完整銷帳編號（家長繳款單／網銀明細）</p>
        <p class="bcc-pop__number" data-test="bcc-full">{{ fullNumber }}</p>
        <el-button size="small" data-test="bcc-copy" @click="copyFull">
          複製編號
        </el-button>
      </template>
      <p v-else class="bcc-pop__hint" data-test="bcc-no-full">
        尚未設定虛擬帳號專案代號（或此筆無歸屬月份），無法組出完整編號；末四碼為 {{ suffix }}。
      </p>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * 帳款列銷帳碼 cell（SPEC-014 §16）：預設只顯示末四碼，點擊展開依該筆
 * 歸月推導的完整 14 碼並可一鍵複製（對網銀明細用）。
 */
import { ElMessage } from 'element-plus'

const props = defineProps<{
  suffix?: string | null
  fullNumber?: string | null
}>()

async function copyFull() {
  const value = props.fullNumber
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已複製完整銷帳編號')
  } catch {
    ElMessage.error('複製失敗，請手動選取編號複製')
  }
}
</script>

<style scoped>
.bcc-empty {
  color: var(--el-text-color-placeholder);
}

.bcc-suffix {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-primary);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.bcc-pop__label {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.bcc-pop__number {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  user-select: all;
  color: var(--el-text-color-primary);
}

.bcc-pop__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
