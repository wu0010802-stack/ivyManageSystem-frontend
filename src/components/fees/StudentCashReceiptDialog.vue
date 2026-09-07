<template>
  <el-dialog
    :model-value="modelValue"
    :title="`收現金：${studentName || ''}`"
    width="640px"
    append-to-body
    data-test="cash-dialog"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="closeDialog"
  >
    <p class="intro">
      一次收多張單開一張現金收據，自動進當日交接批；轉帳請到入帳媒合由網銀資料銷帳。
    </p>
    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else-if="loadError" data-test="cash-load-error">
      <el-alert :title="loadError" type="error" :closable="false" />
      <el-button @click="load">重新載入</el-button>
    </div>
    <template v-else>
      <p v-if="rows.length === 0" class="empty" data-test="cash-empty">此學生目前沒有未繳的費用單</p>
      <template v-else>
        <section
          v-for="group in groups"
          :key="group.key"
          class="group"
          data-test="cash-group"
          :data-group="group.key"
        >
          <h4 class="group__title">{{ group.label }}</h4>
          <p v-if="group.rows.length === 0" class="hint">—</p>
          <table v-else class="rows">
            <tbody>
              <tr
                v-for="row in group.rows"
                :key="row.id"
                data-test="cash-row"
                :data-record="row.id"
                :class="{ 'row--off': !row.checked }"
              >
                <td class="col-check">
                  <el-checkbox
                    v-model="row.checked"
                    :disabled="submitting"
                    data-test="cash-row-check"
                    :aria-label="`收 ${row.name}`"
                  />
                </td>
                <td class="col-name">
                  {{ row.name }}
                  <span class="hint">剩餘 {{ formatCurrency(row.remaining) }}</span>
                </td>
                <td class="col-amount">
                  <el-input-number
                    v-model="row.amount"
                    :min="1"
                    :max="row.remaining"
                    :step="100"
                    :disabled="!row.checked || submitting"
                    size="small"
                    controls-position="right"
                    data-test="cash-row-amount"
                    :aria-label="`${row.name} 收款金額`"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
      <div v-if="rows.length" class="footer-row">
        <label class="date-label">
          收款日
          <el-date-picker
            v-model="receivedDate"
            :disabled="submitting"
            type="date"
            value-format="YYYY-MM-DD"
            size="small"
            :disabled-date="(d: Date) => dateToLocalISO(d) > todayISO()"
            data-test="cash-date"
            aria-label="收款日期"
          />
        </label>
        <el-input
          v-model="payerNote"
          :disabled="submitting"
          size="small"
          maxlength="200"
          placeholder="備註（選填）"
          data-test="cash-note"
          aria-label="收款備註"
          class="note-input"
        />
        <strong class="total" data-test="cash-total">合計 {{ formatCurrency(total) }}</strong>
      </div>
    </template>
    <template #footer>
      <el-button :disabled="submitting" @click="closeDialog(false)">取消</el-button>
      <el-button
        type="primary"
        data-test="cash-submit"
        :loading="submitting"
        :disabled="total <= 0 || submitting || loading || !!loadError"
        @click="submit"
      >
        確認收款
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 收現金 dialog（SPEC-019 §8.2）。
 *
 * 載入該生未繳／部分繳的單，分三組：本月銀行單（發單批次來源且歸本月，預設勾）、
 * 現金項目（現金項目批次來源，預設勾）、其他月份未繳（列出不勾）。每張可改金額
 * （1 ≤ 金額 ≤ 剩餘），合計即收據金額，走既有 POST /fees/cash-receipts 一筆多單，
 * 由後端掛當日交接批並受關帳／交接鎖（409 原樣顯示）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createCashReceipt, getFeeRecords } from '@/api/fees'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
// dateToLocalISO：不可用 d.toISOString()（UTC），台灣 UTC+8 下「明天」的 UTC
// 日期仍等於今天，未來日期會漏過前端防呆、直到後端 validate_payment_date 才擋。
import { dateToLocalISO, todayISO } from '@/utils/format'

interface FeeRecordLite {
  id: number
  fee_item_name: string | null
  fee_type: string | null
  amount_due: number
  amount_paid: number | null
  status: string | null
  source?: string
  target_month?: string | null
  billing_start_date?: string | null
  due_date?: string | null
}

interface CashRow {
  id: number
  name: string
  remaining: number
  amount: number
  checked: boolean
  group: 'bank' | 'cash_item' | 'other'
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    studentId: number | null
    studentName?: string
    month?: string
    preselectRecordIds?: number[]
  }>(),
  { studentName: '', month: '', preselectRecordIds: () => [] },
)

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  paid: []
}>()

const loading = ref(false)
const loadError = ref('')
let loadSequence = 0
let loadedSequence = 0
// 回應中斷時後端可能已入帳；相同內容重試必須沿用同一把冪等 key。
let pendingAttempt: { fingerprint: string; key: string } | null = null
const submitting = ref(false)
const rows = ref<CashRow[]>([])
const receivedDate = ref(todayISO())
const payerNote = ref('')

const GROUP_LABELS: Record<CashRow['group'], string> = {
  bank: '本月銀行單',
  cash_item: '現金項目',
  other: '其他月份未繳',
}

