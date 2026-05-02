<script setup>
/**
 * 家長 App 共用 Modal 元件。
 *
 * 提供：
 *  - role="dialog" + aria-modal="true" + aria-labelledby（screen reader 支援）
 *  - Focus trap：Tab 不會跑出 modal
 *  - 開啟時把焦點移到 modal、關閉後還原焦點
 *  - Esc 鍵關閉（可關）
 *  - Body scroll lock
 *  - Click overlay 關閉（可關）
 *  - prefers-reduced-motion 友善
 *
 * 不提供：
 *  - 預設按鈕 / 標題樣式（由 caller 自填）。需要按鈕的場景用 ConfirmDialog。
 *
 * 使用：
 *   <AppModal v-model:open="show" labelled-by="my-title">
 *     <h2 id="my-title">標題</h2>
 *     <p>內容</p>
 *   </AppModal>
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** modal 標題的 id，用來連結 aria-labelledby（無障礙必填） */
  labelledBy: { type: String, default: null },
  /** modal 描述的 id，用來連結 aria-describedby（可選） */
  describedBy: { type: String, default: null },
  /** 點背景關閉 */
  closeOnOverlay: { type: Boolean, default: true },
  /** Esc 關閉 */
  closeOnEscape: { type: Boolean, default: true },
  /** 自訂寬度上限 */
  maxWidth: { type: String, default: '420px' },
})

const emit = defineEmits(['update:open', 'close'])

const dialogRef = ref(null)
const previouslyFocused = ref(null)

function close() {
  emit('update:open', false)
  emit('close')
}

function onOverlayClick(e) {
  if (!props.closeOnOverlay) return
  if (e.target === e.currentTarget) close()
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.closeOnEscape) {
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'Tab') {
    trapFocus(e)
  }
}

function getFocusableElements() {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function trapFocus(e) {
  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    e.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function lockBody() {
  document.body.style.overflow = 'hidden'
}

function unlockBody() {
  document.body.style.overflow = ''
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused.value = document.activeElement
      lockBody()
      await nextTick()
      // 把焦點移進 modal
      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0].focus()
      } else if (dialogRef.value) {
        dialogRef.value.focus()
      }
    } else {
      unlockBody()
      // 還原焦點到開啟者
      if (previouslyFocused.value && typeof previouslyFocused.value.focus === 'function') {
        previouslyFocused.value.focus()
      }
    }
  },
  { immediate: false },
)

onBeforeUnmount(() => {
  // 防止關閉前 unmount 鎖死 body
  unlockBody()
})

const overlayStyle = computed(() => ({
  zIndex: 'var(--z-modal-backdrop, 90)',
}))

const dialogStyle = computed(() => ({
  maxWidth: props.maxWidth,
  zIndex: 'var(--z-modal, 100)',
}))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="modal-overlay"
        :style="overlayStyle"
        @click="onOverlayClick"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="modal-dialog"
          :style="dialogStyle"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :aria-describedby="describedBy"
          tabindex="-1"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4, 16px);
  /* iOS Safari env() */
  padding-top: max(var(--space-4, 16px), env(safe-area-inset-top, 0));
  padding-bottom: max(var(--space-4, 16px), env(safe-area-inset-bottom, 0));
}

.modal-dialog {
  background: var(--neutral-0, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,.1));
  width: 100%;
  max-height: calc(100dvh - var(--space-8, 32px));
  overflow-y: auto;
  outline: none;
}

/* ===== 進場動畫 ===== */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity var(--transition-base, 0.2s ease);
}
.modal-fade-enter-active .modal-dialog,
.modal-fade-leave-active .modal-dialog {
  transition: transform var(--transition-base, 0.2s ease), opacity var(--transition-base, 0.2s ease);
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-from .modal-dialog,
.modal-fade-leave-to .modal-dialog {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .modal-fade-enter-active,
  .modal-fade-leave-active,
  .modal-fade-enter-active .modal-dialog,
  .modal-fade-leave-active .modal-dialog {
    transition: none;
  }
  .modal-fade-enter-from .modal-dialog,
  .modal-fade-leave-to .modal-dialog {
    transform: none;
  }
}
</style>
