<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import {
  listAppraisalParticipants,
  listAppraisalSummaries,
  listAppraisalCatalog,
  recomputeAppraisalSummaries,
  signSupervisorAppraisalSummary,
  signAccountingAppraisalSummary,
  finalizeAppraisalSummary,
  listAppraisalCycles,
  exportAppraisalCycleXlsxUrl,
  exportAppraisalTransferRosterXlsxUrl,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const cycle = ref(null)
const participants = ref([])
const summaries = ref([])
const catalog = ref([])
const loading = ref(false)
const busy = ref(false)

const summaryByParticipant = computed(() => {
  const m = {}
  for (const s of summaries.value) m[s.participant_id] = s
  return m
})

const gradeLabel = (g) =>
  ({ OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等' }[g] || g)

const statusLabel = (s) =>
  ({ DRAFT: '草稿', SUPERVISOR_SIGNED: '主管已簽', ACCOUNTING_SIGNED: '會計已簽', FINALIZED: '已核定' }[s] || s)

async function load() {
  loading.value = true
  try {
    const cycles = (await listAppraisalCycles()).data
    cycle.value = cycles.find((c) => c.id === cycleId) || null
    participants.value = (await listAppraisalParticipants(cycleId)).data
    summaries.value = (await listAppraisalSummaries(cycleId)).data
    catalog.value = (await listAppraisalCatalog()).data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function recompute() {
  busy.value = true
  try {
    await recomputeAppraisalSummaries(cycleId)
    ElMessage.success('重算完成')
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '重算失敗'))
  } finally {
    busy.value = false
  }
}

async function sign(summary, stage) {
  busy.value = true
  try {
    if (stage === 'supervisor') await signSupervisorAppraisalSummary(summary.id)
    else if (stage === 'accounting') await signAccountingAppraisalSummary(summary.id)
    else if (stage === 'finalize') await finalizeAppraisalSummary(summary.id)
    ElMessage.success('簽核完成')
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '簽核失敗'))
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="cycle-detail">
    <el-page-header @back="router.back()" content="半年考核明細" />
    <div v-if="cycle" class="meta">
      <strong>{{ cycle.academic_year }} 學年</strong>
      {{ cycle.semester === 'FIRST' ? '上學期' : '下學期' }} ｜
      基準日 {{ cycle.base_score_calc_date }} ｜
      基礎分數 {{ Number(cycle.base_score).toFixed(1) }} ｜
      狀態 {{ statusLabel(cycle.status) }}
    </div>

    <div class="toolbar">
      <el-button type="primary" :icon="Refresh" :loading="busy" @click="recompute">重算 Summary</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalCycleXlsxUrl(cycleId)">匯出考核表</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>
    </div>

    <el-table :data="participants" v-loading="loading" stripe>
      <el-table-column label="員工 ID" prop="employee_id" width="100" />
      <el-table-column label="角色群" prop="role_group" width="140" />
      <el-table-column label="班級" prop="classroom_id" width="100" />
      <el-table-column label="到職月數" prop="hire_months_in_cycle" width="100" />
      <el-table-column label="不計算" width="100">
        <template #default="{ row }">{{ row.is_excluded ? '是' : '' }}</template>
      </el-table-column>
      <el-table-column label="總分" width="100">
        <template #default="{ row }">
          <span v-if="summaryByParticipant[row.id]">
            {{ Number(summaryByParticipant[row.id].total_score).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="等第" width="100">
        <template #default="{ row }">
          <span v-if="summaryByParticipant[row.id]">{{ gradeLabel(summaryByParticipant[row.id].grade) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="獎金" width="120">
        <template #default="{ row }">
          <span v-if="summaryByParticipant[row.id]">
            {{ Number(summaryByParticipant[row.id].bonus_amount).toLocaleString() }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="簽核狀態" width="140">
        <template #default="{ row }">
          <el-tag v-if="summaryByParticipant[row.id]" size="small">
            {{ statusLabel(summaryByParticipant[row.id].status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="簽核操作" width="260">
        <template #default="{ row }">
          <template v-if="summaryByParticipant[row.id]">
            <el-button v-if="summaryByParticipant[row.id].status === 'DRAFT'"
              size="small" @click="sign(summaryByParticipant[row.id], 'supervisor')">主管簽</el-button>
            <el-button v-else-if="summaryByParticipant[row.id].status === 'SUPERVISOR_SIGNED'"
              size="small" @click="sign(summaryByParticipant[row.id], 'accounting')">會計簽</el-button>
            <el-button v-else-if="summaryByParticipant[row.id].status === 'ACCOUNTING_SIGNED'"
              size="small" type="primary" @click="sign(summaryByParticipant[row.id], 'finalize')">核定</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.cycle-detail { padding: 16px; }
.meta { margin: 12px 0; padding: 12px; background: #f5f7fa; border-radius: 4px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; }
</style>
