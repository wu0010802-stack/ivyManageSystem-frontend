<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalaryLogic } from '@/api/salary'

const loading = ref(false)
const logicData = ref(null)

const formulaVerification = computed(() => logicData.value?.formula_verification || null)
const officialChecks = computed(() => formulaVerification.value?.official_checks || [])
const sampleBracketChecks = computed(() => formulaVerification.value?.sample_bracket_checks || [])
const allOfficialChecksPass = computed(() =>
  officialChecks.value.every(item => item.match) && sampleBracketChecks.value.every(item => item.match)
)

const fetchLogic = async () => {
  loading.value = true
  try {
    const res = await getSalaryLogic()
    logicData.value = res.data
  } catch (e) {
    ElMessage.error('載入失敗: ' + (e.response?.data?.detail || e.message))
  } finally {
    loading.value = false
  }
}

const formatJson = (obj) => JSON.stringify(obj, null, 2)

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
        <el-table :data="formulaVerification.attendance_formulas" border size="small">
          <el-table-column prop="item" label="項目" width="140" />
          <el-table-column prop="formula" label="公式" min-width="260">
            <template #default="{ row }"><code>{{ row.formula }}</code></template>
          </el-table-column>
          <el-table-column prop="note" label="說明" />
        </el-table>
      </el-card>

      <el-card class="section-card" v-if="formulaVerification">
        <template #header><strong>勞健保 / 勞退公式</strong></template>
        <el-table :data="formulaVerification.insurance_formulas" border size="small">
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
            v-for="source in formulaVerification.official_sources"
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
        <el-descriptions :column="2" border size="small" v-if="logicData.attendance_policy_db">
          <el-descriptions-item label="預設上班">{{ logicData.attendance_policy_db.default_work_start }}</el-descriptions-item>
          <el-descriptions-item label="預設下班">{{ logicData.attendance_policy_db.default_work_end }}</el-descriptions-item>
          <el-descriptions-item label="節慶獎金入職月數">{{ logicData.attendance_policy_db.festival_bonus_months }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="未設定" />
      </el-card>

      <!-- 請假扣薪 -->
      <el-card class="section-card">
        <template #header><strong>請假扣薪規則</strong></template>
        <el-table :data="Object.entries(logicData.leave_deduction_rules).map(([k,v]) => ({code:k,...v}))" border size="small">
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
        <el-table :data="logicData.grade_targets_db" border size="small" v-if="logicData.grade_targets_db.length">
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
        <el-table :data="logicData.shift_types" border size="small">
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
  background: #1e293b;
  color: #e2e8f0;
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
