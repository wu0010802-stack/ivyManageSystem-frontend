<template>
  <div>
    <el-alert
      v-if="settlement.status.value === 'needs_recalc'"
      type="warning"
      :closable="false"
      class="calc-mb"
      title="考勤或設定已變動，部分明細已過期，建議重新計算"
    />

    <!-- 部分失敗持久警示：失敗員工在覆核表中是「不存在」而非標紅，必須在此處理完才前進 -->
    <el-alert
      v-if="calcErrors.length > 0"
      type="error"
      :closable="false"
      class="calc-mb"
      :title="`部分員工薪資計算失敗，共 ${calcErrors.length} 筆——這些員工本月尚無薪資紀錄，請排除原因後重新計算`"
    >
      <ul class="calc-error-list">
        <li v-for="(err, i) in calcErrors" :key="i">
          {{ err.employee_name }}：{{ err.error }}
        </li>
      </ul>
    </el-alert>

    <el-card shadow="never" class="no-hover">
      <div class="calc-body">
        <div>
          <p class="calc-title">計算 {{ q.year }} 年 {{ q.month }} 月全員薪資</p>
          <p class="calc-hint">
            重新計算會保留已存在的手動調整；已封存的紀錄不會被覆蓋。
          </p>
          <p v-if="lastCalculatedAt" class="calc-hint">上次計算：{{ lastCalculatedAt }}</p>
        </div>
        <el-tooltip :content="disabledReason" :disabled="!disabledReason" placement="top">
          <span>
            <el-button
              type="primary"
              size="large"
              :loading="calculating"
              :disabled="!!disabledReason"
              @click="onCalculate"
            >
              計算薪資
            </el-button>
          </span>
        </el-tooltip>
      </div>

      <!-- async 計算進度：背景批次 + 輪詢，取代原本只有一顆 spinner -->
      <div v-if="progress" class="calc-progress">
        <el-progress :percentage="progressPct" :stroke-width="14" :duration="2" />
        <p class="calc-hint calc-progress-label">
          計算中 {{ progress.done }} / {{ progress.total }}
          <span v-if="progress.current">（{{ progress.current }}）</span>
        </p>
      </div>
    </el-card>

    <div class="step-actions">
      <el-button @click="$emit('next')">略過，直接覆核 →</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { calculateAsync, getSalaryCalcJob, getEnrollmentSnapshot, type SalaryCalcJobStatus } from '@/api/salary'
import { hasPermission } from '@/utils/auth'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { SalarySettlement } from '@/composables/useSalarySettlement'

