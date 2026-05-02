<script setup>
/**
 * 家長端底部彈窗（snap points 進階版）。
 *
 * 提供（drag/keyboard 在 Task 1.6/1.7 接續，本檔先建好 snap 與無障礙基底）：
 *  - 三段 snap：peek (30vh) / mid (60vh) / full (92vh)
 *  - drag-to-dismiss 與慣性吸附
 *  - keyboard 開啟時自動切 full + 鎖拖曳（避輸入框被遮）
 *  - role="dialog"、focus trap、ESC 關閉、body scroll lock
 *  - safe-area-inset-bottom
 *  - 視覺：--pt-elev-3 + --pt-hairline + --pt-scrim + --pt-backdrop-blur
 *
 * 使用：
 *   <ParentBottomSheet v-model="show" title="收據明細" :snap-points="['mid','full']" default-snap="mid">
 *     <template #header>...</template>
 *     <p>內容</p>
 *     <template #footer><button>送出</button></template>
 *   </ParentBottomSheet>
 */
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  snapPoints: {
    type: Array,
    default: () => ['mid', 'full'],
    validator: (arr) => arr.every((s) => ['peek', 'mid', 'full'].includes(s)),
  },
  defaultSnap: {
    type: String,
    default: 'mid',
    validator: (v) => ['peek', 'mid', 'full'].includes(v),
  },
  dismissible: { type: Boolean, default: true },
  showHandle: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'close', 'snap-change'])

const slots = useSlots()
const dialogRef = ref(null)
const previouslyFocused = ref(null)
const headerId = `pt-bsheet-${Math.random().toString(36).slice(2, 9)}`

const SNAP_HEIGHT = { peek: '30vh', mid: '60vh', full: '92vh' }
const currentSnap = ref(props.defaultSnap)

function setSnap(snap) {
  if (!props.snapPoints.includes(snap)) return
  currentSnap.value = snap
  emit('snap-change', snap)
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) currentSnap.value = props.defaultSnap
  },
  { flush: 'pre' },
)

const snapHeight = computed(() => SNAP_HEIGHT[currentSnap.value])

defineExpose({ setSnap })

function close() {
  emit('update:modelValue', false)
  emit('close')
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

function lockBody() { document.body.style.overflow = 'hidden' }
function unlockBody() { document.body.style.overflow = '' }

function onKeydown(e) {
  if (e.key === 'Escape' && props.dismissible) {
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'Tab') trapFocus(e)
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused.value = document.activeElement
      lockBody()
      await nextTick()
      const focusable = getFocusableElements()
      if (focusable.length > 0) focusable[0].focus()
      else dialogRef.value?.focus()
    } else {
      unlockBody()
      if (previouslyFocused.value && typeof previouslyFocused.value.focus === 'function') {
        previouslyFocused.value.focus()
      }
    }
  },
)

onBeforeUnmount(() => unlockBody())

const hasHeaderSlot = computed(() => !!slots.header)
const hasFooterSlot = computed(() => !!slots.footer)
</script>

<template>
  <Teleport to="body">
    <Transition name="pt-bsheet">
      <div
        v-if="modelValue"
        class="pt-bsheet-overlay"
        @click.self="dismissible && close()"
      >
        <div
          ref="dialogRef"
          class="pt-bsheet-dialog"
          :style="{ '--pt-bsheet-h': snapHeight }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headerId"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <div v-if="showHandle" class="pt-bsheet-handle" aria-hidden="true" />

          <div :id="headerId" class="pt-bsheet-header">
            <slot name="header">
              <h2 class="pt-bsheet-title">{{ title }}</h2>
            </slot>
          </div>

          <div class="pt-bsheet-body">
            <slot />
          </div>

          <div v-if="hasFooterSlot" class="pt-bsheet-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pt-bsheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop, 90);
  background: var(--pt-scrim, rgba(15, 23, 42, 0.45));
  -webkit-backdrop-filter: blur(var(--pt-backdrop-blur, 8px));
  backdrop-filter: blur(var(--pt-backdrop-blur, 8px));
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.pt-bsheet-dialog {
  background: var(--pt-surface-card, #fff);
  border: var(--pt-hairline);
  border-radius: 16px 16px 0 0;
  box-shadow: var(--pt-elev-3);
  width: 100%;
  max-width: 640px;
  height: var(--pt-bsheet-h, 60vh);
  max-height: 92vh; /* 硬上限：防止 snap 值被覆寫成異常值時撐破畫面 */
  transition: height 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  display: flex;
  flex-direction: column;
  outline: none;
  padding-bottom: env(safe-area-inset-bottom, 0);
  overscroll-behavior: contain;
}

.pt-bsheet-handle {
  width: 36px;
  height: 4px;
  background: var(--pt-surface-mute, #e5e7eb);
  border-radius: 2px;
  margin: 8px auto 4px;
}

.pt-bsheet-header { padding: 8px 16px 4px; }
.pt-bsheet-title { font-size: 17px; font-weight: 600; margin: 0; }
.pt-bsheet-body { padding: 12px 16px; overflow-y: auto; flex: 1; }
.pt-bsheet-footer { padding: 12px 16px; border-top: var(--pt-hairline); }

.pt-bsheet-enter-active,
.pt-bsheet-leave-active {
  transition: opacity 0.2s ease;
}
.pt-bsheet-enter-active .pt-bsheet-dialog,
.pt-bsheet-leave-active .pt-bsheet-dialog {
  transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
.pt-bsheet-enter-from, .pt-bsheet-leave-to { opacity: 0; }
.pt-bsheet-enter-from .pt-bsheet-dialog,
.pt-bsheet-leave-to .pt-bsheet-dialog { transform: translateY(100%); }

@media (prefers-reduced-motion: reduce) {
  .pt-bsheet-dialog,
  .pt-bsheet-enter-active,
  .pt-bsheet-leave-active,
  .pt-bsheet-enter-active .pt-bsheet-dialog,
  .pt-bsheet-leave-active .pt-bsheet-dialog { transition: none; }
  .pt-bsheet-enter-from .pt-bsheet-dialog,
  .pt-bsheet-leave-to .pt-bsheet-dialog { transform: none; }
}
</style>
