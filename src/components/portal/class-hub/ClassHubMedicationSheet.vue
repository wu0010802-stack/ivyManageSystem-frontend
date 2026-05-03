<!-- TODO Task 13: real medication sheet implementation -->
<template>
  <el-drawer
    :model-value="show"
    direction="btt"
    size="60%"
    title="用藥執行"
    @update:model-value="$emit('update:show', $event)"
  >
    <div class="placeholder">尚未實作（Task 13）</div>
  </el-drawer>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  orderId: { type: Number, default: null },
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
