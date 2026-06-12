<template>
  <div>
    <!-- 摘要卡 -->
    <div class="finalize-stats">
      <StatCard label="總應發" :value="money(totalGross)" :icon="Money" color="primary" />
      <StatCard label="總實發" :value="money(totalNet)" :icon="Money" color="success" />
      <StatCard label="人數" :value="`${settlement.records.value.length} 人`" :icon="User" color="info" />
      <StatCard
        label="需注意"
        :value="`${settlement.anomalies.value.size} 筆`"
        :icon="WarningFilled"
        :color="settlement.anomalies.value.size > 0 ? 'warning' : 'success'"
      />
    </div>

    <el-card shadow="never" class="no-hover finalize-card">
      <div class="finalize-body">
        <div>
          <p class="finalize-title">
            整月定案：封存 {{ q.year }} 年 {{ q.month }} 月（已封存 {{ settlement.finalizedCount.value }} / {{ settlement.records.value.length }}）
          </p>
          <p class="finalize-hint">
            封存後不可再計算或調整；轉帳名冊只會匯出已封存的紀錄。
            若有在職員工缺紀錄或明細過期，系統會擋下並列出原因。
          </p>
        </div>
        <el-tooltip :content="disabledReason" :disabled="!disabledReason" placement="top">
          <span>
            <el-button
              type="primary"
              size="large"
              :loading="finalizing"
              :disabled="!!disabledReason"
              @click="onFinalize"
            >
              整月定案
            </el-button>
          </span>
        </el-tooltip>
      </div>

      <!-- 409 完整性問題清單 -->
      <el-alert v-if="blockers.length > 0" type="error" :closable="false" class="finalize-blockers">
        <p class="blocker-title">定案被擋下：</p>
        <ul>
          <li v-for="(b, i) in blockers" :key="i">{{ b }}</li>
        </ul>
        <el-button
          v-if="canForceFinalize"
          type="danger"
          size="small"
          plain
          @click="onForceFinalize"
        >
          強制封存（跳過上述問題，需填理由）
        </el-button>
        <p v-else class="blocker-note">強制封存需要財務覆核權限（ACTIVITY_PAYMENT_APPROVE）。</p>
      </el-alert>
    </el-card>

    <!-- 已封存紀錄（個別退回） -->
    <el-card v-if="finalizedRecords.length > 0" shadow="never" class="no-hover">
      <h4 class="finalized-title">已封存紀錄（{{ finalizedRecords.length }} 筆）</h4>
      <el-table :data="finalizedRecords" border stripe max-height="320">
        <el-table-column prop="employee_name" label="姓名" width="120" />
        <el-table-column label="實領" width="140" align="right" class-name="num-cell">
          <template #default="scope">{{ money(scope.row.net_pay) }}</template>
        </el-table-column>
        <el-table-column prop="finalized_by" label="封存人" width="120" />
        <el-table-column label="封存時間" min-width="160">
          <template #default="scope">{{ formatTime(scope.row.finalized_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button
              v-if="canWriteSalary"
              type="danger"
              size="small"
              link
              :loading="unfinalizingId === scope.row.id"
              @click="onUnfinalize(scope.row)"
            >
              退回
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div class="step-actions">
      <el-button
        type="primary"
        :disabled="settlement.status.value !== 'finalized'"
        @click="$emit('next')"
      >
        下一步：匯出轉帳 →
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Money, User, WarningFilled } from '@element-plus/icons-vue'
import StatCard from '@/components/common/StatCard.vue'
import { finalizeMonth, unfinalizeSalary } from '@/api/salary'
import { hasPermission } from '@/utils/auth'
import { money } from '@/utils/format'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { SalarySettlement, SettlementRecord } from '@/composables/useSalarySettlement'

defineEmits<{ (e: 'next'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()

const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))
const canForceFinalize = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

const totalGross = computed(() =>
    settlement.records.value.reduce((s, r) => s + Number(r.gross_salary || 0), 0),
)
const totalNet = computed(() =>
    settlement.records.value.reduce((s, r) => s + Number(r.net_salary || 0), 0),
)
const finalizedRecords = computed(() => settlement.records.value.filter((r) => r.is_finalized))

