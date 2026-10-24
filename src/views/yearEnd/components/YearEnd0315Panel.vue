<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listYearEndAdjustments, recalcYearEnd0315, settleYearEndAdjustment } from '@/api/yearEnd'
import type { Schema } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { moneyInt } from '@/utils/currency'
import {
  adjustmentStatusLabel,
  adjustmentStatusTag,
  diffDirection,
  diffDirectionLabel,
  summarizePendingAdjustments,
  toAmount,
  type AdjustmentStatus,
} from '../yearEnd0315'

// 義華第二批 yearend2：3/15 以註冊口徑重算下學期比率，對已核定結算單產生「多退少補」差額。
// 差額不經月薪：正數由會計表外補發、負數人工追回；處理完由會計標記 SETTLED／WAIVED。
// 權限：檢視 YEAR_END_READ、重算 YEAR_END_FINALIZE、標記 YEAR_END_ACCOUNTING（後端為準）。

type Adjustment = Schema<'YearEndAdjustmentOut'>
type RecalcResult = Schema<'Recalc0315ResultOut'>

const props = defineProps<{ cycleId: number }>()

const canRead = computed(() => hasPermission('YEAR_END_READ'))
const canRecalc = computed(() => hasPermission('YEAR_END_FINALIZE'))
const canSettle = computed(() => hasPermission('YEAR_END_ACCOUNTING'))

const rows = ref<Adjustment[]>([])
const loading = ref(false)
const loadError = ref(false)
const recalcing = ref(false)
const lastResult = ref<RecalcResult | null>(null)
const busyId = ref<number | null>(null)

const summary = computed(() => summarizePendingAdjustments(rows.value))

async function load() {
  if (!canRead.value) return
  loading.value = true
  try {
    const res = await listYearEndAdjustments(props.cycleId)
    rows.value = res.data
    loadError.value = false
  } catch (e) {
    loadError.value = true
    ElMessage.error(apiError(e, '載入 3/15 重算差額失敗'))
  } finally {
    loading.value = false
  }
}

