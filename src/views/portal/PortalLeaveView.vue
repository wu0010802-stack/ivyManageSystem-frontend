<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMyLeaveStats,
  getMySubstituteRequests,
  respondToSubstitute,
} from '@/api/portal'
import { useEmployeeStore } from '@/stores/employee'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'
import PortalLeaveList from '@/components/portal/PortalLeaveList.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import PortalSubstituteCardList from '@/components/portal/PortalSubstituteCardList.vue'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'

const { isMobile } = useIsMobile()

// ── 代理人相關 ──
const employeeStore = useEmployeeStore()
const allEmployees = computed(() => employeeStore.employees)
interface SubstituteRequest { id: number | string; requester_name?: string; leave_type_label?: string; substitute_status?: string; start_date?: string; end_date?: string; leave_hours?: number | string; reason?: string | null; created_at?: string; [key: string]: unknown }
const mySubstituteRequests = ref<SubstituteRequest[]>([])
const substituteLoading = ref(false)
const respondLoading = ref(false)
const substituteSectionRef = ref<{ $el?: HTMLElement } | null>(null)

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
const substituteStatusLabel = (status: string) => {
  const map: Record<string, string> = { not_required: '—', pending: '待回應', accepted: '已接受', rejected: '已拒絕', waived: '主管略過' }
  return map[status] || status
}
const substituteStatusType = (status: string): ElTagType => {
  const map: Record<string, ElTagType> = { not_required: 'info', pending: 'warning', accepted: 'success', rejected: 'danger', waived: 'info' }
  return map[status]
}

const fetchSubstituteRequests = async () => {
  substituteLoading.value = true
  try {
    const res = await (getMySubstituteRequests as unknown as () => Promise<{ data: SubstituteRequest[] }>)()
    mySubstituteRequests.value = res.data || []
  } catch {
    ElMessage.error('載入代理請求失敗')
  } finally {
    substituteLoading.value = false
  }
}

const pendingSubstituteCount = computed(() =>
  mySubstituteRequests.value.filter((request) => request.substitute_status === 'pending').length
)

const sortedSubstituteRequests = computed(() => {
  const statusRank: Record<string, number> = { pending: 0, accepted: 1, rejected: 2 }
  return [...mySubstituteRequests.value].sort((left, right) => {
    const leftRank = statusRank[left.substitute_status ?? ''] ?? 99
    const rightRank = statusRank[right.substitute_status ?? ''] ?? 99
    if (leftRank !== rightRank) return leftRank - rightRank
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  })
})

const emitSubstituteCountChanged = () => {
  window.dispatchEvent(new Event('portal-substitute-count-changed'))
}

// pendingSubstituteCount 已從 mySubstituteRequests 計算而來，
// 資料載入後直接觸發事件，不需額外 API 呼叫
watch(pendingSubstituteCount, emitSubstituteCountChanged)

const scrollToSubstituteRequests = async () => {
  await nextTick()
  const ref = substituteSectionRef.value
  const target = (ref && '$el' in ref ? ref.$el : ref) as HTMLElement | undefined
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const handleSubstituteRespond = async (leaveId: number | string, action: string) => {
  respondLoading.value = true
  try {
    await respondToSubstitute(Number(leaveId), { action })
    ElMessage.success(action === 'accept' ? '已接受代理請求' : '已拒絕代理請求')
    await fetchSubstituteRequests()
    emitSubstituteCountChanged()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '操作失敗')
  } finally {
    respondLoading.value = false
  }
}

const onSubstituteRespond = (leaveId: number | string, action: string) => handleSubstituteRespond(leaveId, action)

// ── 假單統計 ──
interface LeaveStats { hire_date?: string; seniority_years?: number; seniority_months?: number; annual_leave_quota?: number; annual_leave_used_days?: number; [key: string]: unknown }
const leaveStats = ref<LeaveStats | null>(null)

const fetchLeaveStats = async () => {
  try {
    const res = await getMyLeaveStats()
    // codegen 型別 hire_date 為 string | null，本元件 LeaveStats 用 ?: string；narrow 對齊。
    leaveStats.value = res.data as LeaveStats
  } catch {
    // silent
  }
}

// ── 請假表單 ──
const showForm = ref(false)
// refreshTrigger 遞增後觸發 PortalLeaveList 重新 fetch
const refreshTrigger = ref(0)

const onLeaveFormSubmitted = () => {
  refreshTrigger.value++
  showForm.value = false
}

// ── PortalLeaveList ref（供 onMounted 初次 fetch）──
const leaveListRef = ref<{ fetchLeaves?: () => Promise<void> } | null>(null)

onMounted(() => {
  Promise.all([
    leaveListRef.value?.fetchLeaves?.() ?? Promise.resolve(),
    fetchLeaveStats(),
    employeeStore.fetchEmployees(),
    fetchSubstituteRequests(),
  ])
})
</script>

