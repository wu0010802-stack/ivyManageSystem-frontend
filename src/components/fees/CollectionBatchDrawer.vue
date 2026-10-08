<template>
  <el-drawer
    :model-value="visible"
    title="批次媒合"
    size="720px"
    data-test="collection-batch-drawer"
    @update:model-value="emit('update:visible', $event)"
  >
    <!-- 預覽態 -->
    <template v-if="!result">
      <p class="batch-scope">
        範圍：{{ importId ? `匯入批次 #${importId}` : '全部待媒合' }} ·
        {{ rows.length }} 筆待媒合
      </p>

      <div v-if="loading" class="batch-loading">計算候選中…</div>

      <template v-else>
        <div class="batch-head">
          <el-checkbox v-model="allChecked" data-test="batch-check-all" />
          <strong>{{ autoRows.length }} 筆可一鍵入帳</strong>
          <span class="batch-head__amount">{{ formatCurrency(autoTotal) }}</span>
        </div>

        <div
          v-for="row in autoRows"
          :key="row.payment_id"
          class="batch-row"
          data-test="batch-row"
        >
          <el-checkbox
            :model-value="selected.has(row.payment_id)"
            @update:model-value="toggle(row.payment_id)"
          />
          <span class="batch-row__name">{{ row.student_name }}</span>
          <span class="batch-row__item">{{ partsSummary(row) }}</span>
          <span class="batch-row__amount">{{ formatCurrency(row.gross_amount) }}</span>
        </div>

        <p v-if="truncated" class="batch-truncated" data-test="batch-truncated">
          本次預覽 {{ rows.length }} 筆，另有未列出的筆數；這批處理完再開一次。
        </p>

        <el-collapse v-if="manualRows.length" class="batch-manual">
          <el-collapse-item :title="`另有 ${manualRows.length} 筆需人工處理（不可批次）`">
            <div
              v-for="row in manualRows"
              :key="row.payment_id"
              class="batch-row batch-row--manual"
            >
              <span class="batch-row__name">{{ row.student_name || '—' }}</span>
              <span class="batch-row__reason">{{ row.blocked_reason }}</span>
              <span class="batch-row__amount">{{ formatCurrency(row.gross_amount) }}</span>
            </div>
          </el-collapse-item>
        </el-collapse>
      </template>
    </template>

    <!-- 結果態 -->
    <template v-else>
      <p class="batch-result__ok" data-test="batch-result">
        ✓ 成功 {{ result.succeeded }} 筆 {{ formatCurrency(succeededTotal) }}
      </p>
      <p v-if="result.failed" class="batch-result__fail">✗ 失敗 {{ result.failed }} 筆</p>
      <div
        v-for="r in failedResults"
        :key="r.payment_id"
        class="batch-row batch-row--failed"
      >
        <span class="batch-row__name">{{ nameOf(r.payment_id) }}</span>
        <span class="batch-row__amount">{{ formatCurrency(amountOf(r.payment_id)) }}</span>
        <span class="batch-row__reason">{{ r.error }}</span>
      </div>
    </template>

    <template #footer>
      <template v-if="!result">
        <span class="batch-footer__count">
          已選 {{ selected.size }} 筆 · {{ formatCurrency(selectedTotal) }}
        </span>
        <el-button @click="close">取消</el-button>
        <el-button
          type="primary"
          data-test="batch-submit"
          :disabled="!selected.size"
          :loading="submitting"
          @click="submit"
        >
          確認入帳（{{ selected.size }}）
        </el-button>
      </template>
      <template v-else>
        <el-button data-test="batch-repreview" @click="reload">重新預覽</el-button>
        <el-button type="primary" @click="close">關閉</el-button>
      </template>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * SPEC-022 §4.1 批次媒合面板。
 *
 * 只有 auto_high（帳號錨定唯一學生、期別內未繳恰可完全組成）進主清單並預設全勾；
 * needs_review／unmatched 折疊呈現且不提供操作——要編輯就關掉本面板走單筆，
 * 在 drawer 裡疊 dialog 的狀態同步成本不值得。
 *
 * 送出只帶 payment_id 與預覽時取得的 candidate_digest，實際寫什麼由後端在鎖內
 * 重算候選決定（SPEC-022 §3.2）。前端不計算指紋。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import {
  batchAllocateCollectionPayments,
  batchCollectionCandidates,
} from '@/api/fees'

