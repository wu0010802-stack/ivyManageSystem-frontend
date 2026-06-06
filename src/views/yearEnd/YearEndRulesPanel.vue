<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig } from '@/api/config'
import { getEmployees } from '@/api/employees'
import type { ApiBody } from '@/api/_generated/typed'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'

const loading = ref(false)
const canRead = computed(() => hasPermission('SETTINGS_READ'))

// 年終規則欄位（型別對齊 ApiBody<'/config/bonus','put'> 的年終子集）
const rules = reactive({
  // ① 才藝鼓勵
  art_teacher_unit_price: 0,
  // ④ 學期紅利門檻/金額
  dividend_returning_threshold: 0,
  dividend_returning_amount: 500,
  dividend_activity_threshold: 0,
  dividend_activity_amount: 1000,
  // ⑤ 考勤扣款費率
  late_deduction_per_time: 50,
  missing_punch_deduction_per_time: 50,
  personal_leave_deduction_per_day: 500,
  sick_leave_deduction_per_day: 500,
})

// 只從後端回應抓取年終數值欄位（其餘 BonusConfig 欄位不入此面板）
const RULE_FIELDS = [
  'art_teacher_unit_price',
  'dividend_returning_threshold',
  'dividend_returning_amount',
  'dividend_activity_threshold',
  'dividend_activity_amount',
  'late_deduction_per_time',
  'missing_punch_deduction_per_time',
  'personal_leave_deduction_per_day',
  'sick_leave_deduction_per_day',
] as const

// 課後才藝班年終單價（班名 → 單價），動態 key-value 列
type AfterClassAwardEntry = { className: string; price: number }
const afterClassAwardRows = ref<AfterClassAwardEntry[]>([])
// 才藝老師年終收款人 employee id list
const artTeacherEmployeeIds = ref<number[]>([])

type EmployeeOption = { id: number; name: unknown }
const employeeOptions = ref<EmployeeOption[]>([])

const fetchRules = async () => {
  loading.value = true
  try {
    const response = await getBonusConfig()
    const data = response.data as Record<string, unknown>
    for (const f of RULE_FIELDS) {
      const v = data[f]
      if (v !== undefined && v !== null) {
        ;(rules as Record<string, unknown>)[f] = v
      }
    }
    const dict = data.after_class_award_unit_price
    afterClassAwardRows.value =
      dict && typeof dict === 'object'
        ? Object.entries(dict as Record<string, unknown>).map(([className, price]) => ({
            className,
            price: Number(price) || 0,
          }))
        : []
    const ids = data.art_teacher_employee_ids
    artTeacherEmployeeIds.value = Array.isArray(ids) ? ids.map((i) => Number(i)) : []
  } catch {
    ElMessage.error('年終規則載入失敗')
  } finally {
    loading.value = false
  }
}

const fetchEmployeeOptions = async () => {
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as EmployeeOption[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉退化但其餘欄位仍可編輯
    ElMessage.warning('員工清單載入失敗，才藝老師選擇可能不完整')
  }
}

const addAfterClassAwardRow = () => {
  afterClassAwardRows.value.push({ className: '', price: 0 })
}

const removeAfterClassAwardRow = (index: number) => {
  afterClassAwardRows.value.splice(index, 1)
}

const saveRules = async () => {
  // 與 BonusConfig PUT 對齊：變更影響全員年終規則，要求異動原因 ≥10 字（落 audit）。
  let reason
  try {
    const result = await ElMessageBox.prompt(
      '此變更會影響全員年終規則，請輸入異動原因（至少 10 個字）：',
      '年終規則變更原因',
      {
        confirmButtonText: '確認儲存',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (val) => {
          if (!val || val.trim().length < 10) {
            return '原因至少 10 個字'
          }
          return true
        },
      },
    )
    reason = (result as { value: string }).value.trim()
  } catch {
    return // 使用者按取消
  }

  // 年終 JSON 欄位序列化：dict（班名→單價，略過空班名）+ id list
  const afterClassAwardDict: Record<string, number> = {}
  for (const row of afterClassAwardRows.value) {
    const name = row.className.trim()
    if (name) afterClassAwardDict[name] = Number(row.price) || 0
  }
  // 只送年終欄位；後端 PUT /config/bonus 為部分更新，會保留超額/節慶/底薪等其他設定。
  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...rules,
    after_class_award_unit_price: afterClassAwardDict,
    art_teacher_employee_ids: [...artTeacherEmployeeIds.value],
    reason,
  }

  loading.value = true
  try {
    await updateBonusConfig(payload)
    ElMessage.success('年終規則已儲存')
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    ElMessage.error(typeof detail === 'string' ? detail : '年終規則儲存失敗')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!canRead.value) return
  fetchRules()
  fetchEmployeeOptions()
})
</script>

