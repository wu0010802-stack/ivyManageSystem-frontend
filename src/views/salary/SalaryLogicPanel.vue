<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getSalaryLogic } from '@/api/salary'

const loading = ref(false)
const logicData = ref<Record<string, unknown> | null>(null)

const formulaVerification = computed(() => (logicData.value?.formula_verification as Record<string, unknown> | null) || null)
const officialChecks = computed(() => (formulaVerification.value?.official_checks as Array<{ match: boolean; item?: unknown; system_value?: unknown; official_value?: unknown }>) || [])
const sampleBracketChecks = computed(() => (formulaVerification.value?.sample_bracket_checks as Array<{ match: boolean; [key: string]: unknown }>) || [])
const allOfficialChecksPass = computed(() =>
  officialChecks.value.every(item => item.match) && sampleBracketChecks.value.every(item => item.match)
)

// Template helpers — cast unknown sub-objects to typed records
const attendanceFormulas = computed(() => (formulaVerification.value?.attendance_formulas as Array<{ item: string; formula: string; note?: string }>) || [])
const insuranceFormulas = computed(() => (formulaVerification.value?.insurance_formulas as Array<{ item: string; formula: string; note?: string }>) || [])
const officialSources = computed(() => (formulaVerification.value?.official_sources as Array<{ url: string; label: string }>) || [])
const attendancePolicyDb = computed(() => (logicData.value?.attendance_policy_db as { default_work_start?: unknown; default_work_end?: unknown; festival_bonus_months?: unknown }) || null)
const leaveDeductionRules = computed(() => logicData.value?.leave_deduction_rules as Record<string, { label?: string; ratio?: unknown; note?: string }> || {})
const gradeTargetsDb = computed(() => (logicData.value?.grade_targets_db as Record<string, unknown>[]) || [])

// 勞健保級距表版本：與結算頁勞保／健保細項備註標的是同一份權威，也是總部
// 「政府資料同步」頁維護的對象。來源為 builtin 代表 DB 整表無級距（fresh /
// DR 部署漏 seed），保費會靜默走程式內建舊年度表 —— 必須顯眼告警。
const bracketVersion = computed(() => {
  const cfg = logicData.value?.insurance_runtime_config as Record<string, unknown> | undefined
  if (!cfg || cfg.brackets_year === undefined) return null
  return {
    year: cfg.brackets_year as number,
    count: (cfg.bracket_count as number) ?? 0,
    fromDb: cfg.brackets_source === 'db',
  }
})
const shiftTypes = computed(() => (logicData.value?.shift_types as Record<string, unknown>[]) || [])

const fetchLogic = async () => {
  loading.value = true
  try {
    const res = await getSalaryLogic()
    logicData.value = res.data as Record<string, unknown>
  } catch (e) {
    ElMessage.error(friendlyError('載入薪資邏輯資料失敗', e))
  } finally {
    loading.value = false
  }
}

const formatJson = (obj: unknown) => JSON.stringify(obj, null, 2)

onMounted(() => {
  fetchLogic()
})
</script>

