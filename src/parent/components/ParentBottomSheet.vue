<script setup lang="ts">
/**
 * 家長端底部彈窗（snap points 進階版）。
 *
 * 功能：
 *  - 三段 snap：peek (30) / mid (60) / full (92) 視窗高百分比；`setSnap()` 可程式化切換。
 *    支援 dvh 的瀏覽器用 dvh（LINE／Safari 網址列伸縮時不會把面板底部推出畫面），
 *    其餘退回 vh
 *  - 拖曳手勢：drag-to-dismiss、速度判定（>600 px/s 視為快滑）、距離判定（>60px 切段、<30px 回彈）
 *  - keyboard 模式：visualViewport 縮小 > 100px 時自動切 full 並鎖拖曳，鍵盤收回時解鎖
 *  - a11y：role="dialog"、aria-modal、aria-labelledby、focus trap、ESC 關閉、開啟時自動 focus 第一個可 focus 元素、關閉時還原焦點
 *  - 拖曳把手：snap 點 ≥2 時是可操作的按鈕（點按／Enter／Space 放大一段、到頂再縮回；↑↓ 逐段），
 *    提供拖曳以外的單指與鍵盤替代（WCAG 2.5.7）；只有一段時純裝飾、對 AT 隱藏
 *  - body scroll lock（開啟時鎖定、關閉/卸載時還原）
 *  - safe-area-inset-bottom 適配；reduced-motion 下停用 transition/transform 動畫
 *  - 視覺：--pt-elev-3 + --pt-hairline + --pt-scrim
 *
 * Props：
 *  - modelValue / title / snapPoints / defaultSnap / dismissible / showHandle
 *  - beforeClose：使用者關閉（點背景／ESC／下拉）前呼叫，回傳 false 則不關
 *    （表單有未送出的修改時改顯示放棄確認，見 composables/useUnsavedGuard）
 *
 * Emits：
 *  - update:modelValue / close / snap-change
 *
 * Exposed：
 *  - setSnap(snap)：切換 snap point
 *  - isDraggingForTest：測試用 ref（內部 isDragging 別名，僅用於單元測試）
 *
 * 使用：
 *   <ParentBottomSheet v-model="show" title="收據明細" :snap-points="['mid','full']" default-snap="mid">
 *     <template #header>...</template>
 *     <p>內容</p>
 *     <template #footer><button>送出</button></template>
 *   </ParentBottomSheet>
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'

type SnapPoint = 'peek' | 'mid' | 'full'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  title?: string
  snapPoints?: SnapPoint[]
  defaultSnap?: SnapPoint
  dismissible?: boolean
  showHandle?: boolean
  beforeClose?: () => boolean
}>(), {
  modelValue: false,
  title: '',
  snapPoints: () => ['mid', 'full'],
  defaultSnap: 'mid',
  dismissible: true,
  showHandle: true,
  beforeClose: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'close': []
  'snap-change': [snap: SnapPoint]
}>()

const slots = useSlots()
const dialogRef = ref<HTMLElement | null>(null)
const previouslyFocused = ref<Element | null>(null)
const headerId = `pt-bsheet-${Math.random().toString(36).slice(2, 9)}`

/** 各 snap 佔視窗高的百分比；CSS 同時拿 vh（fallback）與 dvh 兩種單位 */
const SNAP_RATIO: Record<SnapPoint, number> = { peek: 30, mid: 60, full: 92 }
// SNAP_ORDER 由上至下：full（最高）→ mid → peek（最低）。
// 「向下吸附」= index + 1（變矮）；「向上吸附」= index - 1（變高）。
const SNAP_ORDER: SnapPoint[] = ['full', 'mid', 'peek']
const currentSnap = ref<SnapPoint>(props.defaultSnap)

function setSnap(snap: SnapPoint): void {
  if (!props.snapPoints.includes(snap)) return
  currentSnap.value = snap
  emit('snap-change', snap)
}

// ---------- drag gesture ----------
const dragStartY = ref<number>(0)
const dragStartTime = ref<number>(0)
const dragOffset = ref<number>(0)
const isDragging = ref<boolean>(false)

