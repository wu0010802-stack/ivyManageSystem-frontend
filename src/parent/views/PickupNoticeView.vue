<script setup lang="ts">
/**
 * 預告接送（pnotice01）：通知園所「我多久後會抵達」。
 *
 * ⚠ 與「臨時接送」（/pickup，授權親友代接）是兩件事，文案與入口都不可混用。
 *
 * 冪等與防連點：client_request_id 於每次「新的建立意圖」產生一次，送出失敗
 * 重試沿用同一 id（後端 partial UNIQUE 冪等回放）；成功或換小孩才重新產生。
 * 刻意**不**進離線佇列——ETA 是時效性資訊，離線時入列、幾小時後補送出
 * 「15 分鐘後抵達」是錯誤訊息，寧可誠實顯示失敗請家長重試。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import {
  createDismissalNotice,
  listDismissalNotices,
  arriveDismissalNotice,
  cancelDismissalNotice,
  type ParentDismissalCall,
} from '../api/dismissalCalls'
import {
  useNowClock,
  formatExpectedArrival,
  etaRelativeText,
  isPreArrivalNotice,
} from '@/composables/useDismissalUrgency'
import { formatTaipeiClock } from '@/utils/taipeiTime'

interface ChildItem {
  student_id: number
  name?: string
  classroom_name?: string | null
}

const ETA_OPTIONS = [5, 10, 15, 20, 30, 45, 60]
const NOTE_MAX = 200

const childrenStore = useChildrenStore()
const { selectedId, setSelected, ensureSelected } = useChildSelection()
const { now } = useNowClock()

const children = computed(() => (childrenStore.items || []) as ChildItem[])
const selectedChild = computed(
  () => children.value.find((c) => c.student_id === selectedId.value) || null,
)

const notices = ref<ParentDismissalCall[]>([])
const loading = ref(false)
const submitting = ref(false)
const actioning = ref(false)
const errorText = ref('')
const confirmCancel = ref(false)

const etaMinutes = ref(15)
const note = ref('')
const clientRequestId = ref(genClientRequestId())

function genClientRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fallthrough */
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 每次「新的建立意圖」重置表單與冪等 key（成功後 / 換小孩）。 */
function resetForm(): void {
  etaMinutes.value = 15
  note.value = ''
  clientRequestId.value = genClientRequestId()
  errorText.value = ''
  confirmCancel.value = false
}

const ACTIVE_STATUSES = ['pending', 'acknowledged']

/** 選中小孩今天進行中的預告（追蹤卡資料源；每次只處理一位學生）。 */
const activeNotice = computed(
  () =>
    notices.value.find(
      (n) =>
        n.student_id === selectedId.value &&
        ACTIVE_STATUSES.includes(n.status) &&
        n.request_source === 'parent',
    ) || null,
)

/** 今天已完成的那筆（顯示結果態，不擋再建立）。 */
const doneNotice = computed(
  () =>
    notices.value.find(
      (n) =>
        n.student_id === selectedId.value &&
        n.status === 'completed' &&
        n.request_source === 'parent',
    ) || null,
)

const trackedNotice = computed(() => activeNotice.value || doneNotice.value)

const steps = computed(() => {
  const n = trackedNotice.value
  if (!n) return []
  return [
    { key: 'sent', label: '已送達園方', done: true, time: n.requested_at },
    { key: 'ack', label: '老師已收到', done: !!n.acknowledged_at, time: n.acknowledged_at },
    { key: 'arrived', label: '已到門口', done: !!n.arrived_at, time: n.arrived_at },
    { key: 'completed', label: '已完成', done: n.status === 'completed', time: n.completed_at },
  ]
})

const etaLine = computed(() => {
  const n = trackedNotice.value
  if (!n || !isPreArrivalNotice(n)) return ''
  const expected = formatExpectedArrival(n.expected_arrival_at)
  const rel = etaRelativeText(n.expected_arrival_at, now.value)
  return [expected, rel].filter(Boolean).join(' · ')
})

function errMessage(e: unknown, fallback: string): string {
  // 家長端 axios wrapper 已把後端錯誤內文正規化進 displayMessage / errorDetail，
  // 不直讀 axios 原始錯誤欄位（check-error-detail-ratchet 棘輪）。
  const err = e as { displayMessage?: string; errorDetail?: string }
  return err.displayMessage || err.errorDetail || fallback
}

let listSeq = 0
async function refresh(): Promise<void> {
  const mySeq = ++listSeq
  loading.value = true
  try {
    const res = await listDismissalNotices()
    if (mySeq !== listSeq) return
    notices.value = res.data?.items || []
  } catch (e) {
    if (mySeq !== listSeq) return
    errorText.value = errMessage(e, '載入預告狀態失敗，請下拉重試')
  } finally {
    if (mySeq === listSeq) loading.value = false
  }
}

