<!-- TODO Task 12: real attendance sheet implementation -->
<template>
  <el-drawer
    :model-value="show"
    direction="btt"
    size="60%"
    title="快速點名"
    @update:model-value="$emit('update:show', $event)"
  >
    <div class="placeholder">尚未實作（Task 12）</div>
  </el-drawer>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  direction: { type: String, default: 'check_in' },
})
defineEmits(['update:show', 'done'])
</script>

<style scoped>
.placeholder {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
