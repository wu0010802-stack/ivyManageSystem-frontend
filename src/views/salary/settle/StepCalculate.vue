<template>
  <div>
    <el-empty description="建置中" />
    <el-button type="primary" @click="$emit('next')">下一步 →</el-button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ (e: 'next'): void }>()
</script>
