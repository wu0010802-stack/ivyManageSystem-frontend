<template>
  <el-dialog
    :model-value="visible"
    :title="`分配代收繳費 #${payment?.id ?? ''}`"
    width="760px"
    data-test="collection-alloc-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="payment">
      <div class="pay-summary">
        <span>{{ payment.customer_paid_date }} 繳</span>
        <span>{{ payment.channel }}</span>
        <strong>{{ formatCurrency(payment.gross_amount) }}</strong>
        <el-tag v-if="billPeriodText" size="small" type="info" data-test="bill-period">
          帳單期別 {{ billPeriodText }}
        </el-tag>
        <el-tag size="small">未分配 {{ formatCurrency(payment.unallocated) }}</el-tag>
      </div>
      <p v-if="payment.fee_amount > 0" class="fee-note" data-test="fee-note">
        含代收手續費 {{ formatCurrency(payment.fee_amount) }}（實入帳
        {{ formatCurrency(payment.net_amount) }}）；分配以帳單面額
        {{ formatCurrency(payment.gross_amount) }} 為準。
      </p>

      <!-- 系統候選（帳號已錨定學生與期別）-->
      <div v-if="candidates" class="candidates" data-test="collection-candidates">
        <div class="cand-head">
          <el-tag :type="levelTag" size="small">{{ levelLabel }}</el-tag>
          <span v-for="(r, i) in candidates.reasons" :key="i" class="reason">{{ r }}</span>
        </div>
        <el-card
          v-for="(cand, idx) in candidates.candidates"
          :key="idx"
          shadow="never"
          class="cand-card"
        >
          <div class="cand-row">
            <div>
              <div v-for="(p, pi) in cand.parts" :key="pi" class="cand-part">
                {{ partText(p) }}
              </div>
            </div>
            <el-button size="small" data-test="use-candidate" @click="useCandidate(cand)">
              套用此組合
            </el-button>
          </div>
        </el-card>
        <p v-if="!candidates.candidates.length" class="no-cand" data-test="no-candidate">
          系統無法組出完全相符的組合，請於下方手動分配。
        </p>
      </div>

      <!-- 學生未繳項目速查（期別內優先標示）-->
      <div v-if="candidates?.students?.length" class="students" data-test="student-items">
        <div v-for="stu in candidates.students" :key="stu.student_id" class="stu-block">
          <div class="stu-name">{{ stu.display_name }}（#{{ stu.student_id }}）</div>
          <div v-for="item in stu.items" :key="item.fee_record_id" class="stu-item">
            <el-tag v-if="item.in_bill_period" size="small" type="success" effect="plain">
              本期
            </el-tag>
            <span>{{ item.label }}</span>
            <span class="stu-amt">{{ formatCurrency(item.remaining) }}</span>
            <el-button size="small" text type="primary" @click="addItemPart(stu.student_id, item)">
              加入分配
            </el-button>
          </div>
          <div v-if="stu.prepayment" class="stu-item">
            <el-tag size="small" type="info" effect="plain">預繳</el-tag>
            <span>
              可收預繳（目標 {{ stu.prepayment.target_school_year }}-{{
                stu.prepayment.target_semester
              }}）
            </span>
            <span class="stu-amt">{{ formatCurrency(stu.prepayment.amount) }}</span>
            <el-button
              size="small"
              text
              type="primary"
              data-test="add-prepayment"
              @click="addPrepaymentPart(stu.student_id, stu.prepayment)"
            >
              加入分配
            </el-button>
          </div>
        </div>
      </div>

      <h4>分配明細</h4>
      <div v-for="(part, idx) in parts" :key="idx" class="part-row" data-test="part-row">
        <el-select v-model="part.part_type" style="width: 120px">
          <el-option label="費用單" value="fee_record" />
          <el-option label="預繳款" value="prepayment" />
          <el-option label="非學費" value="non_tuition" />
        </el-select>
        <el-input-number
          v-model="part.amount"
          :min="1"
          :controls="false"
          style="width: 110px"
          placeholder="金額"
        />
        <template v-if="part.part_type === 'fee_record'">
          <el-input-number
            v-model="part.fee_record_id"
            :min="1"
            :controls="false"
            style="width: 130px"
            placeholder="費用單 ID"
          />
        </template>
        <template v-else-if="part.part_type === 'prepayment'">
          <el-input-number
            v-model="part.student_id"
            :min="1"
            :controls="false"
            style="width: 110px"
            placeholder="學生 ID"
          />
          <el-input-number
            v-model="part.target_school_year"
            :min="100"
            :controls="false"
            style="width: 100px"
            placeholder="目標學年"
          />
          <el-select v-model="part.target_semester" style="width: 90px" placeholder="學期">
            <el-option label="上" :value="1" />
            <el-option label="下" :value="2" />
          </el-select>
        </template>
        <template v-else>
          <el-input v-model="part.reason" style="width: 220px" placeholder="非學費原因（必填）" />
        </template>
        <el-button text type="danger" @click="parts.splice(idx, 1)">移除</el-button>
      </div>
      <el-button size="small" data-test="add-part" @click="addPart">＋ 加一筆分配</el-button>

      <div class="total-bar" data-test="alloc-total">
        分配合計：<strong>{{ formatCurrency(partsTotal) }}</strong>
        <el-tag v-if="partsTotal === payment.unallocated" type="success" size="small">
          全額分配
        </el-tag>
        <el-tag v-else-if="partsTotal < payment.unallocated" type="warning" size="small">
          部分分配（餘 {{ formatCurrency(payment.unallocated - partsTotal) }}）
        </el-tag>
        <el-tag v-else type="danger" size="small">超額，請調整</el-tag>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        data-test="alloc-confirm"
        :disabled="!payment || partsTotal === 0 || partsTotal > (payment?.unallocated ?? 0)"
        :loading="submitting"
        @click="submit"
      >
        確認分配
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { allocateCollectionPayment, getCollectionCandidates } from '@/api/fees'
import type { CollectionPaymentRow } from './collectionTypes'