const disabledReason = computed(() => {
    if (!canWriteSalary.value) return '需要薪資寫入權限（目前為唯讀模式）'
    if (settlement.records.value.length === 0) return '本月尚未計算薪資'
    if (settlement.status.value === 'finalized') return '本月已全數封存'
    return ''
})

const finalizing = ref(false)
const blockers = ref<string[]>([])

const runFinalize = async (force = false, forceReason = '') => {
    finalizing.value = true
    try {
        const res = await finalizeMonth({
            year: q.year,
            month: q.month,
            ...(force ? { force: true, force_reason: forceReason } : {}),
        })
        blockers.value = []
        const d = res.data
        const skipped = [...(d.skipped_missing ?? []), ...(d.skipped_stale ?? [])]
        ElMessage.success(skipped.length > 0 ? `${d.message}（跳過 ${skipped.length} 筆）` : d.message)
        await settlement.refresh()
    } catch (error) {
        const e = error as { response?: { status?: number; data?: { detail?: unknown } } }
        if (e?.response?.status === 409) {
            const detail = e.response?.data?.detail
            blockers.value = Array.isArray(detail) ? detail.map(String) : [String(detail ?? '存在完整性問題，無法定案')]
        } else {
            notify(error, 'StepFinalize.finalize', null, { prefix: '定案失敗' })
        }
    } finally {
        finalizing.value = false
    }
}

const onFinalize = async () => {
    try {
        await ElMessageBox.confirm(
            `將封存 ${q.year} 年 ${q.month} 月共 ${settlement.records.value.length - settlement.finalizedCount.value} 筆未封存薪資，封存後不可再調整。確定定案？`,
            '整月定案',
            { confirmButtonText: '確定封存', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    await runFinalize()
}

const onForceFinalize = async () => {
    let reason: string
    try {
        const res = await ElMessageBox.prompt(
            '強制封存會跳過缺漏員工與過期明細，被跳過清單將寫入稽核紀錄。請輸入理由（至少 10 字）：',
            '強制封存',
            {
                confirmButtonText: '強制封存',
                cancelButtonText: '取消',
                type: 'warning',
                inputValidator: (v: string) => (v ?? '').trim().length >= 10 || '理由至少 10 字',
            },
        )
        reason = (res as { value: string }).value
    } catch {
        return
    }
    await runFinalize(true, reason.trim())
}

// in-flight 守衛：await 期間重複觸發會開第二個 prompt（後端會拒，但 UX 噪音）
const unfinalizingId = ref<number | null>(null)

const onUnfinalize = async (row: SettlementRecord) => {
    if (unfinalizingId.value !== null) return
    unfinalizingId.value = row.id
    let reason: string
    try {
        const res = await ElMessageBox.prompt(
            `退回 ${row.employee_name} 的封存（高風險，會寫入稽核）。請輸入理由（至少 10 字）：`,
            '退回封存',
            {
                confirmButtonText: '退回',
                cancelButtonText: '取消',
                type: 'warning',
                inputValidator: (v: string) => (v ?? '').trim().length >= 10 || '理由至少 10 字',
            },
        )
        reason = (res as { value: string }).value
    } catch {
        unfinalizingId.value = null
        return
    }
    try {
        await unfinalizeSalary(row.id, reason.trim())
        ElMessage.success(`已退回 ${row.employee_name} 的封存`)
        await settlement.refresh()
    } catch (error) {
        notify(error, 'StepFinalize.unfinalize', null, { prefix: '退回失敗' })
    } finally {
        unfinalizingId.value = null
    }
}

const formatTime = (value: string | null | undefined) => {
    if (!value) return '-'
    return new Date(value).toLocaleString('zh-TW')
}
</script>

<style scoped>
.finalize-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.finalize-card {
  margin-bottom: var(--space-4);
}

.finalize-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.finalize-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
}

.finalize-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.finalize-blockers {
  margin-top: var(--space-4);
}

.blocker-title {
  margin: 0 0 var(--space-1);
  font-weight: 600;
}

.blocker-note {
  margin: var(--space-2) 0 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.finalized-title {
  margin: 0 0 var(--space-3);
}

.step-actions {
  margin-top: var(--space-6);
  text-align: right;
}

@media (max-width: 768px) {
  .finalize-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
