<!--
  Stub (worktree-local only) — 2026-05-17 contact book redesign pilot
  =====================================================================
  真檔在 user `refactor-fees-by-class` WIP 分支尚未 merge 到 main，
  導致 vite scan FeesTab.vue 時 ENOENT 擋住整個 dev server。
  本 stub 僅讓 vite 解析過得去；admin 端的 FeesTab 折抵編輯功能在此
  分支會跳出佔位提示（家長端不受影響）。
  user merge `refactor-fees-by-class` 後請 `git rm` 本檔。
-->
<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: boolean
  student?: Record<string, unknown> | null
  period?: string
  adjustmentType?: string
  existing?: Record<string, unknown> | null
}>(), {
  modelValue: false,
  student: null,
  period: '',
  adjustmentType: '',
  existing: null,
})
defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()
</script>

<template>
  <div v-if="modelValue" class="adj-stub" role="dialog" aria-modal="true">
    <div class="adj-stub-box">
      <p>折抵編輯元件尚未合併到此分支（pilot worktree）。</p>
      <button type="button" @click="$emit('update:modelValue', false)">關閉</button>
    </div>
  </div>
</template>

<style scoped>
.adj-stub {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.adj-stub-box {
  background: #fff; padding: 24px; border-radius: 12px;
  max-width: 320px; text-align: center;
}
.adj-stub-box button {
  margin-top: 12px; padding: 8px 16px;
  background: #0d9053; color: #fff; border: none; border-radius: 6px;
}
</style>
