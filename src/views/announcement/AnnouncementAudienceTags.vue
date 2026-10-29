<script setup lang="ts">
// 員工對象為空＝全體員工可見；家長端另計（含家長＝家長端有設定對象）。
// 桌機表格與手機卡片共用，避免兩邊對象顯示不一致（手機版原本漏掉「含家長」）。
defineProps<{
  employeeCount?: number
  hasParents?: boolean
}>()
</script>

<template>
  <span class="announcement-audience">
    <el-tag v-if="employeeCount" type="warning" size="small">{{ employeeCount }} 位員工</el-tag>
    <el-tag v-else type="primary" size="small">全體員工</el-tag>
    <el-tag v-if="hasParents" type="success" size="small">含家長</el-tag>
  </span>
</template>

<style scoped>
.announcement-audience {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
}
</style>
