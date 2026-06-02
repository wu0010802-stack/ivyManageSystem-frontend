<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import {
  listYearEndCycles,
  listYearEndSettlements,
  listSpecialBonuses,
  listClassEnrollmentTargets,
  signSupervisorSettlement,
  signAccountingSettlement,
  finalizeSettlement,
  exportYearEndSummaryXlsxUrl,
  exportYearEndTransferRosterXlsxUrl,
} from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'

interface Settlement { id: number; employee_id: number; status: string; total_amount?: number | string; [key: string]: unknown }
interface SpecialBonus { id: number; employee_id: number; bonus_type: string; period_label: string; amount: number | string; classroom_id?: number }
interface YearEndCycle { id: number; academic_year: number; bonus_calc_date: string; status: string }

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const cycle = ref<YearEndCycle | null>(null)
const settlements = ref<Settlement[]>([])
const specialBonuses = ref<SpecialBonus[]>([])
const classTargets = ref<unknown[]>([])
const loading = ref(false)
const busy = ref(false)
const tab = ref('settlements')

const statusLabel = (s: string) =>
  (({
    DRAFT: '草稿',
    SUPERVISOR_SIGNED: '主管已簽',
    ACCOUNTING_SIGNED: '會計已簽',
    FINALIZED: '已核定',
  } as Record<string, string>)[s] || s)

async function load() {
  loading.value = true
  try {
    const cycles = (await listYearEndCycles()).data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    settlements.value = (await listYearEndSettlements(cycleId)).data
    specialBonuses.value = (await listSpecialBonuses(cycleId)).data
    classTargets.value = (await listClassEnrollmentTargets(cycleId)).data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function sign(s: Settlement, stage: string) {
  busy.value = true
  try {
    if (stage === 'supervisor') await signSupervisorSettlement(s.id)
    else if (stage === 'accounting') await signAccountingSettlement(s.id)
    else if (stage === 'finalize') await finalizeSettlement(s.id)
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
  <div class="ye-detail">
    <el-page-header @back="router.back()" content="年終獎金明細" />
    <div v-if="cycle" class="meta">
      <strong>{{ cycle.academic_year }} 學年度</strong> ｜
      基準日 {{ cycle.bonus_calc_date }} ｜ 狀態 {{ cycle.status }}
    </div>

    <div class="toolbar">
      <el-button :icon="Refresh" @click="load">重新載入</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndSummaryXlsxUrl(cycleId)">年終獎金總表</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="員工結算單" name="settlements">
        <el-table :data="settlements" v-loading="loading" stripe size="small">
          <el-table-column label="員工 ID" prop="employee_id" width="80" />
          <el-table-column label="平均績效%" prop="avg_performance_rate" width="100" />
          <el-table-column label="基本薪俸" prop="base_salary" width="100" />
          <el-table-column label="節慶獎金" prop="festival_total" width="100" />
          <el-table-column label="毛額" prop="gross_amount" width="110" />
          <el-table-column label="達成%" prop="org_achievement_rate" width="80" />
          <el-table-column label="小計" prop="subtotal_amount" width="110" />
          <el-table-column label="扣項合計" prop="deduction_total" width="100" />
          <el-table-column label="到職月" prop="hire_months" width="80" />
          <el-table-column label="應領小計" prop="payable_amount" width="120" />
          <el-table-column label="特別獎金" prop="special_bonus_total" width="110" />
          <el-table-column label="總額" prop="total_amount" width="120">
            <template #default="{ row }">
              <strong>{{ Number(row.total_amount).toLocaleString() }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="120">
            <template #default="{ row }">
              <el-tag size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="簽核" width="220">
            <template #default="{ row }">
              <!-- 兩關流程：DRAFT → 會計簽核 → 老闆核定 -->
              <el-button
                v-if="row.status === 'DRAFT' && hasPermission('APPRAISAL_ACCOUNTING')"
                size="small"
                @click="sign(row, 'accounting')"
              >會計簽核</el-button>
              <el-button
                v-else-if="row.status === 'ACCOUNTING_SIGNED' && hasPermission('YEAR_END_FINALIZE')"
                size="small"
                type="primary"
                @click="sign(row, 'finalize')"
              >老闆核定</el-button>
              <el-tag
                v-else-if="row.status === 'FINALIZED'"
                type="success"
                size="small"
              >已核定</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="特別獎金" name="bonuses">
        <el-table :data="specialBonuses" v-loading="loading" stripe size="small">
          <el-table-column label="員工 ID" prop="employee_id" width="80" />
          <el-table-column label="獎金類型" prop="bonus_type" width="220" />
          <el-table-column label="期間" prop="period_label" width="160" />
          <el-table-column label="金額" prop="amount" width="120">
            <template #default="{ row }">{{ Number(row.amount).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="班級" prop="classroom_id" width="80" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="班級經營績效" name="classes">
        <el-table :data="classTargets" v-loading="loading" stripe size="small">
          <el-table-column label="學期" width="80">
            <template #default="{ row }">{{ row.semester_first ? '上' : '下' }}</template>
          </el-table-column>
          <el-table-column label="班級 ID" prop="classroom_id" width="80" />
          <el-table-column label="班導 ID" prop="head_teacher_employee_id" width="100" />
          <el-table-column label="副班導 ID" prop="assistant_employee_id" width="100" />
          <el-table-column label="編制人數" prop="head_count_target" width="100" />
          <el-table-column label="平均在籍" prop="avg_monthly_enrollment" width="100" />
          <el-table-column label="經營績效%" prop="class_performance_rate" width="120" />
          <el-table-column label="舊生註冊率" prop="returning_student_rate" width="120" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.ye-detail { padding: 16px; }
.meta { margin: 12px 0; padding: 12px; background: #f5f7fa; border-radius: 4px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; }
</style>
