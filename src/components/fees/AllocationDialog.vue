<template>
  <el-dialog
    :model-value="visible"
    :title="`分配銀行交易 #${txn?.id ?? ''}`"
    width="720px"
    data-test="alloc-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="txn">
      <div class="txn-summary">
        <span>{{ txn.posting_date }}</span>
        <span>末四碼：{{ txn.collection_suffix || '—' }}</span>
        <strong>{{ formatCurrency(txn.amount) }}</strong>
        <el-tag size="small">未分配 {{ formatCurrency(txn.unallocated) }}</el-tag>
      </div>

      <!-- 系統候選 -->
      <div v-if="candidates" class="candidates" data-test="alloc-candidates">
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
            <el-button
              size="small"
              data-test="use-candidate"
              @click="useCandidate(cand)"
            >
              套用此組合
            </el-button>
          </div>
        </el-card>
      </div>

      <!-- 分配編輯器 -->
      <h4>分配明細（可拆多名學生／多用途）</h4>
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
      <el-button size="small" @click="addPart" data-test="add-part">＋ 加一筆分配</el-button>

      <div class="total-bar" data-test="alloc-total">
        分配合計：<strong>{{ formatCurrency(partsTotal) }}</strong>
        <el-tag v-if="partsTotal === txn.unallocated" type="success" size="small">全額分配</el-tag>
        <el-tag v-else-if="partsTotal < txn.unallocated" type="warning" size="small">
          部分分配（餘 {{ formatCurrency(txn.unallocated - partsTotal) }}）
        </el-tag>
        <el-tag v-else type="danger" size="small">超額，請調整</el-tag>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        data-test="alloc-confirm"
        :disabled="!txn || partsTotal === 0 || partsTotal > (txn?.unallocated ?? 0)"
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
import { allocateTransaction, getTransactionCandidates } from '@/api/fees'

interface TxnRow {
  id: number
  posting_date: string
  amount: number
  unallocated: number
  collection_suffix: string | null
}
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
interface Candidates {
  level: string
  reasons: string[]
  candidates: Candidate[]
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

const props = defineProps<{ visible: boolean; txn: TxnRow | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; allocated: [] }>()

const candidates = ref<Candidates | null>(null)
const parts = ref<EditablePart[]>([])
const submitting = ref(false)

const partsTotal = computed(() =>
  parts.value.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0),
)
const levelLabel = computed(
  () =>
    ({
      auto_high: '高信心候選',
      needs_review: '需人工確認',
      unmatched: '無法自動媒合',
      non_tuition: '非學費',
    })[candidates.value?.level ?? ''] ?? candidates.value?.level ?? '',
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

function addPart() {
  parts.value.push({ part_type: 'fee_record', amount: 0 })
}

watch(
  () => [props.visible, props.txn?.id] as const,
  async ([visible, txnId]) => {
    if (!visible || !txnId) return
    parts.value = []
    candidates.value = null
    try {
      candidates.value = (await getTransactionCandidates(txnId)) as Candidates
    } catch (e) {
      ElMessage.error(friendlyError('載入媒合候選失敗', e))
    }
  },
  { immediate: true },
)

async function submit() {
  if (!props.txn) return
  submitting.value = true
  try {
    await allocateTransaction(props.txn.id, {
      parts: parts.value.map((p) => {
        if (p.part_type === 'fee_record') {
          return {
            part_type: p.part_type,
            amount: p.amount,
            fee_record_id: p.fee_record_id as number,
          }
        }
        if (p.part_type === 'prepayment') {
          return {
            part_type: p.part_type,
            amount: p.amount,
            student_id: p.student_id as number,
            target_school_year: p.target_school_year as number,
            target_semester: p.target_semester as number,
          }
        }
        return {
          part_type: p.part_type,
          amount: p.amount,
          reason: p.reason as string,
        }
      }),
      allow_partial: partsTotal.value < props.txn.unallocated,
    })
    ElMessage.success('分配完成')
    emit('update:visible', false)
    emit('allocated')
  } catch (e) {
    ElMessage.error(friendlyError('分配失敗', e))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.txn-summary {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
.cand-card {
  margin-bottom: 8px;
}
.cand-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cand-part {
  font-size: 13px;
}
.cand-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.reason {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.part-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.total-bar {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
