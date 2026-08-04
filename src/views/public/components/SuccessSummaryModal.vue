<script setup lang="ts">
/**
 * A1-P5：從 ActivityPublicView 抽出的「報名成功」摘要 modal。
 *
 * 2026-07-12 UI 改版：
 * - 資訊架構重排：查詢碼區提前為第一主角（家長唯一會遺失的資訊），報名內容收斂成單一收據區。
 * - 軟性保存守門：未複製過查詢碼/連結時主 CTA 為次要樣式，第一次點擊只顯示提醒；
 *   複製任一項後轉主色、點擊直接關閉。右上關閉鈕與 ESC 不守門（dialog 慣例）。
 * - success modal 專屬樣式自 ActivityPublicView 兩份樣式收斂至本檔 scoped；
 *   共用的 modal-overlay/panel/header/close/btn 仍由母檔非 scoped 規則提供。
 * - 手機（≤600px）改 bottom-sheet：底部滑出、上緣圓角、CTA 吸底不隨內容滾動。
 *
 * Summary 物件由 parent 維護(reactive),child 直接 mutate summary.copyHint 顯示複製
 * 結果(預期行為,Vue 3 reactive object cross-component mutation OK)。
 *
 * Props:
 *   summary: { visible, message, studentName, parentPhone,
 *              selectedCourses, selectedSupplies, totalAmount,
 *              queryToken, editUrl, copyHint, email? } — reactive
 * Emits:
 *   close
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'

// waitlisted＝送出當下名額快照判定為候補（parent buildSuccessSummary 標註）；
// 候補課顯示徽章並排除於 totalAmount 外，與費用預估的「候補不收費」口徑一致
interface CourseItem { name: string; price: number; waitlisted?: boolean }
interface Summary {
  visible: boolean
  message: string
  studentName: string
  parentPhone: string
  selectedCourses: CourseItem[]
  selectedSupplies: CourseItem[]
  totalAmount: number
  queryToken: string
  editUrl: string
  copyHint: string
  // 家長輸入的通知信箱（來源＝本地 form 值，非 API response）；有值才顯示提示行
  email?: string
}

const props = defineProps<{
  summary: Summary
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'reapply'): void
}>()
const dialogRef = ref<HTMLElement | null>(null)

const { onDialogKeydown } = useAccessibleDialog({
  open: () => props.summary.visible,
  dialogRef,
  close: () => emit('close'),
})

function fmtAmount(n: number) {
  return `$${n.toLocaleString('en-US')}`
}

const hasWaitlistedCourse = computed(() =>
  props.summary.selectedCourses.some((c) => c.waitlisted),
)

// 軟性保存守門狀態（僅存在於本元件，不進 summary 物件）
const copiedKey = ref<'' | 'token' | 'link'>('')
const hasCopiedAny = ref(false)
const nudgeVisible = ref(false)
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null
let hintResetTimer: ReturnType<typeof setTimeout> | null = null

function clearCopyTimers() {
  if (copiedResetTimer !== null) clearTimeout(copiedResetTimer)
  if (hintResetTimer !== null) clearTimeout(hintResetTimer)
  copiedResetTimer = null
  hintResetTimer = null
}

function resetCopyState() {
  clearCopyTimers()
  copiedKey.value = ''
  hasCopiedAny.value = false
  nudgeVisible.value = false
  props.summary.copyHint = ''
}

watch(
  [() => props.summary.visible, () => props.summary.queryToken],
  ([visible, queryToken], [wasVisible, previousQueryToken]) => {
    if (visible && (!wasVisible || queryToken !== previousQueryToken)) {
      resetCopyState()
    }
  },
)

async function copyToClipboard(text: string, label: string, key: 'token' | 'link') {
  clearCopyTimers()
  try {
    await navigator.clipboard.writeText(text)
    hasCopiedAny.value = true
    nudgeVisible.value = false
    copiedKey.value = key
    copiedResetTimer = setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
      copiedResetTimer = null
    }, 2000)
    props.summary.copyHint = `已複製${label}`
    hintResetTimer = setTimeout(() => {
      props.summary.copyHint = ''
      hintResetTimer = null
    }, 2500)
  } catch {
    props.summary.copyHint = '複製失敗，請手動長按文字選取'
    hintResetTimer = setTimeout(() => {
      props.summary.copyHint = ''
      hintResetTimer = null
    }, 4000)
  }
}

onUnmounted(clearCopyTimers)

/**
 * 離開本畫面的共同守門：有查詢碼卻沒複製過時，第一次點擊只提醒，第二次
 * （或複製後）才放行。「幫另一位寶貝報名」同樣是離開路徑——它一走，這組
 * 查詢碼就再也回不來（三欄查詢只能檢視），故與「完成」吃同一道閘。
 */