function onDragStart(e: PointerEvent): void {
  if (keyboardLocked.value) return
  isDragging.value = true
  dragStartY.value = e.clientY
  dragStartTime.value = Date.now()
  dragOffset.value = 0
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd, { once: true })
  window.addEventListener('pointercancel', onDragEnd, { once: true })
}

function onDragMove(e: PointerEvent): void {
  if (!isDragging.value) return
  // 上限 -200px：避免拖太上方造成不自然的飛離
  dragOffset.value = Math.max(-200, e.clientY - dragStartY.value)
}

function onDragEnd(e: PointerEvent): void {
  window.removeEventListener('pointermove', onDragMove)
  if (!isDragging.value) return
  const delta = e.clientY - dragStartY.value
  const elapsed = Math.max(1, Date.now() - dragStartTime.value)
  const velocity = (delta / elapsed) * 1000 // px/s（正值=向下、負值=向上）
  isDragging.value = false
  dragOffset.value = 0

  const enabled = enabledSnaps.value
  const currentIdx = enabled.indexOf(currentSnap.value)

  // 距離不足直接回彈，避免短促觸控被誤判為高速滑動（合成事件下 elapsed≈1ms 會撐出極大 velocity）。
  // 短促觸控交給隨後的 click（onHandleClick）當「點按切換」處理。
  if (Math.abs(delta) < 30) return // 回彈（不切 snap）
  suppressHandleClick = true

  // 速度判定（>600 px/s 視為快滑）
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
  // 距離判定
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

// ---------- handle：點按／鍵盤切換 snap（拖曳的替代操作） ----------
const enabledSnaps = computed<SnapPoint[]>(() => SNAP_ORDER.filter((s) => props.snapPoints.includes(s)))
const canResize = computed<boolean>(() => enabledSnaps.value.length > 1)
const isTallest = computed<boolean>(() => enabledSnaps.value[0] === currentSnap.value)
const handleLabel = computed<string>(() => (isTallest.value ? '縮小面板' : '放大面板'))
// 真的拖過（≥ 回彈門檻）之後，同一次手勢在把手上收尾還會補發 click，要吃掉以免雙重切換
let suppressHandleClick = false

function stepSnap(direction: 'up' | 'down'): void {
  const enabled = enabledSnaps.value
  const idx = enabled.indexOf(currentSnap.value)
  const next = direction === 'up' ? Math.max(0, idx - 1) : Math.min(enabled.length - 1, idx + 1)
  if (next !== idx) setSnap(enabled[next])
}

function toggleSnap(): void {
  if (!canResize.value || keyboardLocked.value) return
  const enabled = enabledSnaps.value
  if (isTallest.value) setSnap(enabled[enabled.length - 1])
  else stepSnap('up')
}

function onHandleClick(): void {
  if (suppressHandleClick) {
    suppressHandleClick = false
    return
  }
  toggleSnap()
}

function onHandleKeydown(e: KeyboardEvent): void {
  if (!canResize.value || keyboardLocked.value) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleSnap()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    stepSnap('up')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    stepSnap('down')
  }
}

const dialogTransform = computed<string>(() =>
  isDragging.value ? `translateY(${dragOffset.value}px)` : '',
)

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) currentSnap.value = props.defaultSnap
  },
  { flush: 'pre' },
)

const snapHeight = computed<string>(() => `${SNAP_RATIO[currentSnap.value]}vh`)
const snapHeightDvh = computed<string>(() => `${SNAP_RATIO[currentSnap.value]}dvh`)

// ---------- keyboard mode (visualViewport) ----------
// 行動裝置鍵盤彈出時 visualViewport.height 會縮小；超過 100px 視為鍵盤開啟，
// 自動切到 full（避免輸入框被鍵盤遮住）並鎖拖曳；鍵盤收回時解鎖（snap 不還原）。
const keyboardLocked = ref<boolean>(false)
const initialVVHeight = ref<number>(0)

