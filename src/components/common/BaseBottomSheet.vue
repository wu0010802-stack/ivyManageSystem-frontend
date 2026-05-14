<script setup>
/**
 * 共用底部彈窗（cross-app）。
 *
 * 為什麼存在：portal 的 TeacherBottomSheet (364 行) 與 parent 的 ParentBottomSheet (391 行)
 * 邏輯 95% 重複——snap、drag、focus trap、keyboard 模式、scroll lock、a11y 都一樣。
 * 本檔抽出共用骨架，兩端只需薄包一層（注入 theme 與 selector class）。
 *
 * 功能：
 *  - 三段 snap：peek (30vh) / mid (60vh) / full (92vh)
 *  - 拖曳手勢：drag-to-dismiss、>600 px/s 快滑、>60px 切段、<30px 回彈
 *  - keyboard 模式：visualViewport 縮小 > 100px 自動切 full 並鎖拖曳
 *  - a11y：role="dialog"、aria-modal、focus trap、ESC 關閉、restore focus
 *  - body scroll lock（reference-counted，支援多層 sheet 同時開）
 *  - safe-area-inset-bottom 適配；reduced-motion 降階
 *
 * Theme：透過 CSS custom property 注入。兩端各自 root 定義 `--pt-scrim`、
 * `--pt-surface-card`、`--pt-hairline`、`--pt-elev-3`、`--pt-backdrop-blur`、
 * `--pt-surface-mute`。內建 fallback 值保證在 token 缺失時不爆。
 *
 * Props / Emits / Exposed 與舊兩端完全相同——這是「extract base，保留 API」式重構，
 * 兩端的呼叫站點不需要改 prop。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'

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
// SNAP_ORDER 由上至下：full（最高）→ mid → peek（最低）。
// 「向下吸附」= index + 1（變矮）；「向上吸附」= index - 1（變高）。
const SNAP_ORDER = ['full', 'mid', 'peek']
const currentSnap = ref(props.defaultSnap)

function setSnap(snap) {
  if (!props.snapPoints.includes(snap)) return
  currentSnap.value = snap
  emit('snap-change', snap)
}

// ---------- drag gesture ----------
const dragStartY = ref(0)
const dragStartTime = ref(0)
const dragOffset = ref(0)
const isDragging = ref(false)

function onDragStart(e) {
  if (keyboardLocked.value) return
  isDragging.value = true
  dragStartY.value = e.clientY
  dragStartTime.value = Date.now()
  dragOffset.value = 0
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd, { once: true })
  window.addEventListener('pointercancel', onDragEnd, { once: true })
}

function onDragMove(e) {
  if (!isDragging.value) return
  // 上限 -200px：避免拖太上方造成不自然的飛離
  dragOffset.value = Math.max(-200, e.clientY - dragStartY.value)
}

function onDragEnd(e) {
  window.removeEventListener('pointermove', onDragMove)
  if (!isDragging.value) return
  const delta = e.clientY - dragStartY.value
  const elapsed = Math.max(1, Date.now() - dragStartTime.value)
  const velocity = (delta / elapsed) * 1000 // px/s（正值=向下、負值=向上）
  isDragging.value = false
  dragOffset.value = 0

  const enabled = SNAP_ORDER.filter((s) => props.snapPoints.includes(s))
  const currentIdx = enabled.indexOf(currentSnap.value)

  // 距離不足直接回彈，避免短促觸控被誤判為高速滑動（合成事件下 elapsed≈1ms 會撐出極大 velocity）
  if (Math.abs(delta) < 30) return // 回彈（不切 snap）

  if (velocity > 600) {
    if (currentSnap.value === enabled[enabled.length - 1]) {
      if (props.dismissible) close()
    } else {
      setSnap(enabled[Math.min(enabled.length - 1, currentIdx + 1)])
    }
    return
  }
  if (velocity < -600) {
    setSnap(enabled[Math.max(0, currentIdx - 1)])
    return
  }
  if (delta > 100 && currentSnap.value === 'peek' && props.dismissible) {
    close()
    return
  }
  if (delta > 60) {
    setSnap(enabled[Math.min(enabled.length - 1, currentIdx + 1)])
  } else if (delta < -60) {
    setSnap(enabled[Math.max(0, currentIdx - 1)])
  }
}

const dialogTransform = computed(() =>
  isDragging.value ? `translateY(${dragOffset.value}px)` : '',
)

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) currentSnap.value = props.defaultSnap
  },
  { flush: 'pre' },
)

const snapHeight = computed(() => SNAP_HEIGHT[currentSnap.value])

// ---------- keyboard mode (visualViewport) ----------
const keyboardLocked = ref(false)
const initialVVHeight = ref(0)

function onVVResize() {
  if (typeof window === 'undefined' || !window.visualViewport) return
  const delta = initialVVHeight.value - window.visualViewport.height
  if (delta > 100) {
    if (!keyboardLocked.value) {
      keyboardLocked.value = true
      currentSnap.value = 'full'
    }
  } else {
    keyboardLocked.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    initialVVHeight.value = window.visualViewport.height
    window.visualViewport.addEventListener('resize', onVVResize)
  }
})

defineExpose({ setSnap, isDraggingForTest: isDragging })

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
  ).filter((el) => !el.classList.contains('pt-bsheet-handle'))
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

// 多個 sheet/Modal 同時開啟時須用參考計數，避免內層關閉就把 body 整個解鎖
// 而外層仍開但背景可滾動。記在 window 上才能跨多個 component 實例共享。
const _BODY_LOCK_KEY = '__pt_bsheet_lock_count__'
const _BODY_LOCK_PREV_KEY = '__pt_bsheet_prev_overflow__'
let _ownsLock = false
function lockBody() {
  if (_ownsLock) return
  if (typeof window === 'undefined') return
  const cur = window[_BODY_LOCK_KEY] || 0
  if (cur === 0) {
    window[_BODY_LOCK_PREV_KEY] = document.body.style.overflow || ''
    document.body.style.overflow = 'hidden'
  }
  window[_BODY_LOCK_KEY] = cur + 1
  _ownsLock = true
}
function unlockBody() {
  if (!_ownsLock) return
  if (typeof window === 'undefined') return
  const cur = window[_BODY_LOCK_KEY] || 0
  const next = Math.max(0, cur - 1)
  window[_BODY_LOCK_KEY] = next
  if (next === 0) {
    document.body.style.overflow = window[_BODY_LOCK_PREV_KEY] || ''
    window[_BODY_LOCK_PREV_KEY] = ''
  }
  _ownsLock = false
}

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

onBeforeUnmount(() => {
  unlockBody()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onVVResize)
  }
})

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
          :style="{
            '--pt-bsheet-h': snapHeight,
            transform: dialogTransform,
            transition: isDragging ? 'none' : undefined,
          }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headerId"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <div
            v-if="showHandle"
            class="pt-bsheet-handle"
            role="button"
            tabindex="0"
            aria-label="拖曳調整高度"
            @pointerdown="onDragStart"
          />

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
  background: var(--pt-scrim, var(--overlay-medium, rgba(15, 23, 42, 0.45)));
  -webkit-backdrop-filter: blur(var(--pt-backdrop-blur, var(--backdrop-blur, 8px)));
  backdrop-filter: blur(var(--pt-backdrop-blur, var(--backdrop-blur, 8px)));
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.pt-bsheet-dialog {
  background: var(--pt-surface-card, #fff);
  border: var(--pt-hairline, 1px solid rgba(15, 23, 42, 0.06));
  border-radius: 16px 16px 0 0;
  box-shadow: var(--pt-elev-3, 0 8px 16px rgba(15, 23, 42, 0.08), 0 16px 32px rgba(15, 23, 42, 0.12));
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
.pt-bsheet-footer { padding: 12px 16px; border-top: var(--pt-hairline, 1px solid rgba(15, 23, 42, 0.06)); }

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