<template>
  <div v-if="canRead" v-loading="loading">
    <div class="rules-actions">
      <el-button type="primary" size="large" @click="saveRules">儲存年終規則</el-button>
    </div>

    <p class="desc-text">
      年終獎金 E化引擎使用以下規則自動推導：才藝鼓勵金、學期紅利門檻、考勤扣款費率。
      設定後於年終結算「建立」階段套用，個別金額仍可在總表手動覆寫。
    </p>

    <!-- ① 才藝鼓勵 -->
    <div class="section-title">才藝鼓勵</div>
    <el-card class="box-card mb-6" shadow="never">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item>
            <template #label>
              <el-tooltip content="才藝老師年終單價：每位收款人得「全校總人次 × 單價」" placement="top">
                <span>才藝老師單價</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.art_teacher_unit_price"
              :min="0" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 人次</span>
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <div class="label mb-2">課後才藝班年終單價（班名 → 單價）</div>
      <p class="desc-text">每個課後才藝班的年終鼓勵金單價，依班名對應。新增班別後填入單價。</p>
      <div
        v-for="(row, idx) in afterClassAwardRows"
        :key="idx"
        class="kv-row"
      >
        <el-input
          v-model="row.className"
          placeholder="班名（如：美術班）"
          style="flex: 1"
        />
        <el-input-number
          v-model="row.price"
          :min="0" :step="10"
          controls-position="right"
          style="width: 160px"
          placeholder="單價"
        />
        <el-button
          type="danger"
          link
          @click="removeAfterClassAwardRow(idx)"
        >移除</el-button>
      </div>
      <el-empty
        v-if="afterClassAwardRows.length === 0"
        description="尚未設定任何課後才藝班單價"
        :image-size="48"
      />
      <el-button class="mt-2" @click="addAfterClassAwardRow">+ 新增班別</el-button>

      <el-divider />
      <el-form-item label="才藝老師（年終收款人）">
        <el-select
          v-model="artTeacherEmployeeIds"
          multiple
          filterable
          clearable
          placeholder="選擇才藝老師（每位得全校總人次 × 單價）"
          style="width: 100%"
        >
          <el-option
            v-for="emp in employeeOptions"
            :key="emp.id"
            :label="String(emp.name)"
            :value="emp.id"
          />
        </el-select>
      </el-form-item>
    </el-card>

    <!-- ④ 學期紅利 -->
    <div class="section-title">學期紅利</div>
    <el-card class="box-card mb-6" shadow="never">
      <p class="desc-text">舊生率 / 才藝率達門檻時，發放對應紅利。門檻為 0–1 小數（例：0.8 = 80%）。</p>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item>
            <template #label>
              <el-tooltip content="舊生率達此門檻發放紅利（0–1 小數）" placement="top">
                <span>舊生率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_returning_threshold"
              :min="0" :max="1" :step="0.05" :precision="2"
              controls-position="right" style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="舊生率紅利">
            <el-input-number
              v-model="rules.dividend_returning_amount"
              :min="0" :step="100"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item>
            <template #label>
              <el-tooltip content="才藝率達此門檻發放紅利（0–1 小數）" placement="top">
                <span>才藝率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_activity_threshold"
              :min="0" :max="1" :step="0.05" :precision="2"
              controls-position="right" style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="才藝率紅利">
            <el-input-number
              v-model="rules.dividend_activity_amount"
              :min="0" :step="100"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- ⑤ 考勤扣款 -->
    <div class="section-title">考勤扣款</div>
    <el-card class="box-card" shadow="never">
      <p class="desc-text">年終結算時依考勤紀錄扣款的費率設定。</p>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="遲到（每次）">
            <el-input-number
              v-model="rules.late_deduction_per_time"
              :min="0" :max="50000" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 次</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="未打卡（每次）">
            <el-input-number
              v-model="rules.missing_punch_deduction_per_time"
              :min="0" :max="50000" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 次</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="事假（每日）">
            <el-input-number
              v-model="rules.personal_leave_deduction_per_day"
              :min="0" :max="50000" :step="50"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 日</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="病假（每日）">
            <el-input-number
              v-model="rules.sick_leave_deduction_per_day"
              :min="0" :max="50000" :step="50"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 日</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>
  </div>
  <el-alert v-else type="warning" :closable="false" show-icon title="目前帳號沒有查看年終規則的權限" />
</template>

<style scoped>
.rules-actions {
  margin-bottom: var(--space-4);
  text-align: right;
}
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: var(--neutral-300);
  border-left: 4px solid var(--color-info);
  padding-left: 10px;
}
.box-card {
  background-color: #2b303b;
  border: 1px solid #4c4d4f;
  color: #fff;
}
.label {
  margin-bottom: 5px;
  font-size: var(--text-base);
  color: var(--text-tertiary);
}
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 15px;
}
.mt-2 { margin-top: var(--space-2, 8px); }
.mb-2 { margin-bottom: var(--space-2, 8px); }
.mb-6 { margin-bottom: var(--space-6); }
.kv-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-2, 8px);
}
.unit-hint {
  margin-left: var(--space-2, 8px);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
</style>
