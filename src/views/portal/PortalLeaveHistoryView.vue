<script setup lang="ts">
/**
 * 員工自助補休歷史明細頁。
 * - 補休發放紀錄（grants）含全狀態（active / expired / revoked）
 * - 折算歷史（payout logs）含 3 來源 type
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyCompLeaveGrants, getMyPayoutHistory } from '@/api/portalLeaveQuotaExpiry'

interface CompLeaveGrant {
  grant_id: number
  granted_hours: number
  consumed_hours: number
  remaining_hours: number
  granted_at: string
  expires_at: string
  status: string
  expired_at: string | null
}

interface PayoutLog {
  log_id: number
  source_type: string
  hours: number
  hourly_wage: number
  amount: number
  wage_basis_date: string
  salary_period: string
  meta: Record<string, unknown>
}

const grants = ref<CompLeaveGrant[]>([])
const logs = ref<PayoutLog[]>([])
const loading = ref(false)

const STATUS_LABEL: Record<string, string> = {
  active: '有效',
  expired: '已到期',
  revoked: '已撤銷',
}

const SOURCE_LABEL: Record<string, string> = {
  comp_grant_expiry: '補休到期',
  annual_anniversary: '特休週年',
  offboarding: '離職結算',
}

const load = async () => {
  loading.value = true
  try {
    const [g, h] = await Promise.all([getMyCompLeaveGrants(), getMyPayoutHistory()])
    grants.value = (g.data as { grants: CompLeaveGrant[] }).grants
    logs.value = (h.data as { logs: PayoutLog[] }).logs
  } catch {
    ElMessage.error('讀取補休歷史失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'expired') return 'warning'
  return 'info'
}

function sourceTagType(sourceType: string): 'warning' | 'danger' | 'success' {
  if (sourceType === 'comp_grant_expiry') return 'warning'
  if (sourceType === 'offboarding') return 'danger'
  return 'success'
}

function money(v: number): string {
  return `$${Number(v).toLocaleString()}`
}
</script>

<template>
  <div class="portal-leave-history">
    <h2 class="page-title">補休歷史明細</h2>

    <el-tabs type="border-card">
      <el-tab-pane label="補休發放紀錄">
        <el-table
          :data="grants"
          v-loading="loading"
          border
          stripe
          empty-text="尚無補休紀錄"
        >
          <el-table-column prop="granted_at" label="發放日" width="120" />
          <el-table-column label="時數">
            <template #default="{ row }">
              <span>{{ (row as CompLeaveGrant).granted_hours }}h</span>
              <span class="hint">
                （已用 {{ (row as CompLeaveGrant).consumed_hours }}h，剩 {{ (row as CompLeaveGrant).remaining_hours }}h）
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="expires_at" label="到期日" width="120" />
          <el-table-column label="狀態" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTagType((row as CompLeaveGrant).status)" size="small">
                {{ STATUS_LABEL[(row as CompLeaveGrant).status] ?? (row as CompLeaveGrant).status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="expired_at" label="結算時間" width="180" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="折算歷史">
        <el-table
          :data="logs"
          v-loading="loading"
          border
          stripe
          empty-text="尚無折算紀錄"
        >
          <el-table-column prop="salary_period" label="入帳月" width="100" />
          <el-table-column label="來源" width="130">
            <template #default="{ row }">
              <el-tag :type="sourceTagType((row as PayoutLog).source_type)" size="small">
                {{ SOURCE_LABEL[(row as PayoutLog).source_type] ?? (row as PayoutLog).source_type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="hours" label="時數" width="80" />
          <el-table-column label="金額" width="120" align="right">
            <template #default="{ row }">
              {{ money((row as PayoutLog).amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="wage_basis_date" label="時薪基準日" width="130" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.portal-leave-history {
  padding: 16px;
}
.page-title {
  margin: 0 0 16px;
  font-size: var(--text-2xl, 1.5rem);
  font-weight: 700;
  color: var(--pt-text-strong, #1a1a2e);
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 4px;
}
</style>