const emit = defineEmits<{ (e: 'next'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()
// P1 #6：計算中旗標為共享 ref（父層 SalarySettleView 若有 provide 則沿用，
// 供父層 disable 年/月選擇器與步驟列避免使用者中途切換製造孤兒輪詢；
// 未 provide 時（如單獨掛載測試）退回本地獨立 ref，行為不變）。
const calculating = inject<Ref<boolean>>('settleCalculating', ref(false))
const calcErrors = ref<{ employee_name?: string; error?: string }[]>([])
// async 計算進度（done/total/current）；null = 未在計算
const progress = ref<{ done: number; total: number; current: string } | null>(null)
const progressPct = computed(() => {
    const p = progress.value
    if (!p || !p.total) return 0
    return Math.min(100, Math.round((p.done / p.total) * 100))
})

// 發放月（2/6/9/12）快照 gate（決策2）：涵蓋月在籍人數快照須全部確認才能計算。
// 前端預先禁用按鈕避免白點；後端 calculate 端點 422 為最終強制關卡。
const isFestivalMonth = computed(() => [2, 6, 9, 12].includes(q.month))
const snapshotPending = ref<[number, number][]>([])

interface SnapshotRow { is_confirmed: boolean }
const checkSnapshotGate = async () => {
    if (!isFestivalMonth.value) return
    try {
        const res = await getEnrollmentSnapshot(q.year, q.month)
        const covered = (res.data as { covered_months?: [number, number][] }).covered_months ?? []
        const pending: [number, number][] = []
        for (const [y, m] of covered) {
            const r = await getEnrollmentSnapshot(y, m)
            const rows = (r.data as { rows?: SnapshotRow[] }).rows ?? []
            if (!rows.length || !rows.every((row) => row.is_confirmed)) pending.push([y, m])
        }
        snapshotPending.value = pending
    } catch {
        // 查詢失敗不阻擋（後端 422 兜底）
    }
}
onMounted(checkSnapshotGate)

const disabledReason = computed(() => {
    if (!hasPermission('SALARY_WRITE')) return '需要薪資寫入權限（目前為唯讀模式）'
    if (settlement.status.value === 'finalized') return '本月已定案，需先於「定案」步驟退回才能重算'
    if (isFestivalMonth.value && snapshotPending.value.length > 0) {
        const labels = snapshotPending.value.map(([y, m]) => `${y}/${m}`).join('、')
        return `發放月須先於「結算前檢查」產生並確認各涵蓋月在籍人數快照（待辦：${labels}）`
    }
    return ''
})

const lastCalculatedAt = computed(() => {
    const first = settlement.records.value[0] as { calculated_at?: string } | undefined
    return first?.calculated_at ? new Date(first.calculated_at).toLocaleString('zh-TW') : ''
})

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// P1 #6：元件卸載 / 使用者切走目前年月後，輪詢應視為孤兒並自行停止——
// 不得在稍後 resolve 時靜默 emit('next') 把使用者導頁或彈出「計算完成」。
class PollCancelledError extends Error {}
let unmounted = false
onUnmounted(() => {
    unmounted = true
})

// 輪詢 job 至 completed/failed；過程中更新 progress。10 分鐘安全上限。
// isStale：每輪檢查一次，為真就立刻停止輪詢（不再發下一次請求），拋 PollCancelledError
// 讓呼叫端靜默丟棄結果。
const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 10 * 60 * 1000
const pollCalcJob = async (jobId: string, isStale: () => boolean): Promise<SalaryCalcJobStatus> => {
    const startedAt = Date.now()
    for (;;) {
        if (isStale()) throw new PollCancelledError()
        const res = await getSalaryCalcJob(jobId)
        if (isStale()) throw new PollCancelledError()
        const job = res.data as SalaryCalcJobStatus
        if (job.status === 'completed' || job.status === 'failed') return job
        progress.value = { done: job.done, total: job.total, current: job.current_employee }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error('計算逾時，請稍後於「覆核」步驟確認結果，或重新整理後重試')
        }
        await delay(POLL_INTERVAL_MS)
    }
}

const onCalculate = async () => {
    try {
        await ElMessageBox.confirm(
            `將計算 ${q.year} 年 ${q.month} 月全員薪資。重算會保留手動調整、跳過已封存紀錄，確定執行？`,
            '計算薪資',
            { confirmButtonText: '執行計算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return // 使用者取消
    }
    calculating.value = true
    calcErrors.value = []
    progress.value = null
    // race guard（P1 #6）：輪詢啟動時記錄當下年/月，resolve 時若元件已卸載或年/月已切走，
    // 一律視為孤兒輪詢結果丟棄——不 emit next、不彈訊息、不 notify 錯誤。
    const startYear = q.year
    const startMonth = q.month
    const isStale = () => unmounted || q.year !== startYear || q.month !== startMonth
    try {
        // 走 async 端點：立即拿 job_id，背景計算 + 輪詢進度，避免大園所同步計算 HTTP 逾時
        const startRes = await calculateAsync(q.year, q.month)
        const started = startRes.data as { job_id: string; total: number }
        progress.value = { done: 0, total: started.total ?? 0, current: '' }

        const job = await pollCalcJob(started.job_id, isStale)
        if (isStale()) return // 孤兒輪詢：靜默丟棄
        if (job.status === 'failed') {
            ElMessage.error(job.error_message || '薪資計算失敗')
            return
        }
        calcErrors.value = job.errors ?? []
        await settlement.refresh()
        if (isStale()) return // refresh 期間也可能已切走
        if (calcErrors.value.length > 0) {
            return // 停留在計算步驟，持久警示列出失敗員工
        }
        ElMessage.success('薪資計算完成')
        emit('next') // 自動進入覆核
    } catch (e) {
        if (e instanceof PollCancelledError || isStale()) return // 孤兒輪詢：靜默丟棄，不 notify
        // 409（同月已有進行中 job / 已封存）走 notify 顯示後端 detail
        notify(e, 'StepCalculate', null, { prefix: '計算失敗' })
    } finally {
        if (!unmounted) {
            calculating.value = false
            progress.value = null
        }
    }
}
</script>

<style scoped>
.calc-mb {
  margin-bottom: var(--space-4);
}

.calc-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.calc-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
}

.calc-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.calc-error-list {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-4);
}

.calc-progress {
  margin-top: var(--space-4);
}

.calc-progress-label {
  margin-top: var(--space-2);
}

.step-actions {
  margin-top: var(--space-6);
  text-align: right;
}
</style>
