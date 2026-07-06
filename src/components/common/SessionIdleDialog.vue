<script setup lang="ts">
// 閒置倒數彈窗：綁 useSessionWatchdog singleton 狀態。
// spec：workspace docs/superpowers/specs/2026-07-06-idle-session-grace-design.md
import { computed } from 'vue'
import {
  useSessionWatchdogState,
  continueSession,
  logoutNow,
} from '@/composables/useSessionWatchdog'

const { countdownRemainingMs } = useSessionWatchdogState()

const visible = computed(() => countdownRemainingMs.value !== null)
const countdownText = computed(() => {
  const totalSec = Math.max(0, Math.ceil((countdownRemainingMs.value ?? 0) / 1000))
  const mm = Math.floor(totalSec / 60)
  const ss = String(totalSec % 60).padStart(2, '0')
  return `${mm}:${ss}`
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="閒置提醒"
    width="360px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    align-center
  >
    <p class="idle-dialog__text">
      您已閒置一段時間，將於
      <strong class="idle-dialog__countdown">{{ countdownText }}</strong>
      後自動登出。
    </p>
    <template #footer>
      <el-button @click="logoutNow">立即登出</el-button>
      <el-button type="primary" @click="continueSession">繼續使用</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.idle-dialog__text {
  margin: 0;
  line-height: 1.6;
}
.idle-dialog__countdown {
  font-variant-numeric: tabular-nums;
}
</style>