function requestExit(proceed: () => void) {
  if (props.summary.queryToken && !hasCopiedAny.value && !nudgeVisible.value) {
    nudgeVisible.value = true
    return
  }
  proceed()
}

function handleDone() {
  requestExit(() => emit('close'))
}

function handleReapply() {
  requestExit(() => emit('reapply'))
}

// 2026-07-08 業主指示：暫時停用「分享給家人」按鈕（Web Share API）。
// 恢復時把下方註解與 template 內對應區塊一起打開，並補回 `import { computed } from 'vue'`。
// const canShare = computed(
//   () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
// )
//
// async function shareToken() {
//   if (!canShare.value) return
//   try {
//     await navigator.share({
//       title: '才藝報名查詢碼',
//       text:
//         `查詢碼：${props.summary.queryToken}\n編修連結：${props.summary.editUrl}\n` +
//         '（請勿轉傳給校外人士，僅供家人留存）',
//       url: props.summary.editUrl,
//     })
//   } catch (err) {
//     // 使用者取消分享屬正常流程,不顯示錯誤
//     if (err && (err as { name?: string }).name !== 'AbortError') {
//       props.summary.copyHint = '分享失敗，請改用複製按鈕'
//       setTimeout(() => { props.summary.copyHint = '' }, 4000)
//     }
//   }
// }
</script>