function onVVResize(): void {
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

function close(): void {
  if (props.beforeClose && props.beforeClose() === false) return
  emit('update:modelValue', false)
  emit('close')
}

function getFocusableElements(): HTMLElement[] {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function trapFocus(e: KeyboardEvent): void {
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

// A6 第一階段：body scroll lock 抽到 useBodyLock composable，與 TeacherBottomSheet 共用。
import { useBodyLock } from '@/composables/useBodyLock'
const { lock: lockBody, unlock: unlockBody } = useBodyLock()

function onKeydown(e: KeyboardEvent): void {
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
      // 初始焦點落在內容的第一個可聚焦元素；把手雖在 tab 循環內，但不是開啟後要先操作的東西
      const first = getFocusableElements().find((el) => !el.classList.contains('pt-bsheet-handle'))
      if (first) first.focus()
      else dialogRef.value?.focus()
    } else {
      unlockBody()
      const prev = previouslyFocused.value as HTMLElement | null
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
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

const hasFooterSlot = computed<boolean>(() => !!slots.footer)
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
            '--pt-bsheet-h-dvh': snapHeightDvh,
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
            v-if="showHandle && canResize"
            class="pt-bsheet-handle"
            role="button"
            tabindex="0"
            :aria-label="handleLabel"
            @pointerdown="onDragStart"
            @click="onHandleClick"
            @keydown="onHandleKeydown"
          />
          <div
            v-else-if="showHandle"
            class="pt-bsheet-handle"
            aria-hidden="true"
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
/* P2.3 token sweep：所有色值已 token 化（scrim/surface fallback hex 保留） */
/* P3.1 M3 visual refactor：圓角/shadow/bg/scrim/easing 套 M3 tokens */
.pt-bsheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop, 90);
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.pt-bsheet-dialog {
  background: var(--m3-surface-container-low, #fff);
  border: var(--pt-hairline);
  border-radius: var(--pt-hero-radius, 30px) var(--pt-hero-radius, 30px) 0 0;
  box-shadow: var(--pt-shadow-float);
  width: 100%;
  max-width: 640px;
  height: var(--pt-bsheet-h, 60vh);
  max-height: 92vh; /* 硬上限：防止 snap 值被覆寫成異常值時撐破畫面 */
  transition: height var(--motion-page, 350ms) var(--motion-emphasized, cubic-bezier(0.05, 0.7, 0.1, 1));
  display: flex;
  flex-direction: column;
  outline: none;
  padding-bottom: env(safe-area-inset-bottom, 0);
  overscroll-behavior: contain;
}
/* dvh：行動瀏覽器網址列／LIFF 工具列伸縮時 vh 不跟著變，92vh 的面板底部（含送出鈕）
   會被推到可視區外。var() 裡放 dvh 在不支援的瀏覽器會整條宣告失效（不會退回上一條），
   所以用 @supports 分流，而不是連寫兩條 height。 */
@supports (height: 1dvh) {
  .pt-bsheet-dialog {
    height: var(--pt-bsheet-h-dvh, 60dvh);
    max-height: 92dvh;
  }
}

/* 把手本體是 64×24 的透明觸控區，36×4 的視覺橫條畫在 ::before；::after 再把命中區
   上下撐到 --touch-target-min。橫條用 --m3-outline：非文字元件需 ≥3:1 才辨識得出
   （outline-variant 對 surface-container-low 只有約 1.6:1，舊的 --pt-surface-mute 幾乎 1:1）。 */
.pt-bsheet-handle {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 24px;
  margin: 0 auto;
  border-radius: var(--radius-sm, 6px);
  cursor: grab;
  touch-action: none;
}
.pt-bsheet-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--m3-outline, #717971);
  transform: translate(-50%, -50%);
}
.pt-bsheet-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: var(--touch-target-min, 44px);
  transform: translateY(-50%);
}

.pt-bsheet-header { padding: 8px 16px 4px; }
.pt-bsheet-title { font-size: 1.0625rem; font-weight: 600; margin: 0; }
.pt-bsheet-body { padding: 12px 16px; overflow-y: auto; flex: 1; }
.pt-bsheet-footer { padding: 12px 16px; border-top: var(--pt-hairline); }

.pt-bsheet-enter-active,
.pt-bsheet-leave-active {
  transition: opacity 0.2s ease;
}
.pt-bsheet-enter-active .pt-bsheet-dialog,
.pt-bsheet-leave-active .pt-bsheet-dialog {
  transition: transform var(--motion-page, 350ms) var(--motion-emphasized, cubic-bezier(0.05, 0.7, 0.1, 1));
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