<template>
  <div class="portal-leave">
    <div class="page-header">
      <h2>請假申請</h2>
      <el-button type="primary" @click="showForm = true">新增請假</el-button>
    </div>

    <el-alert
      v-if="pendingSubstituteCount > 0"
      class="substitute-alert"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #title>您有 {{ pendingSubstituteCount }} 筆待回應代理請求</template>
      <template #default>
        請先確認是否接受代理，以免同事的假單無法繼續送審。
        <el-button link type="primary" @click="scrollToSubstituteRequests">前往查看</el-button>
      </template>
    </el-alert>

    <!-- Stats Card -->
    <el-card class="rules-card" v-if="leaveStats">
      <div class="stats-container">
        <div class="stat-item">
          <div class="stat-label">到職日期</div>
          <div class="stat-value">{{ leaveStats.hire_date || '未設定' }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">目前年資</div>
          <div class="stat-value">{{ leaveStats.seniority_years }} 年 {{ leaveStats.seniority_months }} 個月</div>
        </div>
        <div class="stat-item highlight">
          <div class="stat-label">法定特休 (週年制)</div>
          <div class="stat-value">{{ leaveStats.annual_leave_quota }} 天</div>
        </div>
        <div class="stat-item highlight">
          <div class="stat-label">今年已休 ({{ new Date().getFullYear() }})</div>
          <div class="stat-value">{{ leaveStats.annual_leave_used_days }} 天</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">剩餘可用 (概算)</div>
          <div class="stat-value">{{ Math.max(0, (leaveStats.annual_leave_quota ?? 0) - (leaveStats.annual_leave_used_days ?? 0)) }} 天</div>
        </div>
      </div>
    </el-card>

    <!-- 請假紀錄列表 -->
    <PortalLeaveList ref="leaveListRef" :refresh-trigger="refreshTrigger" />

    <!-- Mobile: BottomSheet -->
    <TeacherBottomSheet
        v-if="isMobile"
        v-model="showForm"
        title="新增請假申請"
        default-snap="full"
        :snap-points="['full']"
    >
        <PortalLeaveForm
            v-if="showForm"
            :all-employees="allEmployees"
            @submitted="onLeaveFormSubmitted"
            @cancel="showForm = false"
        />
    </TeacherBottomSheet>

    <!-- Desktop: el-dialog -->
    <el-dialog
        v-else
        v-model="showForm"
        title="新增請假申請"
        width="520px"
    >
        <PortalLeaveForm
            v-if="showForm"
            :all-employees="allEmployees"
            @submitted="onLeaveFormSubmitted"
            @cancel="showForm = false"
        />
    </el-dialog>

    <!-- 待我代理 -->
    <el-card ref="substituteSectionRef" v-loading="substituteLoading" style="margin-top: var(--space-4);">
      <template #header>
        <span>待我代理的假單</span>
        <el-badge
          v-if="pendingSubstituteCount > 0"
          :value="pendingSubstituteCount"
          type="warning"
          style="margin-left: 8px;"
        />
      </template>

      <!-- Mobile: card list -->
      <PortalSubstituteCardList
          v-if="isMobile"
          :requests="sortedSubstituteRequests"
          :respond-loading="respondLoading"
          @respond="onSubstituteRespond"
      />

      <!-- Desktop: table（保留原 markup）-->
      <div v-else style="overflow-x: auto">
        <el-table :data="sortedSubstituteRequests" border stripe style="width: 100%;" max-height="400">
          <el-table-column prop="requester_name" label="請假人" width="100" />
          <el-table-column prop="leave_type_label" label="假別" width="100" />
          <el-table-column label="請假區間" width="200">
            <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}</template>
          </el-table-column>
          <el-table-column prop="leave_hours" label="時數" width="70" />
          <el-table-column prop="reason" label="原因" show-overflow-tooltip />
          <el-table-column label="代理狀態" width="100">
            <template #default="{ row }">
              <el-tag :type="substituteStatusType(row.substitute_status)" size="small">
                {{ substituteStatusLabel(row.substitute_status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <template v-if="row.substitute_status === 'pending'">
                <el-button type="success" size="small" :loading="respondLoading" @click="handleSubstituteRespond(row.id, 'accept')">接受</el-button>
                <el-button type="danger" size="small" :loading="respondLoading" @click="handleSubstituteRespond(row.id, 'reject')">拒絕</el-button>
              </template>
              <span v-else class="text-secondary" style="font-size: 12px;">已回應</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-empty v-if="!substituteLoading && mySubstituteRequests.length === 0" description="目前無待代理的假單" />
    </el-card>
  </div>
</template>

<style scoped>
.substitute-alert {
  margin-bottom: var(--space-4);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.rules-card {
  margin-bottom: var(--space-4);
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-5);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--space-4);
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.stat-item.highlight {
  background-color: var(--surface-color);
  border-color: var(--color-primary-soft);
  box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.1);
}

.stat-item.highlight .stat-value {
  color: var(--color-primary);
  font-weight: 700;
  font-size: var(--text-2xl);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

@media (max-width: 767px) {
  .stats-container {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .stat-value {
    font-size: var(--text-base);
  }
}
</style>