<template>
  <div
    v-if="summary.visible"
    class="modal-overlay is-visible"
  >
    <div
      ref="dialogRef"
      class="modal-panel modal-panel--success"
      role="dialog"
      aria-modal="true"
      aria-labelledby="successModalTitle"
      aria-describedby="successModalDescription"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <div class="modal-header">
        <h3 id="successModalTitle" class="modal-title">
          <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-check" /></svg>
          報名資料已送出
        </h3>
        <button type="button" class="modal-close tap-target" aria-label="關閉視窗" @click="$emit('close')">
          <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <p id="successModalDescription" class="success-subtitle">{{ summary.message }}</p>

        <section v-if="summary.queryToken" class="success-token-box" aria-labelledby="successTokenTitle">
          <h4 id="successTokenTitle" class="token-title">查詢 / 編修專用連結</h4>
          <p class="token-hint">請保存查詢碼：之後查詢或修改報名皆需以查詢碼＋家長手機進行。</p>
          <div class="token-field">
            <label class="token-label" for="successQueryToken">查詢碼</label>
            <div class="token-control">
              <input
                id="successQueryToken"
                class="token-input"
                type="text"
                readonly
                :value="summary.queryToken"
                @focus="($event.target as HTMLInputElement | null)?.select()"
              />
              <button
                type="button"
                class="btn-copy"
                :class="{ 'is-copied': copiedKey === 'token' }"
                aria-label="複製查詢碼"
                @click="copyToClipboard(summary.queryToken, '查詢碼', 'token')"
              >
                <svg width="14" height="14" aria-hidden="true"><use :href="copiedKey === 'token' ? '#i-check' : '#i-copy'" /></svg>
                {{ copiedKey === 'token' ? '已複製' : '複製' }}
              </button>
            </div>
          </div>
          <div class="token-field">
            <label class="token-label" for="successEditUrl">編修連結</label>
            <div class="token-control">
              <input
                id="successEditUrl"
                class="token-input token-input--link"
                type="url"
                readonly
                :value="summary.editUrl"
                @focus="($event.target as HTMLInputElement | null)?.select()"
              />
              <button
                type="button"
                class="btn-copy"
                :class="{ 'is-copied': copiedKey === 'link' }"
                aria-label="複製編修連結"
                @click="copyToClipboard(summary.editUrl, '連結', 'link')"
              >
                <svg width="14" height="14" aria-hidden="true"><use :href="copiedKey === 'link' ? '#i-check' : '#i-copy'" /></svg>
                {{ copiedKey === 'link' ? '已複製' : '複製' }}
              </button>
            </div>
          </div>
          <p class="token-warn">
            <svg width="12" height="12" aria-hidden="true"><use href="#i-alert" /></svg>
            連結含個資識別碼，請勿轉傳他人。
          </p>
          <p class="token-copy-hint" aria-live="polite">{{ summary.copyHint }}</p>
        </section>

        <section class="summary-receipt" aria-label="報名內容摘要">
          <div class="receipt-row"><span class="receipt-label">幼兒姓名</span><span class="receipt-value">{{ summary.studentName }}</span></div>
          <div class="receipt-row"><span class="receipt-label">家長手機</span><span class="receipt-value">{{ summary.parentPhone }}</span></div>

          <div v-if="summary.selectedCourses.length > 0" class="receipt-group">
            <div class="receipt-group-title">本次選擇課程（{{ summary.selectedCourses.length }}）</div>
            <div v-for="c in summary.selectedCourses" :key="`c-${c.name}`" class="receipt-row">
              <span class="receipt-value">
                {{ c.name }}
                <span v-if="c.waitlisted" class="receipt-waitlist-badge">依序候補</span>
              </span>
              <span class="receipt-amount" :class="{ 'is-waitlisted': c.waitlisted }">{{ fmtAmount(c.price) }}</span>
            </div>
          </div>

          <div v-if="summary.selectedSupplies.length > 0" class="receipt-group">
            <div class="receipt-group-title">加購項目</div>
            <div v-for="s in summary.selectedSupplies" :key="`s-${s.name}`" class="receipt-row">
              <span class="receipt-value">{{ s.name }}</span><span class="receipt-amount">{{ fmtAmount(s.price) }}</span>
            </div>
          </div>

          <p v-if="hasWaitlistedCourse" class="receipt-waitlist-note">
            標示「依序候補」的課程（依送出當下名額估計）暫不收費；
            升為正式後校方會另行通知繳費。
          </p>
        </section>

        <p class="summary-final-note">
          錄取／候補與實際應繳金額，以園方確認後通知為準。<template v-if="summary.email">若本次報名資料成功建立，報名資訊將寄至 {{ summary.email }}；未收到請檢查垃圾郵件匣。</template>
        </p>

        <div class="success-cta-bar">
          <p v-if="nudgeVisible" class="close-nudge" role="status">還沒複製查詢碼，建議先複製保存；再點一次即可繼續。</p>
          <button
            type="button"
            class="btn btn-block"
            :class="hasCopiedAny || !summary.queryToken ? 'btn-primary' : 'btn-outline'"
            @click="handleDone"
          >
            {{ summary.queryToken ? '我已保存查詢碼，完成' : '完成' }}
          </button>
          <!-- 兩胎家庭常態：不給接續入口，家長得把同一支手機與信箱重打一遍，
               還要重走三個步驟。手機與 Email 由母頁保留，孩子資料一律重填。 -->
          <button
            type="button"
            class="success-reapply-link tap-target"
            data-test="reapply-button"
            @click="handleReapply"
          >
            幫另一位寶貝報名
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* success modal 專屬樣式（自 ActivityPublicView 收斂至此）。
   modal-overlay / modal-panel / modal-header / modal-close / btn 系列
   仍沿用母檔非 scoped 的 .public-activity-page 共用規則。 */

.modal-panel--success { max-width: 560px; }
.modal-panel--success .modal-title { color: var(--color-success); }

.success-subtitle {
  margin: 0 0 var(--space-4) 0;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
}

