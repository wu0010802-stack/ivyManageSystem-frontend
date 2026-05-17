<script setup>
/**
 * RuleHistoryDrawer — Task 18 minimal stub；Task 19 會實作完整版
 */
defineProps({
  visible: { type: Boolean, default: false },
  itemCode: { type: String, default: null },
})
defineEmits(['update:visible'])
</script>

<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="`歷史 - ${itemCode || ''}`"
    size="40%"
    data-test="rule-history-drawer"
  >
    <div class="placeholder">Task 19 實作</div>
  </el-drawer>
</template>

<style scoped>
.placeholder { color: var(--el-text-color-secondary); padding: 16px; }
</style>