interface CandidatePart {
  part_type: string
  student_id: number
  amount: number
  label: string
  fee_record_id: number | null
  target_school_year: number | null
  target_semester: number | null
}
interface Candidate {
  cross_student: boolean
  total: number
  parts: CandidatePart[]
}
interface StudentItem {
  fee_record_id: number
  label: string
  remaining: number
  fee_type: string | null
  in_bill_period: boolean
}
interface PrepaymentOption {
  target_school_year: number
  target_semester: number
  amount: number
}
interface CandidateStudent {
  student_id: number
  display_name: string
  items: StudentItem[]
  /** 該生於目標學期尚無有效預繳時，BE 回傳可新收的 5,000 預繳選項 */
  prepayment: PrepaymentOption | null
}
interface Candidates {
  level: string
  bill_target_month: string | null
  bill_period: string | null
  reasons: string[]
  candidates: Candidate[]
  students: CandidateStudent[]
}
interface EditablePart {
  part_type: 'fee_record' | 'prepayment' | 'non_tuition'
  amount: number
  fee_record_id?: number
  student_id?: number
  target_school_year?: number
  target_semester?: number
  reason?: string
}

const props = defineProps<{ visible: boolean; payment: CollectionPaymentRow | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; allocated: [] }>()

const candidates = ref<Candidates | null>(null)
const parts = ref<EditablePart[]>([])
const submitting = ref(false)

const partsTotal = computed(() =>
  parts.value.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0),
)
const billPeriodText = computed(() => {
  const c = candidates.value
  if (!c) return ''
  return c.bill_target_month || c.bill_period || ''
})
const levelLabel = computed(
  () =>
    ({
      auto_high: '高信心候選（帳號錨定）',
      needs_review: '需人工確認',
      unmatched: '無法自動媒合',
    })[candidates.value?.level ?? ''] ??
    candidates.value?.level ??
    '',
)
const levelTag = computed(() =>
  candidates.value?.level === 'auto_high'
    ? 'success'
    : candidates.value?.level === 'needs_review'
      ? 'warning'
      : 'info',
)

function partText(p: CandidatePart): string {
  if (p.part_type === 'prepayment') {
    return `學生#${p.student_id} 預繳 ${formatCurrency(p.amount)}（目標 ${p.target_school_year}-${p.target_semester}）`
  }
  return `學生#${p.student_id} ${p.label}（單#${p.fee_record_id}）${formatCurrency(p.amount)}`
}

function useCandidate(cand: Candidate) {
  parts.value = cand.parts.map((p) => ({
    part_type: p.part_type as EditablePart['part_type'],
    amount: p.amount,
    fee_record_id: p.fee_record_id ?? undefined,
    student_id: p.student_id,
    target_school_year: p.target_school_year ?? undefined,
    target_semester: p.target_semester ?? undefined,
  }))
}

function addItemPart(studentId: number, item: StudentItem) {
  parts.value.push({
    part_type: 'fee_record',
    amount: item.remaining,
    fee_record_id: item.fee_record_id,
    student_id: studentId,
  })
}

function addPrepaymentPart(studentId: number, option: PrepaymentOption) {
  parts.value.push({
    part_type: 'prepayment',
    amount: option.amount,
    student_id: studentId,
    target_school_year: option.target_school_year,
    target_semester: option.target_semester,
  })
}

function addPart() {
  parts.value.push({ part_type: 'fee_record', amount: 0 })
}

watch(
  () => [props.visible, props.payment?.id] as const,
  async ([visible, paymentId]) => {
    if (!visible || !paymentId) return
    parts.value = []
    candidates.value = null
    try {
      candidates.value = (await getCollectionCandidates(paymentId)) as unknown as Candidates
      // auto_high 唯一組合直接預填，會計只需按確認
      if (candidates.value?.level === 'auto_high' && candidates.value.candidates.length === 1) {
        useCandidate(candidates.value.candidates[0])
      }
    } catch (e) {
      ElMessage.error(friendlyError('載入媒合候選失敗', e))
    }
  },
  { immediate: true },
)

async function submit() {
  if (!props.payment) return
  submitting.value = true
  try {
    await allocateCollectionPayment(props.payment.id, {
      parts: parts.value.map((p) => ({
        part_type: p.part_type,
        amount: p.amount,
        fee_record_id: p.fee_record_id ?? null,
        student_id: p.student_id ?? null,
        target_school_year: p.target_school_year ?? null,
        target_semester: p.target_semester ?? null,
        reason: p.reason ?? null,
      })),
      allow_partial: partsTotal.value < props.payment.unallocated,
    } as never)
    ElMessage.success('已完成分配')
    emit('allocated')
    emit('update:visible', false)
  } catch (e) {
    ElMessage.error(friendlyError('分配失敗', e))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.pay-summary {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.fee-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.candidates {
  margin-bottom: 12px;
}
.cand-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.reason {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cand-card {
  margin-bottom: 6px;
}
.cand-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.cand-part {
  font-size: 13px;
}
.no-cand {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.students {
  margin-bottom: 12px;
}
.stu-block {
  margin-bottom: 8px;
}
.stu-name {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.stu-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  padding: 2px 0;
}
.stu-amt {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.part-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.total-bar {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