/* —— 查詢碼區：本畫面唯一的強調區塊 —— */
.success-token-box {
  margin: 0 0 var(--space-4);
  padding: var(--space-4);
  background: var(--color-primary-soft);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
}
.token-title {
  margin: 0 0 var(--space-1);
  font-size: var(--fs-md);
  font-weight: 700;
  /* 16px/700 不到 WCAG「大型文字」門檻（需 18.66px 粗體），要吃 4.5:1 全標準 */
  color: var(--color-primary-strong);
}
.token-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  line-height: 1.6;
}
.token-field { margin-bottom: var(--space-2); }
.token-label {
  display: block;
  margin-bottom: 4px;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--color-text-subtle);
}
.token-control { display: flex; gap: var(--space-2); }
.token-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 8px 12px;
  font-family: 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  font-size: var(--fs-sm);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
  font-variant-ligatures: none;
  letter-spacing: 0.02em;
  user-select: all;
  -webkit-user-select: all;
}
.token-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(13, 144, 83, 0.2);
}
.token-input--link { font-size: var(--fs-xs); }
.btn-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  min-width: 76px;
  padding: 8px 14px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-primary-contrast);
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}
.btn-copy:hover { background: var(--color-primary-hover); }
.btn-copy:active { transform: scale(0.96); }
.btn-copy.is-copied { background: var(--color-success); }
.btn-copy svg { flex-shrink: 0; }
.token-warn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: var(--space-2) 0 0;
  font-size: var(--fs-xs);
  color: var(--color-warning-strong);
  font-weight: 600;
}
.token-warn svg { flex-shrink: 0; }
/* aria-live 播報區：常駐節點、無內容時不佔空間 */
.token-copy-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--fs-xs);
  color: var(--color-success);
  font-weight: 600;
  min-height: 0;
}
.token-copy-hint:empty { display: none; }

/* —— 報名內容收據 —— */
.summary-receipt {
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
  padding: 4px 0;
  font-size: var(--fs-sm);
}
.receipt-label { color: var(--color-text-subtle); font-weight: 500; flex-shrink: 0; }
.receipt-value { color: var(--color-text); font-weight: 600; }
.receipt-amount { color: var(--color-text); font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.receipt-group {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--color-border);
}
.receipt-group-title {
  margin-bottom: 2px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-subtle);
}
.receipt-waitlist-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-warning-darker);
  background: var(--color-warning-soft);
  border-radius: var(--radius-full);
  vertical-align: 1px;
}
.receipt-amount.is-waitlisted {
  color: var(--color-text-subtle);
  font-weight: 500;
  text-decoration: line-through;
  text-decoration-color: rgba(122, 110, 94, 0.6);
}
.receipt-waitlist-note {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-xs);
  color: var(--color-warning-darker);
  line-height: 1.6;
}

.summary-final-note {
  margin: var(--space-3) 0 var(--space-4);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  text-align: center;
  line-height: 1.6;
}

/* —— CTA 與軟性提醒 —— */
.close-nudge {
  margin: 0 0 var(--space-2);
  padding: 8px 12px;
  background: var(--color-warning-soft, rgba(230, 162, 60, 0.12));
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
  color: var(--color-warning);
  font-weight: 600;
  text-align: center;
}
.success-cta-bar .btn-block { min-height: 52px; }
/* 接續報名是次要路徑：視覺壓到 text-link，不與主 CTA 搶重量，
   但 44px 高度與整列寬度維持完整觸控目標（手機吸底列內同樣適用）。 */
.success-reapply-link {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: var(--space-1);
  padding: 8px 12px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}
.success-reapply-link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

/* —— 手機：bottom-sheet —— */
@media (--to-sm) {
  .modal-overlay.is-visible {
    align-items: flex-end;
    padding: 0;
  }
  .modal-panel--success {
    max-width: none;
    max-height: 92dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    animation: sheetSlideUp var(--dur-slow) var(--ease-out);
  }
  .modal-panel--success .modal-body {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 0;
  }
  /* CTA 吸底：家長不用滾到最底也能完成 */
  .success-cta-bar {
    position: sticky;
    bottom: 0;
    margin: 0 calc(-1 * var(--space-5));
    padding: var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }
}

@keyframes sheetSlideUp {
  from { transform: translateY(48px); opacity: 0.4; }
  to { transform: translateY(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .modal-panel--success { animation: none; }
  .btn-copy { transition: none; }
}
</style>