async function submit(): Promise<void> {
  if (submitting.value || !selectedId.value) return
  errorText.value = ''
  submitting.value = true
  try {
    const res = await createDismissalNotice({
      student_id: selectedId.value,
      eta_minutes: etaMinutes.value,
      note: note.value.trim() || null,
      client_request_id: clientRequestId.value,
    })
    notices.value = [res.data, ...notices.value.filter((n) => n.id !== res.data.id)]
    resetForm()
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 409) {
      // 多半是已有進行中預告（可能在別台裝置建立）：補抓現況
      await refresh()
    }
    // 誠實呈現：失敗就說失敗；同一 client_request_id 可安全重試
    errorText.value = errMessage(e, '送出失敗，請確認網路後重試')
  } finally {
    submitting.value = false
  }
}

async function markArrived(): Promise<void> {
  const n = activeNotice.value
  if (!n || actioning.value) return
  errorText.value = ''
  actioning.value = true
  try {
    const res = await arriveDismissalNotice(n.id)
    notices.value = notices.value.map((x) => (x.id === n.id ? res.data : x))
  } catch (e) {
    errorText.value = errMessage(e, '操作失敗，請重試')
    await refresh()
  } finally {
    actioning.value = false
  }
}

async function cancelNotice(): Promise<void> {
  const n = activeNotice.value
  if (!n || actioning.value) return
  errorText.value = ''
  actioning.value = true
  try {
    await cancelDismissalNotice(n.id)
    await refresh()
    resetForm()
  } catch (e) {
    errorText.value = errMessage(e, '取消失敗，請重試')
    await refresh()
  } finally {
    actioning.value = false
    confirmCancel.value = false
  }
}

function pickChild(id: number): void {
  setSelected(id)
  resetForm()
}

// 家長端無 dismissal WS：頁面開啟期間低頻輪詢 + 回前景補抓，讓
// 「老師已收到 / 已完成」狀態自己更新。
let pollTimer: ReturnType<typeof setInterval> | null = null
function onVisibility(): void {
  if (document.visibilityState === 'visible') refresh()
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility)
  pollTimer = setInterval(refresh, 30000)
  await childrenStore.load()
  ensureSelected(children.value)
  refresh()
})

onUnmounted(() => {
  listSeq++
  document.removeEventListener('visibilitychange', onVisibility)
  if (pollTimer) clearInterval(pollTimer)
})

watch(selectedId, () => {
  confirmCancel.value = false
  errorText.value = ''
})
</script>