async function onRecalc() {
  try {
    await ElMessageBox.confirm(
      '將以 3/15 註冊口徑重算下學期比率，對已核定的結算單產生多退少補差額（不改動已核定金額）。'
      + '請先確認註冊人數口徑已涵蓋當年 3 月、3 月月費單已匯入。確定重算？',
      '3/15 重算',
      { confirmButtonText: '確定重算', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  recalcing.value = true
  try {
    const res = await recalcYearEnd0315(props.cycleId)
    lastResult.value = res.data
    ElMessage.success(`重算完成：產生／更新 ${res.data.adjustments.length} 筆差額`)
    await load()
  } catch (e) {
    // 422＝3/15 未到或未落在註冊口徑：直接顯示後端 detail
    ElMessage.error(apiError(e, '3/15 重算失敗'))
  } finally {
    recalcing.value = false
  }
}

async function onMark(row: Adjustment, status: AdjustmentStatus) {
  let note: string | null = row.note ?? null
  if (status !== 'PENDING') {
    try {
      const result = await ElMessageBox.prompt(
        status === 'SETTLED'
          ? `${row.employee_name ?? ''} 差額 ${moneyInt(toAmount(row.diff_amount))} 已處理（補發或追回完成），可填備註：`
          : `${row.employee_name ?? ''} 差額 ${moneyInt(toAmount(row.diff_amount))} 免補／免追，請填原因：`,
        status === 'SETTLED' ? '標記已處理' : '標記免追／免補',
        {
          confirmButtonText: '確定',
          cancelButtonText: '取消',
          inputValue: row.note ?? '',
          inputValidator: (v: string) => {
            if (v && v.length > 500) return '備註最多 500 字'
            if (status === 'WAIVED' && !v.trim()) return '請填寫免追／免補原因'
            return true
          },
        },
      )
      note = (result as { value: string }).value.trim() || null
    } catch {
      return
    }
  }
  busyId.value = row.id
  try {
    const res = await settleYearEndAdjustment(row.id, { status, note })
    const idx = rows.value.findIndex((r) => r.id === row.id)
    if (idx >= 0) rows.value.splice(idx, 1, res.data)
    ElMessage.success(`已標記為「${adjustmentStatusLabel(status)}」`)
  } catch (e) {
    ElMessage.error(apiError(e, '標記失敗'))
  } finally {
    busyId.value = null
  }
}

function diffClass(diff: string): string {
  const d = diffDirection(diff)
  return d === 'payout' ? 'diff-payout' : d === 'recovery' ? 'diff-recovery' : ''
}

onMounted(load)

defineExpose({ rows, load, onRecalc, onMark, lastResult })
</script>

<template>
  <el-card v-if="canRead" class="ye-0315" data-test="year-end-0315-panel">
    <template #header>
      <div class="ye-0315__header">
        <span class="ye-0315__title">3/15 重算（多退少補）</span>
        <el-button
          v-if="canRecalc"
          type="primary"
          size="small"
          :loading="recalcing"
          data-test="recalc-0315-button"
          @click="onRecalc"
        >3/15 重算</el-button>
      </div>
    </template>

    <p class="ye-0315__hint">
      差額不經月薪：正數由會計以表外轉帳補發，負數由人工追回（不可從月薪扣）。處理完成後標記「已處理」或「免追／免補」。
    </p>

    <el-alert
      v-if="lastResult"
      type="info"
      :closable="false"
      class="ye-0315__result"
      data-test="recalc-0315-result"
    >
      <template #title>
        基準日 {{ lastResult.basis_date }}：產生／更新 {{ lastResult.adjustments.length }} 筆差額，
        補發合計 {{ moneyInt(toAmount(lastResult.total_payout)) }}、追回合計 {{ moneyInt(Math.abs(toAmount(lastResult.total_recovery))) }}；
        略過未核定 {{ lastResult.skipped_not_finalized }} 筆、已處理 {{ lastResult.skipped_settled }} 筆
      </template>
      <div v-if="lastResult.school_rate_second_new">下學期全校比率（新）：{{ lastResult.school_rate_second_new }}</div>
      <ul v-if="lastResult.warnings.length" class="ye-0315__warnings">
        <li v-for="w in lastResult.warnings" :key="w">{{ w }}</li>
      </ul>
    </el-alert>

    <div v-if="loadError" class="ye-0315__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>

    <p v-if="rows.length" class="ye-0315__summary" data-test="adjustment-summary">
      待處理 {{ summary.pendingCount }} 筆：待補發 {{ moneyInt(summary.pendingPayout) }}、待追回 {{ moneyInt(summary.pendingRecovery) }}
    </p>

    <el-table v-loading="loading" :data="rows" size="small" stripe empty-text="尚無 3/15 重算差額">
      <el-table-column prop="employee_name" label="員工" min-width="100" />
      <el-table-column label="已領" width="100" align="right">
        <template #default="{ row }">{{ moneyInt(toAmount(row.paid_amount)) }}</template>
      </el-table-column>
      <el-table-column label="應領（重算）" width="110" align="right">
        <template #default="{ row }">{{ moneyInt(toAmount(row.recalculated_amount)) }}</template>
      </el-table-column>
      <el-table-column label="差額" width="150" align="right">
        <template #default="{ row }">
          <span :class="diffClass(row.diff_amount)">{{ moneyInt(toAmount(row.diff_amount)) }}</span>
          <div class="ye-0315__sub">{{ diffDirectionLabel(row.diff_amount) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="adjustmentStatusTag(row.status)" size="small">{{ adjustmentStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="備註" min-width="140" />
      <el-table-column v-if="canSettle" label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING'">
            <el-button link size="small" type="primary" :loading="busyId === row.id" @click="onMark(row, 'SETTLED')">已處理</el-button>
            <el-button link size="small" :loading="busyId === row.id" @click="onMark(row, 'WAIVED')">免追／免補</el-button>
          </template>
          <el-button v-else link size="small" :loading="busyId === row.id" @click="onMark(row, 'PENDING')">改回待處理</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.ye-0315 {
  margin-top: var(--space-4, 16px);
}
.ye-0315__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ye-0315__title {
  font-weight: 600;
}
.ye-0315__hint,
.ye-0315__summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 0 0 var(--space-2, 8px);
}
.ye-0315__summary {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.ye-0315__result {
  margin-bottom: var(--space-3, 12px);
}
.ye-0315__warnings {
  margin: 4px 0 0;
  padding-left: 18px;
}
.ye-0315__error {
  color: var(--el-color-danger);
  font-size: 13px;
  margin-bottom: var(--space-2, 8px);
}
.ye-0315__sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.diff-payout {
  color: var(--el-color-success);
  font-weight: 600;
}
.diff-recovery {
  color: var(--el-color-danger);
  font-weight: 600;
}
</style>
