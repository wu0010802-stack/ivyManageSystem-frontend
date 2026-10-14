<script setup lang="ts">
/**
 * BottomSheet 內的「放棄填到一半的內容？」確認列（搭配 useSheetCloseGuard）。
 *
 * 黏在 sheet 內容頂端、出現時把焦點移到「繼續填寫」，螢幕閱讀器以 role="alert" 宣告。
 * 刻意不用 ConfirmDialog：在 sheet 上再疊一層 AppModal，關閉時會把 sheet 底下的頁面
 * 解除捲動鎖定。
 */
import { nextTick, onMounted, ref } from 'vue'

withDefaults(defineProps<{
  message?: string
}>(), {
  message: '還沒送出，要放棄剛剛填的內容嗎？',
})

const emit = defineEmits<{
  keep: []
  discard: []
}>()

const keepBtn = ref<HTMLButtonElement | null>(null)

onMounted(async () => {
  await nextTick()
  keepBtn.value?.focus()
})
</script>

<template>
  <div class="discard-prompt" role="alert" data-testid="discard-prompt">
    <p class="discard-prompt__text">{{ message }}</p>
    <div class="discard-prompt__actions">
      <button
        ref="keepBtn"
        type="button"
        class="discard-prompt__btn"
        data-testid="discard-keep"
        @click="emit('keep')"
      >繼續填寫</button>
      <button
        type="button"
        class="discard-prompt__btn is-danger"
        data-testid="discard-confirm"
        @click="emit('discard')"
      >放棄</button>
    </div>
  </div>
</template>

<style scoped>
.discard-prompt {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  border-radius: var(--radius-md, 8px);
  background: var(--color-warning-soft);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.discard-prompt__text { margin: 0; font-weight: 600; }
.discard-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
}
.discard-prompt__btn {
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-4, 16px);
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-weight: 600;
}
.discard-prompt__btn.is-danger {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-primary-contrast);
}
</style>