interface BatchPart {
  part_type: string
  student_id: number
  amount: number
  label: string
  fee_record_id: number | null
}
interface BatchRow {
  payment_id: number
  customer_paid_date: string
  channel: string
  gross_amount: number
  fee_amount: number
  collection_suffix: string | null
  bill_period: string | null
  level: string
  student_id: number | null
  student_name: string | null
  parts: BatchPart[]
  candidate_digest: string | null
  blocked_reason: string | null
}
interface BatchResultItem {
  payment_id: number
  ok: boolean
  receipt_id: number | null
  allocated_total: number | null
  error: string | null
}
interface BatchResult {
  results: BatchResultItem[]
  succeeded: number
  failed: number
}

const props = defineProps<{ visible: boolean; importId?: number | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; done: [] }>()

const rows = ref<BatchRow[]>([])
const truncated = ref(false)
const loading = ref(false)
const submitting = ref(false)
const selected = ref<Set<number>>(new Set())
const result = ref<BatchResult | null>(null)

const autoRows = computed(() => rows.value.filter((r) => r.level === 'auto_high'))
const manualRows = computed(() => rows.value.filter((r) => r.level !== 'auto_high'))
const autoTotal = computed(() => autoRows.value.reduce((s, r) => s + r.gross_amount, 0))
const selectedTotal = computed(() =>
  autoRows.value
    .filter((r) => selected.value.has(r.payment_id))
    .reduce((s, r) => s + r.gross_amount, 0),
)
const allChecked = computed<boolean>({
  get: () => autoRows.value.length > 0 && selected.value.size === autoRows.value.length,
  set: (v) => {
    selected.value = v ? new Set(autoRows.value.map((r) => r.payment_id)) : new Set()
  },
})
const failedResults = computed(() => (result.value?.results ?? []).filter((r) => !r.ok))
const succeededTotal = computed(() =>
  (result.value?.results ?? []).reduce((s, r) => s + (r.allocated_total ?? 0), 0),
)

function toggle(id: number) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}
function partsSummary(row: BatchRow): string {
  return row.parts.map((p) => p.label).join('＋')
}
function rowOf(id: number): BatchRow | undefined {
  return rows.value.find((r) => r.payment_id === id)
}
function nameOf(id: number): string {
  return rowOf(id)?.student_name ?? `代收繳費 #${id}`
}
function amountOf(id: number): number {
  return rowOf(id)?.gross_amount ?? 0
}

async function reload() {
  loading.value = true
  result.value = null
  try {
    const data = (await batchCollectionCandidates({
      import_id: props.importId ?? null,
      limit: 200,
    } as never)) as unknown as { items: BatchRow[]; truncated: boolean }
    rows.value = data.items ?? []
    truncated.value = data.truncated ?? false
    selected.value = new Set(
      rows.value.filter((r) => r.level === 'auto_high').map((r) => r.payment_id),
    )
  } catch (e) {
    ElMessage.error(friendlyError('載入批次候選失敗', e))
  } finally {
    loading.value = false
  }
}

async function submit() {
  submitting.value = true
  try {
    const items = autoRows.value
      .filter((r) => selected.value.has(r.payment_id) && r.candidate_digest)
      .map((r) => ({
        payment_id: r.payment_id,
        expected_digest: r.candidate_digest as string,
      }))
    result.value = (await batchAllocateCollectionPayments({
      items,
    } as never)) as unknown as BatchResult
    emit('done')
  } catch (e) {
    ElMessage.error(friendlyError('批次入帳失敗', e))
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('update:visible', false)
}

watch(
  () => [props.visible, props.importId] as const,
  ([visible]) => {
    if (visible) reload()
  },
  { immediate: true },
)
</script>

<style scoped>
.batch-scope { color: var(--el-text-color-secondary); margin: 0 0 12px; }
.batch-head {
  display: flex; align-items: center; gap: 10px; padding: 12px;
  background: var(--el-fill-color-light); border-radius: 6px; margin-bottom: 12px;
}
.batch-head__amount { margin-left: auto; font-weight: 600; }
.batch-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.batch-row__item, .batch-row__reason {
  color: var(--el-text-color-secondary); font-size: 13px;
}
.batch-row__amount { margin-left: auto; font-variant-numeric: tabular-nums; }
.batch-row--failed .batch-row__reason { color: var(--el-color-danger); }
.batch-truncated { color: var(--el-color-warning); font-size: 13px; margin: 12px 0 0; }
.batch-manual { margin-top: 16px; }
.batch-result__ok { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
.batch-result__fail { color: var(--el-color-danger); margin: 0 0 12px; }
.batch-footer__count { margin-right: auto; color: var(--el-text-color-secondary); }
</style>
