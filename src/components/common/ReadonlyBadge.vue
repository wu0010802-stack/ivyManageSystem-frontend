<script setup lang="ts">
/**
 * ReadonlyBadge — 無寫入權限時的「唯讀」提示徽章（Task B7）。
 *
 * 共用於各設定頁 tab 標題旁與面板頂部：statelesss，純依 props 顯示，
 * 呼叫方負責算出 show（比對 hasPermission）與 permissionLabel（中文權限白話名）。
 */
withDefaults(
  defineProps<{
    /** 權限白話名（如「考核規則設定」），組成「唯讀（需 XX 權限）」文案 */
    permissionLabel: string
    /** true＝目前使用者無對應寫入權限，顯示徽章 */
    show: boolean
  }>(),
  { show: false },
)
</script>

<template>
  <el-tag v-if="show" type="info" size="small" class="readonly-badge" data-test="readonly-badge">
    唯讀（需{{ permissionLabel }}權限）
  </el-tag>
</template>

<style scoped>
.readonly-badge {
  margin-left: var(--space-2);
}
</style>
