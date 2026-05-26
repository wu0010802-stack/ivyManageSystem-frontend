<!-- src/components/leave/LeaveQuotaExpiryTab.vue -->
<script setup lang="ts">
/**
 * HR Leave Quota Expiry 管理頁籤：
 * - 即將到期補休（30 天內 expires_at 的 active grant）
 * - 即將滿週年員工（30 天內 hire_date anniversary）
 * - 折算歷史（unused_leave_payout_log）
 * - 手動 trigger scheduler（含 try_scheduler_lock 防並發）
 */
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listUpcomingGrants,
  listUpcomingAnniversaries,
  listPayoutHistory,
  runSchedulerNow,
} from '@/api/leaveQuotaExpiry'

const grants = ref<Array<Record<string, unknown>>>([])
const anniversaries = ref<Array<Record<string, unknown>>>([])
const logs = ref<Array<Record<string, unknown>>>([])
const loading = ref(false)
const running = ref(false)
const days = ref(30)

const refresh = async () => {
  loading.value = true
  try {
    const [up, anv, hist] = await Promise.all([
      listUpcomingGrants(days.value),
      listUpcomingAnniversaries(days.value),
      listPayoutHistory(50),
    ])
    grants.value = (up.data as { grants: Array<Record<string, unknown>> }).grants
    anniversaries.value = (anv.data as { anniversaries: Array<Record<string, unknown>> }).anniversaries
    logs.value = (hist.data as { logs: Array<Record<string, unknown>> }).logs
  } catch (_e) {
    ElMessage.error('讀取失敗')
  } finally {
    loading.value = false
  }
}

const runNow = async () => {
  try {
    await ElMessageBox.confirm(
      '確認手動 trigger 結算？已啟用 scheduler 後通常無需手動跑。',
      '確認手動結算',
      { type: 'warning' },
    )
  } catch {
    return
  }
  running.value = true
  try {
    const res = await runSchedulerNow()
    const data = res.data as { comp_summary?: Record<string, unknown>; cutover_summary?: Record<string, unknown> }
    ElMessage.success(
      `補休結算 ${data.comp_summary?.paid_employees ?? 0} 人 / 特休 cutover ${data.cutover_summary?.paid_employees ?? 0} 人`,
    )
    await refresh()
  } catch (e: unknown) {
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 409) {
      ElMessage.warning('scheduler 今日已跑過或正在執行，請稍後再試')
    } else {
      ElMessage.error('結算失敗')
    }
  } finally {
    running.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="leave-quota-expiry-tab">
    <div class="header">
      <el-input-number v-model="days" :min="1" :max="365" size="small" />
      <span class="hint">天內</span>
      <el-button type="primary" size="small" :loading="loading" @click="refresh">重新整理</el-button>
      <el-button type="warning" size="small" :loading="running" data-testid="run-now-btn" @click="runNow">
        手動結算
      </el-button>
    </div>

    <el-tabs class="sub-tabs">
      <el-tab-pane label="即將到期補休">
        <el-table :data="grants" border stripe size="small">
          <el-table-column prop="grant_id" label="ID" width="80" />
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="granted_hours" label="發放" width="80" />
          <el-table-column prop="consumed_hours" label="已用" width="80" />
          <el-table-column prop="unexpired_hours" label="待領" width="80" />
          <el-table-column prop="granted_at" label="加班日" width="120" />
          <el-table-column prop="expires_at" label="到期日" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="即將滿週年">
        <el-table :data="anniversaries" border stripe size="small">
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="hire_date" label="到職日" width="120" />
          <el-table-column prop="next_anniversary" label="下個週年" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="折算歷史">
        <el-table :data="logs" border stripe size="small">
          <el-table-column prop="log_id" label="ID" width="80" />
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="source_type" label="來源" width="180">
            <template #default="{ row }">
              <el-tag :type="row.source_type === 'comp_grant_expiry' ? 'warning' : 'success'" size="small">
                {{ row.source_type === 'comp_grant_expiry' ? '補休到期' : (row.source_type === 'annual_anniversary' ? '特休週年' : row.source_type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="hours" label="時數" width="80" />
          <el-table-column prop="amount" label="金額" width="100">
            <template #default="{ row }">${{ Number(row.amount).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="salary_period" label="入帳月" width="100" />
          <el-table-column prop="wage_basis_date" label="時薪基準" width="120" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.leave-quota-expiry-tab { padding: 12px; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; }
.sub-tabs { margin-top: 8px; }
</style>