const groups = computed(() =>
  (['bank', 'cash_item', 'other'] as const).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: rows.value.filter((r) => r.group === key),
  })),
)

const total = computed(() =>
  rows.value.filter((r) => r.checked).reduce((a, r) => a + (r.amount || 0), 0),
)

function monthKey(r: FeeRecordLite): string | null {
  if (r.target_month) return r.target_month
  const anchor = r.billing_start_date || r.due_date
  return anchor ? anchor.slice(0, 7) : null
}

function classify(r: FeeRecordLite, month: string): CashRow['group'] {
  if (r.source === 'cash_item') return 'cash_item'
  const inMonth = !month || monthKey(r) === month
  return r.source === 'bill_slip' && inMonth ? 'bank' : 'other'
}

async function load() {
  const sequence = ++loadSequence
  loadedSequence = 0
  rows.value = []
  loadError.value = ''
  const studentId = props.studentId
  const month = props.month
  const preselect = new Set(props.preselectRecordIds)
  if (!props.modelValue || !studentId) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [unpaid, partial] = await Promise.all([
      getFeeRecords({ student_id: studentId, status: 'unpaid', page: 1, page_size: 100 }),
      getFeeRecords({ student_id: studentId, status: 'partial', page: 1, page_size: 100 }),
    ])
    if (sequence !== loadSequence) return
    const items = [...(unpaid.items ?? []), ...(partial.items ?? [])] as unknown as FeeRecordLite[]
    rows.value = items
      .map((r) => {
        const remaining = Math.max(r.amount_due - (r.amount_paid ?? 0), 0)
        const group = classify(r, month)
        const defaultChecked = preselect.size ? preselect.has(r.id) : group !== 'other'
        return {
          id: r.id,
          name: r.fee_item_name ?? r.fee_type ?? '費用',
          remaining,
          amount: remaining,
          checked: defaultChecked && remaining > 0,
          group,
        }
      })
      .filter((r) => r.remaining > 0)
    loadedSequence = sequence
  } catch (e) {
    if (sequence !== loadSequence) return
    loadError.value = friendlyError('載入未繳費用單失敗', e)
    ElMessage.error(loadError.value)
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function submit() {
  if (!props.modelValue || !props.studentId || loading.value || loadError.value || submitting.value || loadedSequence !== loadSequence) return
  const contextSequence = loadSequence
  const picked = rows.value.filter((r) => r.checked && r.amount > 0)
  if (!picked.length) return
  if (picked.some((r) => r.amount > r.remaining)) {
    ElMessage.warning('收款金額不得超過剩餘應繳')
    return
  }
  // 送出後表單或父層切換不得改變本次收款內容及成功訊息金額。
  const parts = picked.map((r) => ({ part_type: 'fee_record' as const, fee_record_id: r.id, amount: r.amount }))
    .sort((a, b) => a.fee_record_id - b.fee_record_id)
  const payload = {
    amount: parts.reduce((sum, part) => sum + part.amount, 0),
    received_date: receivedDate.value,
    parts,
    payer_note: payerNote.value.trim() || undefined,
  }
  const fingerprint = JSON.stringify({ studentId: props.studentId, ...payload })
  if (pendingAttempt?.fingerprint !== fingerprint) {
    pendingAttempt = { fingerprint, key: `cashdlg-${Date.now()}-${Math.floor(Math.random() * 100000)}` }
  }
  const key = pendingAttempt.key
  submitting.value = true
  try {
    await createCashReceipt({ ...payload, idempotency_key: key })
    pendingAttempt = null
    if (contextSequence !== loadSequence) return
    loadedSequence = 0
    rows.value = []
    ElMessage.success(`已收現金 ${formatCurrency(payload.amount)}（進當日交接批）`)
    emit('paid')
    emit('update:modelValue', false)
  } catch (e) {
    if (contextSequence === loadSequence) ElMessage.error(friendlyError('收款失敗', e))
  } finally {
    submitting.value = false
  }
}

function closeDialog(visible: boolean) {
  if (submitting.value) return
  if (!visible) {
    loadSequence += 1
    loadedSequence = 0
    rows.value = []
  }
  emit('update:modelValue', visible)
}

watch(
  () => [props.modelValue, props.studentId, props.month, props.preselectRecordIds.join(',')] as const,
  ([open]) => {
    if (open) {
      receivedDate.value = todayISO()
      payerNote.value = ''
    }
    void load()
  },
  { immediate: true, flush: 'sync' },
)

onBeforeUnmount(() => { loadSequence += 1 })

</script>

<style scoped>
.intro,
.hint,
.empty {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.intro {
  margin: 0 0 10px;
}
.group {
  margin-bottom: 10px;
}
.group__title {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.rows {
  width: 100%;
  border-collapse: collapse;
}
.rows td {
  padding: 4px 6px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.row--off .col-name {
  color: var(--el-text-color-placeholder);
}
.col-check {
  width: 32px;
}
.col-amount {
  width: 180px;
  text-align: right;
}
.footer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.date-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}
.note-input {
  flex: 1 1 160px;
}
.total {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
</style>