<template>
  <div v-loading="loading">
    <template v-if="logicData">
      <el-alert
        title="考勤規則與勞健保費率已改為只讀顯示"
        type="info"
        :closable="false"
        class="section-card"
      >
        <template #default>
          後台設定頁不再提供這兩項人工調整；此頁面顯示實際薪資邏輯、runtime 常數與 2026 官方資料比對結果。
        </template>
      </el-alert>

      <!-- 勞健保級距表版本：結算頁勞保／健保細項備註標的版本，於此查核 -->
      <el-card class="section-card" v-if="bracketVersion">
        <template #header><strong>勞健保級距表版本</strong></template>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="生效年度">{{ bracketVersion.year }} 年</el-descriptions-item>
          <el-descriptions-item label="級距列數">{{ bracketVersion.count }} 列</el-descriptions-item>
          <el-descriptions-item label="資料來源">
            <el-tag :type="bracketVersion.fromDb ? 'success' : 'danger'" size="small">
              {{ bracketVersion.fromDb ? 'DB（insurance_brackets）' : '程式內建 fallback' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="!bracketVersion.fromDb"
          type="error"
          :closable="false"
          class="section-card"
          title="資料庫無級距資料，保費正以程式內建表計算"
        >
          <template #default>
            級距表未寫入資料庫（fresh 部署或災難復原可能漏 seed），系統暫以程式內建的
            {{ bracketVersion.year }} 年度表計算保費。若政府已公告新年度級距，請由總部匯入後再行結算。
          </template>
        </el-alert>
      </el-card>

      <!-- 薪資公式 -->
      <el-card class="section-card">
        <template #header><strong>薪資計算公式</strong></template>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item
            v-for="(val, key) in logicData.salary_formula"
            :key="key"
            :label="key"
          >
            <code>{{ val }}</code>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card class="section-card" v-if="formulaVerification">
        <template #header><strong>考勤公式</strong></template>
        <el-table :data="attendanceFormulas" border size="small">
          <el-table-column prop="item" label="項目" width="140" />
          <el-table-column prop="formula" label="公式" min-width="260">
            <template #default="{ row }"><code>{{ row.formula }}</code></template>
          </el-table-column>
          <el-table-column prop="note" label="說明" />
        </el-table>
      </el-card>

      <el-card class="section-card" v-if="formulaVerification">
        <template #header><strong>勞健保 / 勞退公式</strong></template>
        <el-table :data="insuranceFormulas" border size="small">
          <el-table-column prop="item" label="項目" width="180" />
          <el-table-column prop="formula" label="公式" min-width="260">
            <template #default="{ row }"><code>{{ row.formula }}</code></template>
          </el-table-column>
          <el-table-column prop="note" label="說明" />
        </el-table>
      </el-card>

      <el-card class="section-card" v-if="logicData.insurance_runtime_config">
        <template #header><strong>勞健保 Runtime 常數</strong></template>
        <pre class="json-block">{{ formatJson(logicData.insurance_runtime_config) }}</pre>
      </el-card>

      <el-card class="section-card" v-if="formulaVerification">
        <template #header><strong>2026 官方資料比對</strong></template>
        <div class="mb-3">
          <el-tag :type="allOfficialChecksPass ? 'success' : 'danger'" size="large">
            {{ allOfficialChecksPass ? 'Runtime 數值與 2026 官方資料一致' : '發現需人工確認的差異' }}
          </el-tag>
        </div>
        <div class="logic-note">{{ formulaVerification.runtime_note }}</div>
        <el-table :data="officialChecks" border size="small" style="margin-top: 12px;">
          <el-table-column prop="item" label="檢查項目" min-width="200" />
          <el-table-column prop="system_value" label="系統值" min-width="160" />
          <el-table-column prop="official_value" label="官方值" min-width="160" />
          <el-table-column label="結果" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.match ? 'success' : 'danger'" size="small">
                {{ row.match ? '一致' : '不一致' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-table :data="sampleBracketChecks" border size="small" style="margin-top: 12px;">
          <el-table-column prop="insured_amount" label="投保級距" width="110" />
          <el-table-column prop="labor_employee_system" label="勞保員工(系統)" width="120" />
          <el-table-column prop="labor_employee_official" label="勞保員工(官方)" width="120" />
          <el-table-column prop="labor_employer_system" label="勞保雇主(系統)" width="120" />
          <el-table-column prop="labor_employer_official" label="勞保雇主(官方)" width="120" />
          <el-table-column prop="health_employee_system" label="健保員工(系統)" width="120" />
          <el-table-column prop="health_employee_official" label="健保員工(官方)" width="120" />
          <el-table-column prop="health_employer_system" label="健保雇主(系統)" width="120" />
          <el-table-column prop="health_employer_official" label="健保雇主(官方)" width="120" />
          <el-table-column label="結果" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.match ? 'success' : 'danger'" size="small">
                {{ row.match ? '一致' : '不一致' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="source-links">
          <a
            v-for="source in officialSources"
            :key="source.url"
            :href="source.url"
            target="_blank"
            rel="noreferrer"
          >
            {{ source.label }}
          </a>
        </div>
      </el-card>

      <!-- 考勤政策 -->
      <el-card class="section-card">
        <template #header><strong>考勤政策 (DB)</strong></template>
        <el-descriptions :column="2" border size="small" v-if="attendancePolicyDb">
          <el-descriptions-item label="預設上班">{{ attendancePolicyDb.default_work_start }}</el-descriptions-item>
          <el-descriptions-item label="預設下班">{{ attendancePolicyDb.default_work_end }}</el-descriptions-item>
          <el-descriptions-item label="節慶獎金入職月數">{{ attendancePolicyDb.festival_bonus_months }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="未設定" />
      </el-card>

      <!-- 請假扣薪 -->
      <el-card class="section-card">
        <template #header><strong>請假扣薪規則</strong></template>
        <el-table :data="Object.entries(leaveDeductionRules).map(([k, v]) => ({ code: k, ...v }))" border size="small">
          <el-table-column prop="code" label="代碼" width="100" />
          <el-table-column prop="label" label="假別" width="100" />
          <el-table-column prop="ratio" label="扣薪比例" width="100" />
          <el-table-column prop="note" label="說明" />
        </el-table>
      </el-card>

      <!-- 獎金設定 -->
      <el-card class="section-card">
        <template #header><strong>獎金設定 (DB)</strong></template>
        <pre v-if="logicData.bonus_config_db" class="json-block">{{ formatJson(logicData.bonus_config_db) }}</pre>
        <el-empty v-else description="未設定" />
      </el-card>

      <!-- 年級目標 -->
      <el-card class="section-card">
        <template #header><strong>年級目標人數 (DB)</strong></template>
        <el-table :data="gradeTargetsDb" border size="small" v-if="gradeTargetsDb.length">
          <el-table-column prop="grade_name" label="年級" width="80" />
          <el-table-column prop="festival_two_teachers" label="節慶(雙導)" width="100" />
          <el-table-column prop="festival_one_teacher" label="節慶(單導)" width="100" />
          <el-table-column prop="festival_shared" label="節慶(共用)" width="100" />
          <el-table-column prop="overtime_two_teachers" label="超額(雙導)" width="100" />
          <el-table-column prop="overtime_one_teacher" label="超額(單導)" width="100" />
          <el-table-column prop="overtime_shared" label="超額(共用)" width="100" />
        </el-table>
      </el-card>

      <!-- 勞健保費率 -->
      <el-card class="section-card">
        <template #header><strong>勞健保費率 (DB)</strong></template>
        <pre v-if="logicData.insurance_rate_db" class="json-block">{{ formatJson(logicData.insurance_rate_db) }}</pre>
        <el-empty v-else description="未設定" />
      </el-card>

      <!-- Engine 運行時參數 -->
      <el-card class="section-card">
        <template #header><strong>SalaryEngine 運行時參數</strong></template>
        <pre class="json-block">{{ formatJson(logicData.engine_runtime_config) }}</pre>
      </el-card>

      <!-- 班別 -->
      <el-card class="section-card">
        <template #header><strong>班別設定</strong></template>
        <el-table :data="shiftTypes" border size="small">
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="name" label="名稱" width="140" />
          <el-table-column prop="work_start" label="上班" width="80" />
          <el-table-column prop="work_end" label="下班" width="80" />
          <el-table-column prop="is_active" label="啟用" width="60">
            <template #default="{row}">{{ row.is_active ? 'Y' : 'N' }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.section-card {
  margin-bottom: var(--space-4);
}

.mb-3 {
  margin-bottom: 12px;
}

.logic-note {
  color: var(--text-secondary);
  font-size: var(--text-sm, 13px);
}

.source-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.source-links a {
  color: var(--el-color-primary);
  text-decoration: none;
}

.source-links a:hover {
  text-decoration: underline;
}

.json-block {
  background: var(--text-primary);
  color: var(--border-color);
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 500px;
  overflow-y: auto;
}
</style>
