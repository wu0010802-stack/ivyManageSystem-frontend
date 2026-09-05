<script setup lang="ts">
/**
 * 員工自助補休歷史明細頁。
 * - 補休發放紀錄（grants）含全狀態（active / expired / revoked）
 * - 折算歷史（payout logs）含 3 來源 type
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyCompLeaveGrants, getMyPayoutHistory } from '@/api/portalLeaveQuotaExpiry'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

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

const { isMobile } = useIsMobile()

const grantCardColumns = [
  {
    label: '時數',
    prop: 'granted_hours',
    formatter: (i: Record<string, unknown>) =>
      `${i.granted_hours}h（已用 ${i.consumed_hours}h，剩 ${i.remaining_hours}h）`,
  },
  { label: '到期日', prop: 'expires_at' },
  { label: '狀態', prop: 'status' },          // tag → #cell-status
  { label: '結算時間', prop: 'expired_at' },
]

const logCardColumns = [
  { label: '來源', prop: 'source_type' },     // tag → #cell-source_type
  { label: '時數', prop: 'hours', formatter: (i: Record<string, unknown>) => `${i.hours}h` },
  { label: '金額', prop: 'amount', formatter: (i: Record<string, unknown>) => money(i.amount as number) },
  { label: '時薪基準日', prop: 'wage_basis_date' },
]
</script>

<template>
  <div class="portal-leave-history">
    <PortalPageHeader title="補休歷史明細" />

    <el-tabs type="border-card">
      <el-tab-pane label="補休發放紀錄">
        <!-- 桌機表格；手機用卡片（5 欄含「已用 Xh，剩 Yh」長文字，390px 讀不了，P2-06） -->
        <el-table
          v-if="!isMobile"
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

        <AdminListCards
          v-else
          :items="grants as unknown as Record<string, unknown>[]"
          :columns="grantCardColumns"
          row-key="grant_id"
          :loading="loading"
          empty-text="尚無補休紀錄"
        >
          <template #title="{ item }">{{ item.granted_at }} 發放 {{ item.granted_hours }}h</template>
          <template #cell-status="{ item }">
            <el-tag :type="statusTagType(item.status as string)" size="small">
              {{ STATUS_LABEL[item.status as string] ?? item.status }}
            </el-tag>
          </template>
        </AdminListCards>
      </el-tab-pane>

      <el-tab-pane label="折算歷史">
        <el-table
          v-if="!isMobile"
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

        <AdminListCards
          v-else
          :items="logs as unknown as Record<string, unknown>[]"
          :columns="logCardColumns"
          row-key="log_id"
          :loading="loading"
          empty-text="尚無折算紀錄"
        >
          <template #title="{ item }">{{ item.salary_period }} 入帳</template>
          <template #cell-source_type="{ item }">
            <el-tag :type="sourceTagType(item.source_type as string)" size="small">
              {{ SOURCE_LABEL[item.source_type as string] ?? item.source_type }}
            </el-tag>
          </template>
        </AdminListCards>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.portal-leave-history {
  padding: 16px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 4px;
}
</style>
