<template>
  <el-dialog
    :model-value="visible"
    class="session-idle-modal"
    title="即將自動登出"
    width="420"
    :close-on-click-modal="false"
    :show-close="false"
    @update:model-value="(v: boolean) => { if (!v) $emit('close') }"
  >
    <p>由於閒置過久，系統將於 {{ countdownLabel }} 後自動登出。</p>

    <template #footer>
      <el-button @click="$emit('close')">關閉</el-button>
      <el-button type="primary" @click="$emit('extend')">繼續使用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 閒置逾時警告 modal：純展示元件，不含計時邏輯。
 * 倒數文字由父層（useIdleTimeout）傳入的 remainingSeconds 驅動。
 * 詳見 docs/superpowers/specs/2026-07-06-idle-session-timeout-design.md
 */
const props = defineProps<{
  visible: boolean
  remainingSeconds: number
}>()

defineEmits<{
  close: []
  extend: []
}>()

const countdownLabel = computed(() => {
  const total = Math.max(0, props.remainingSeconds)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
</script>