<template>
  <div class="pn-view">
    <!-- 子女切換（多寶） -->
    <div v-if="children.length > 1" class="pn-children" role="tablist" aria-label="選擇孩子">
      <button
        v-for="c in children"
        :key="c.student_id"
        type="button"
        class="pn-child"
        :class="{ 'is-active': c.student_id === selectedId }"
        role="tab"
        :aria-selected="c.student_id === selectedId ? 'true' : 'false'"
        @click="pickChild(c.student_id)"
      >{{ c.name }}</button>
    </div>

    <div v-if="!selectedChild && !childrenStore.loading" class="pn-empty">
      尚未綁定子女，無法使用預告接送。
    </div>

    <template v-else-if="selectedChild">
      <!-- 目前選中的學生與班級 -->
      <div class="pn-student">
        <span class="material-symbols-rounded pn-student__ico" aria-hidden="true">child_care</span>
        <div>
          <p class="pn-student__name">{{ selectedChild.name }}</p>
          <p class="pn-student__room">{{ selectedChild.classroom_name || '未分班' }}</p>
        </div>
      </div>

      <!-- 錯誤誠實呈現 -->
      <p v-if="errorText" class="pn-error" role="alert">{{ errorText }}</p>

      <!-- 追蹤卡：有進行中（或今天已完成）的預告 -->
      <section v-if="trackedNotice" class="pn-card pn-track" data-testid="pn-tracking-card">
        <header class="pn-track__head">
          <h2 class="pn-card__title">預告接送</h2>
          <span v-if="etaLine" class="pn-track__eta" data-testid="pn-eta-line">{{ etaLine }}</span>
        </header>

        <ol class="pn-steps">
          <li
            v-for="s in steps"
            :key="s.key"
            class="pn-step"
            :class="{ 'is-done': s.done }"
            :data-testid="`pn-step-${s.key}`"
          >
            <span class="pn-step__dot" aria-hidden="true"></span>
            <span class="pn-step__label">{{ s.label }}</span>
            <span v-if="s.done && s.time" class="pn-step__time">{{ formatTaipeiClock(s.time) }}</span>
          </li>
        </ol>

        <p v-if="trackedNotice.note" class="pn-track__note">備註：{{ trackedNotice.note }}</p>

        <div v-if="activeNotice" class="pn-track__actions">
          <button
            v-if="!activeNotice.arrived_at"
            type="button"
            class="pn-btn pn-btn--primary"
            :disabled="actioning"
            data-testid="pn-arrive-btn"
            @click="markArrived"
          >我已到門口</button>
          <template v-if="!confirmCancel">
            <button
              type="button"
              class="pn-btn pn-btn--ghost"
              :disabled="actioning"
              data-testid="pn-cancel-btn"
              @click="confirmCancel = true"
            >取消預告</button>
          </template>
          <template v-else>
            <span class="pn-confirm-text">確定取消這筆預告？</span>
            <button
              type="button"
              class="pn-btn pn-btn--danger"
              :disabled="actioning"
              data-testid="pn-cancel-confirm-btn"
              @click="cancelNotice"
            >確定取消</button>
            <button
              type="button"
              class="pn-btn pn-btn--ghost"
              :disabled="actioning"
              @click="confirmCancel = false"
            >返回</button>
          </template>
        </div>
        <p v-else class="pn-track__doneline">今天的接送已完成，謝謝您。</p>
      </section>

      <!-- 建立表單：沒有進行中的預告時 -->
      <section v-if="!activeNotice" class="pn-card" data-testid="pn-create-form">
        <h2 class="pn-card__title">{{ doneNotice ? '再建立一筆預告' : '我多久後會抵達？' }}</h2>

        <div class="pn-chips" role="radiogroup" aria-label="預計抵達時間">
          <button
            v-for="m in ETA_OPTIONS"
            :key="m"
            type="button"
            class="pn-chip"
            :class="{ 'is-active': etaMinutes === m }"
            role="radio"
            :aria-checked="etaMinutes === m ? 'true' : 'false'"
            :data-testid="`pn-eta-chip-${m}`"
            @click="etaMinutes = m"
          >{{ m }} 分鐘</button>
        </div>

        <label class="pn-note">
          <span class="pn-note__label">備註（選填）</span>
          <textarea
            v-model="note"
            class="pn-note__input"
            :maxlength="NOTE_MAX"
            rows="2"
            placeholder="例如：開白色轎車，停在側門"
            data-testid="pn-note-input"
          ></textarea>
          <span class="pn-note__count">{{ note.trim().length }}/{{ NOTE_MAX }}</span>
        </label>

        <!-- 與臨時接送授權的辨異提示（送出前恆顯示） -->
        <p class="pn-hint">
          這只會通知園所您即將抵達；若由親友代接，請另外建立
          <router-link to="/pickup" class="pn-hint__link">臨時接送授權</router-link>。
        </p>

        <button
          type="button"
          class="pn-btn pn-btn--primary pn-submit"
          :disabled="submitting || !selectedId"
          data-testid="pn-submit-btn"
          @click="submit"
        >{{ submitting ? '送出中…' : '通知園所' }}</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
/*
 * Token 說明：lint:tokens 棘輪（scripts/lint-tokens.mjs）禁止新增 --m3-/--pt-
 * 引用，而家長端 --color-* alias 尚未涵蓋品牌/表面/文字語意（TOKENS.md 階段 2
 * 才會 sed 全量遷移）。此處以元件級 --pn-* 鏡射 m3-tokens.css 的明/暗值，
 * dark 覆寫跟 useTheme 的 <html data-theme='dark'> 走；階段 2 後應改回全域 alias。
 */
.pn-view {
  --pn-primary: #006d3d;
  --pn-on-primary: #ffffff;
  --pn-primary-container: #cdeeda;
  --pn-on-primary-container: #00210f;
  --pn-secondary-container: #eef4e9;
  --pn-on-secondary-container: #121f13;
  --pn-surface: #f7fbf3;
  --pn-surface-card: #ffffff;
  --pn-on-surface: #1a1c19;
  --pn-on-surface-variant: #414942;
  --pn-outline-variant: #c7cdc1;
  --pn-error: #ba1a1a;
  --pn-on-error: #ffffff;
  --pn-error-container: #ffdad6;
  --pn-on-error-container: #410002;

  padding: 12px 16px 24px;
  background: var(--pn-surface);
  min-height: 100%;
}
[data-theme='dark'] .pn-view {
  --pn-primary: #6ddc97;
  --pn-on-primary: #00391d;
  --pn-primary-container: #00522c;
  --pn-on-primary-container: #89f9b1;
  --pn-secondary-container: #384b3d;
  --pn-on-secondary-container: #d2e8d4;
  --pn-surface: #191c19;
  --pn-surface-card: #1d201d;
  --pn-on-surface: #e1e3de;
  --pn-on-surface-variant: #c0c9bf;
  --pn-outline-variant: #414942;
  --pn-error: #ffb4ab;
  --pn-on-error: #690005;
  --pn-error-container: #93000a;
  --pn-on-error-container: #ffb4ab;
}

