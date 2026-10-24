<template>
  <div class="resolve-card">
    <!-- 逐人檢視：姓名、日期與上下件。嵌在排班與出勤抽屜時（showNav=false）抽屜標題已有姓名日期、自己有佇列導覽，不畫 -->
    <div v-if="showNav" class="resolve-card__header">
      <div class="resolve-card__title-row">
        <span class="resolve-card__name">{{ item.employee_name }}</span>
        <span class="resolve-card__separator">·</span>
        <span class="resolve-card__date">{{ item.date }}（{{ item.weekday }}）</span>
      </div>
      <div class="resolve-card__nav">
        <span class="resolve-card__counter" data-test="resolve-counter">第 {{ index + 1 }} / {{ total }} 件</span>
        <el-button
          size="small"
          :icon="ArrowLeft"
          :disabled="index <= 0"
          data-test="resolve-prev"
          @click="emit('navigate', -1)"
        >上一件</el-button>
        <el-button
          size="small"
          :disabled="index >= total - 1"
          data-test="resolve-next"
          @click="emit('navigate', 1)"
        >下一件<el-icon class="el-icon--right"><ArrowRight /></el-icon></el-button>
      </div>
    </div>

    <!-- 決策卡：判定與金額在最上面，下面是事實、後果與兩顆大按鈕 -->
    <section
      class="resolve-card__decision"
      :class="`resolve-card__decision--${severity}`"
      aria-label="這件要決定的事"
      data-test="resolve-decision"
    >
      <div v-if="verdictText" class="resolve-card__verdict-row">
        <i v-if="severity !== 'neutral'" class="verdict-shape" :class="`verdict-shape--${severity}`" aria-hidden="true" />
        <span class="resolve-card__verdict" data-test="resolve-verdict">{{ verdictText }}</span>
        <span v-if="amount > 0" class="resolve-card__amount" data-test="resolve-amount">−NT${{ amountText }}</span>
      </div>

      <dl class="resolve-card__facts" data-test="resolve-facts">
        <template v-if="context.plan">
          <dt>應上班</dt>
          <dd>{{ context.plan }}</dd>
        </template>
        <dt>實際</dt>
        <dd v-if="recordsState === 'loaded'">{{ context.punch_in ?? '無紀錄' }} – {{ context.punch_out ?? '無紀錄' }}</dd>
        <!-- 打卡紀錄還沒到或載入失敗：不知道有沒有打卡，不能當成缺卡叫人兩側都補（會整列覆寫真實打卡） -->
        <dd v-else class="resolve-card__records-state" data-test="resolve-records-state">
          <span>{{ recordsState === 'failed' ? '打卡紀錄載入失敗，無法補卡；接受扣款／豁免不受影響。' : '打卡紀錄載入中…' }}</span>
          <el-button v-if="recordsState === 'failed'" size="small" @click="emit('retry')">重試</el-button>
        </dd>
      </dl>
      <span v-if="context.has_leave" class="resolve-card__leave-badge">當日有請假</span>

      <template v-if="canWrite && !sealed">
        <p v-if="canDecide" class="resolve-card__consequence" data-test="resolve-consequence">{{ consequenceText }}</p>

        <div v-if="canDecide && !waiving" class="resolve-card__decide">
          <el-button
            v-if="allows('admin_accept')"
            :type="primaryAction ? 'primary' : 'default'"
            :loading="busy"
            :disabled="busy"
            data-test="resolve-accept"
            @click="handleAccept"
          >{{ acceptButtonText }}</el-button>
          <el-button
            v-if="allows('admin_waive')"
            :disabled="busy"
            data-test="resolve-waive-start"
            @click="startWaive"
          >豁免…</el-button>
        </div>

        <div v-if="waiving" class="resolve-card__waive" data-test="resolve-waive">
          <label :for="reasonId" class="resolve-card__waive-label">豁免理由 <span>（必填，會記在這天的出勤備註）</span></label>
          <p v-if="missingOnly" class="resolve-card__waive-note">豁免只讓本月薪資不記入，年終與考核仍照次計。</p>
          <div class="resolve-card__chips" role="group" aria-label="常用理由">
            <el-button v-for="reason in WAIVE_REASONS" :key="reason" size="small" round @click="remark = reason">{{ reason }}</el-button>
          </div>
          <el-input
            :id="reasonId"
            ref="reasonInput"
            v-model="remark"
            type="textarea"
            :rows="3"
            :maxlength="200"
            show-word-limit
            placeholder="或自己寫，例如：園長同意晚到"
            data-test="resolve-waive-reason"
          />
          <div class="resolve-card__decide">
            <el-button
              type="primary"
              :loading="busy"
              :disabled="busy || !remark.trim()"
              data-test="resolve-waive-confirm"
              @click="confirmWaive"
            >確認豁免</el-button>
            <el-button :disabled="busy" @click="cancelWaive">取消</el-button>
          </div>
        </div>

        <!-- 補打卡：判定本身錯了（漏打卡）才用；只缺卡、或只能補卡時預設展開 -->
        <details
          v-if="allows('punch')"
          class="resolve-card__punch"
          :open="punchOpen"
          data-test="resolve-punch"
          @toggle="onPunchToggle"
        >
          <summary>補打卡</summary>
          <div class="resolve-card__punch-body">
            <template v-if="recordsState === 'loaded'">
              <div v-if="context.punch_in === null" class="resolve-card__row">
                <span class="resolve-card__label">上班</span>
                <el-time-picker
                  v-model="localPunchIn"
                  format="HH:mm"
                  value-format="HH:mm"
                  placeholder="補填上班時間"
                  class="resolve-card__time-picker"
                />
              </div>
              <div v-if="context.punch_out === null" class="resolve-card__row">
                <span class="resolve-card__label">下班</span>
                <el-time-picker
                  v-model="localPunchOut"
                  format="HH:mm"
                  value-format="HH:mm"
                  placeholder="補填下班時間"
                  class="resolve-card__time-picker"
                />
              </div>
            </template>
            <el-button
              :loading="busy"
              :disabled="busy || !canPunch"
              @click="handlePunch"
            >補打卡並重算</el-button>
          </div>
        </details>
      </template>
      <!-- 薪資已封存：補卡、接受、豁免都會被後端 409 擋下，不給按鈕，直接說明原因 -->
      <p v-else-if="sealed" class="resolve-card__readonly-hint" data-test="resolve-sealed-note">
        這個月薪資已封存，只能看。
      </p>
      <p v-else class="resolve-card__readonly-hint">
        您無權限執行操作
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, useId } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import type { ResolvePayload } from '@/composables/useResolveAnomaly'

// ── props & emits ──────────────────────────────────────────────────────────────
type ResolveAction = 'punch' | 'admin_accept' | 'admin_waive'

const props = withDefaults(defineProps<{
  item: AnomalyDayCard
  index: number
  total: number
  context: {
    punch_in: string | null
    punch_out: string | null
    has_leave: boolean
    estimated_deduction: number
    /** 應上班（例如「早車 07:00–16:30（週排班）」）；沒給就只寫實際打卡 */
    plan?: string | null
    /** 打卡紀錄載入狀態；未給＝已載入（例如抽屜直接用格子資料） */
    records?: 'loading' | 'loaded' | 'failed'
  }
  /** mutation in-flight：防重複送出 */
  busy?: boolean
  /** 姓名日期列與「第 N / M 件」上下件；嵌在排班與出勤抽屜（只有一天、抽屜有自己的佇列）時關掉 */
  showNav?: boolean
  /** 允許的動作；沒有出勤紀錄列（疑似缺勤）只能補卡，疑似換班兩側都有打卡不必補卡 */
  actions?: readonly ResolveAction[]
  /** 決策卡的接受鈕是否用主色；同一畫面另有主要動作（例如確認當日班別）時傳 false */
  primaryAction?: boolean
  /**
   * 這天符合該員工整月的固定型態（多半是設定問題）時的提醒文字：按「接受扣款」前先問一次，
   * 免得照錯的應上班時段逐格扣薪。null／未給＝直接送出。
   */
  acceptWarning?: string | null
  /** 這個人這個月薪資已封存：只能看，不給補打卡、接受扣款、豁免 */
  sealed?: boolean
}>(), {
  sealed: false,
  busy: false,
  showNav: true,
  actions: () => ['punch', 'admin_accept', 'admin_waive'],
  primaryAction: true,
  acceptWarning: null,
})

const allows = (action: ResolveAction) => props.actions.includes(action)

const emit = defineEmits<{
  (e: 'resolve', payload: ResolvePayload): void
  (e: 'navigate', delta: number): void
  /** 打卡紀錄載入失敗後重試 */
  (e: 'retry'): void
}>()