.pn-children {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.pn-child {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 20px;
  border: 1px solid var(--pn-outline-variant);
  background: var(--pn-surface-card);
  color: var(--pn-on-surface);
  font-size: 15px;
  cursor: pointer;
}
.pn-child.is-active {
  background: var(--pn-primary-container);
  border-color: var(--pn-primary);
  color: var(--pn-on-primary-container);
  font-weight: 700;
}

.pn-student {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.pn-student__ico {
  font-size: 32px;
  color: var(--pn-primary);
}
.pn-student__name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--pn-on-surface);
}
.pn-student__room {
  margin: 0;
  font-size: 13px;
  color: var(--pn-on-surface-variant);
}

.pn-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--pn-error-container);
  color: var(--pn-on-error-container);
  font-size: 14px;
}

.pn-card {
  background: var(--pn-surface-card);
  border: 1px solid var(--pn-outline-variant);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}
.pn-card__title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--pn-on-surface);
}

/* ─── ETA chips ─── */
.pn-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.pn-chip {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 22px;
  border: 1px solid var(--pn-outline-variant);
  background: var(--pn-surface);
  color: var(--pn-on-surface);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.pn-chip.is-active {
  background: var(--pn-primary);
  border-color: var(--pn-primary);
  color: var(--pn-on-primary);
  font-weight: 700;
}

/* ─── 備註 ─── */
.pn-note {
  display: block;
  position: relative;
  margin-bottom: 12px;
}
.pn-note__label {
  display: block;
  font-size: 13px;
  color: var(--pn-on-surface-variant);
  margin-bottom: 4px;
}
.pn-note__input {
  width: 100%;
  border: 1px solid var(--pn-outline-variant);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 15px;
  background: var(--pn-surface-card);
  color: var(--pn-on-surface);
  resize: vertical;
  box-sizing: border-box;
}
.pn-note__count {
  position: absolute;
  right: 4px;
  bottom: -18px;
  font-size: 12px;
  color: var(--pn-on-surface-variant);
}

.pn-hint {
  margin: 20px 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--pn-secondary-container);
  color: var(--pn-on-secondary-container);
  font-size: 13px;
  line-height: 1.6;
}
.pn-hint__link {
  color: var(--pn-primary);
  font-weight: 700;
  text-decoration: underline;
}

/* ─── 按鈕 ─── */
.pn-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 22px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.pn-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.pn-btn--primary {
  background: var(--pn-primary);
  color: var(--pn-on-primary);
}
.pn-btn--ghost {
  background: transparent;
  border: 1px solid var(--pn-outline-variant);
  color: var(--pn-on-surface);
}
.pn-btn--danger {
  background: var(--pn-error);
  color: var(--pn-on-error);
}
.pn-submit {
  width: 100%;
}

/* ─── 追蹤卡 ─── */
.pn-track__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.pn-track__eta {
  font-size: 14px;
  font-weight: 700;
  color: var(--pn-primary);
  font-variant-numeric: tabular-nums;
}
.pn-steps {
  list-style: none;
  margin: 8px 0 12px;
  padding: 0;
}
.pn-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  color: var(--pn-on-surface-variant);
  font-size: 15px;
}
.pn-step__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--pn-outline-variant);
  background: transparent;
  flex-shrink: 0;
}
.pn-step.is-done {
  color: var(--pn-on-surface);
  font-weight: 600;
}
.pn-step.is-done .pn-step__dot {
  background: var(--pn-primary);
  border-color: var(--pn-primary);
}
.pn-step__time {
  margin-left: auto;
  font-size: 13px;
  color: var(--pn-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.pn-track__note {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--pn-on-surface-variant);
}
.pn-track__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pn-confirm-text {
  font-size: 14px;
  color: var(--pn-on-surface);
}
.pn-track__doneline {
  margin: 0;
  font-size: 14px;
  color: var(--pn-primary);
  font-weight: 600;
}

.pn-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--pn-on-surface-variant);
  font-size: 14px;
}
</style>