const recordsState = computed(() => props.context.records ?? 'loaded')

// ── 權限 ───────────────────────────────────────────────────────────────────────
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))
const canDecide = computed(() => allows('admin_accept') || allows('admin_waive'))

// ── 判定、金額、後果 ───────────────────────────────────────────────────────────
/**
 * 整天只有缺卡（後端明細寫「不扣款，僅記錄」）：薪資不扣，但「接受」會記入缺卡次數、豁免不記入。
 * 按鈕不能寫「接受扣款」，否則和明細自相矛盾。
 */
const missingOnly = computed(() => props.item.items.length > 0 && props.item.items.every((entry) => entry.type === 'missing_punch'))
const acceptLabel = computed(() => (missingOnly.value ? '確認缺卡' : '接受扣款'))

/** 判定色：會扣款（遲到早退）＝扣款色，只有缺卡＝缺卡色；與排班與出勤格子同一套形狀 */
const severity = computed<'deduct' | 'missing' | 'neutral'>(() => {
  if (props.item.items.length === 0) return 'neutral'
  return missingOnly.value ? 'missing' : 'deduct'
})

/** 後端明細寫「遲到 15 分鐘」「下班未打卡（不扣款，僅記錄）」：標頭要短，與格子同樣寫「遲到 15 分」，括號說明交給下方後果 */
function shortDetail(detail: string): string {
  return detail.replace(/（[^（）]*）$/, '').replace(/分鐘$/, '分').trim()
}
const verdictText = computed(() => props.item.items.map((entry) => shortDetail(entry.detail)).join('・'))

const amount = computed(() => props.context.estimated_deduction)
const amountText = computed(() => amount.value.toLocaleString())
const acceptButtonText = computed(() => (amount.value > 0 ? `${acceptLabel.value} NT$${amountText.value}` : acceptLabel.value))
const consequenceText = computed(() => {
  const lead = amount.value > 0
    ? `不處理的話，算薪時照扣 NT$${amountText.value}。`
    : missingOnly.value ? '不處理的話，記一次缺卡（不扣款）。' : ''
  return `${lead}接受或豁免會套用到這天所有異常。`
})

// ── 接受扣款 ───────────────────────────────────────────────────────────────────
async function handleAccept(): Promise<void> {
  if (props.acceptWarning) {
    try {
      await ElMessageBox.confirm(props.acceptWarning, '可能是設定問題', {
        confirmButtonText: `仍要${acceptLabel.value}`,
        cancelButtonText: '先不要',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  emit('resolve', missingOnly.value ? { action: 'admin_accept', doneText: '已確認缺卡' } : { action: 'admin_accept' })
}

// ── 豁免（要填理由）────────────────────────────────────────────────────────────
const WAIVE_REASONS = ['園方指派外出', '打卡機故障', '園長同意'] as const
const reasonId = useId()
const waiving = ref(false)
const remark = ref('')
const reasonInput = ref<{ focus?: () => void } | null>(null)

async function startWaive(): Promise<void> {
  waiving.value = true
  // 「豁免…」按下去就消失了：焦點移到理由欄，鍵盤使用者不會掉回頁首
  await nextTick()
  reasonInput.value?.focus?.()
}
function cancelWaive(): void {
  waiving.value = false
  remark.value = ''
}
function confirmWaive(): void {
  const reason = remark.value.trim()
  if (!reason) return
  emit('resolve', { action: 'admin_waive', remark: reason })
}

// ── 補打卡 ────────────────────────────────────────────────────────────────────
// 只缺卡（補卡就是答案）或只能補卡（疑似缺勤）時預設展開；其他情形判定多半是對的，收起來
const punchOpenByDefault = () => missingOnly.value || !canDecide.value
const punchOpen = ref(punchOpenByDefault())
function onPunchToggle(event: Event): void {
  punchOpen.value = (event.target as HTMLDetailsElement).open
}

// 補卡時間 local ref（初始 = context 值）
const localPunchIn = ref<string | null>(props.context.punch_in)
const localPunchOut = ref<string | null>(props.context.punch_out)

// 換筆後 reset（auto-advance）：context 為父層 computed，每次換筆（item 變更）
// 都會重算成新物件參考，故單一 watch(context) 已涵蓋所有換筆情境。
watch(
  () => props.context,
  (ctx) => {
    localPunchIn.value = ctx.punch_in
    localPunchOut.value = ctx.punch_out
  },
)

// 換一件（或這件的處理結果變了）：收起豁免理由、補打卡回到預設展開狀態。
// 不跟 context 一起重設：context 重算（例如打卡紀錄快取更新）不代表換了一件，打到一半的理由不能被清掉。
watch(
  () => `${props.item.id}|${props.item.date}|${props.item.employee_number}|${props.item.confirmed_action ?? ''}`,
  () => {
    waiving.value = false
    remark.value = ''
    punchOpen.value = punchOpenByDefault()
  },
)

// 最終上/下班時間：優先用使用者填的 local，否則用原 context 值
const effectivePunchIn = computed(() => localPunchIn.value ?? props.context.punch_in)
const effectivePunchOut = computed(() => localPunchOut.value ?? props.context.punch_out)

// 至少要填了缺的那側才能送出
const canPunch = computed(() => {
  if (recordsState.value !== 'loaded') return false
  const needIn = props.context.punch_in === null
  const needOut = props.context.punch_out === null
  if (needIn && !localPunchIn.value) return false
  if (needOut && !localPunchOut.value) return false
  return true
})

/** 缺的那側已填了時間、或打了豁免理由還沒送出：外層（排班與出勤抽屜）關閉或換筆前要先問 */
function isDirty(): boolean {
  if (props.sealed) return false
  const reasonDirty = waiving.value && remark.value.trim() !== ''
  if (recordsState.value !== 'loaded') return reasonDirty
  return reasonDirty
    || (props.context.punch_in === null && !!localPunchIn.value)
    || (props.context.punch_out === null && !!localPunchOut.value)
}
defineExpose({ isDirty })

function handlePunch(): void {
  const payload: ResolvePayload = { action: 'punch' }
  if (effectivePunchIn.value !== null) {
    payload.punch_in = effectivePunchIn.value
  }
  if (effectivePunchOut.value !== null) {
    payload.punch_out = effectivePunchOut.value
  }
  emit('resolve', payload)
}
</script>

<style scoped>
.resolve-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.resolve-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.resolve-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.resolve-card__name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.resolve-card__separator {
  color: var(--text-tertiary);
}

.resolve-card__date {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.resolve-card__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.resolve-card__counter {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* ── 決策卡 ── */
.resolve-card__decision {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--radius-lg);
}

.resolve-card__decision--deduct {
  border-color: var(--el-color-danger-light-7);
}

.resolve-card__decision--missing {
  border-color: var(--el-color-warning-light-5);
}

.resolve-card__verdict-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.resolve-card__verdict-row .verdict-shape {
  width: 10px;
  height: 10px;
}

.resolve-card__verdict {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-primary);
}

.resolve-card__decision--deduct .resolve-card__verdict {
  color: var(--color-danger-darker);
}

.resolve-card__decision--missing .resolve-card__verdict {
  color: var(--color-warning-darker);
}

.resolve-card__amount {
  margin-left: auto;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-danger-darker);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.resolve-card__facts {
  display: grid;
  grid-template-columns: 4.5em 1fr;
  gap: var(--space-1) var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.resolve-card__facts dt {
  color: var(--text-secondary);
}

.resolve-card__facts dd {
  margin: 0;
  color: var(--text-primary);
}

.resolve-card__records-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.resolve-card__leave-badge {
  align-self: flex-start;
  font-size: var(--text-xs);
  color: var(--color-warning-darker);
  background: var(--el-color-warning-light-9);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--el-color-warning-light-5);
}

.resolve-card__consequence {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.resolve-card__decide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.resolve-card__decide .el-button {
  height: var(--touch-target-min);
  margin-left: 0;
  font-size: var(--text-base);
}

/* ── 豁免理由 ── */
.resolve-card__waive {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--el-border-color);
}

.resolve-card__waive-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.resolve-card__waive-label span {
  font-weight: 400;
  color: var(--text-secondary);
}

.resolve-card__waive-note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.resolve-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.resolve-card__chips .el-button {
  margin-left: 0;
}

/* ── 補打卡 ── */
.resolve-card__punch {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: var(--space-2);
}

.resolve-card__punch summary {
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.resolve-card__punch summary:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.resolve-card__punch-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.resolve-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.resolve-card__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  width: 3em;
  flex-shrink: 0;
}

.resolve-card__time-picker {
  flex: 1;
}

.resolve-card__readonly-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  padding: var(--space-2) 0;
}
</style>
