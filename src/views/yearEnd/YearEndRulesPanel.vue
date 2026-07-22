<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig } from '@/api/config'
import { getEmployees } from '@/api/employees'
import type { ApiBody } from '@/api/_generated/typed'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { hasPermission } from '@/utils/auth'
import ReadonlyBadge from '@/components/common/ReadonlyBadge.vue'
import { confirmWithReason } from '@/views/appraisal/confirmWithReason'
import { injectOpenCycleHint } from '@/views/appraisal/composables/useOpenCycleHint'
import {
  DIVIDEND_ACTIVITY_GRADES,
  emptyGradeThresholdPercents,
  fractionToPercent,
  percentToFraction,
  gradeThresholdsFromApi,
  gradeThresholdsToApi,
  type GradeThresholdPercents,
} from '@/utils/dividendActivityThresholds'

const loading = ref(false)
const canRead = computed(() => hasPermission('SETTINGS_READ'))
// 金流硬化（薪資模組稽核 P2）：saveRules 送到 PUT /config/bonus，
// 後端除 SETTINGS_WRITE 外還額外要求 has_finance_approve（ACTIVITY_PAYMENT_APPROVE），
// 見 ivy-backend api/config/bonus.py update_bonus_config。前端 gate 需對齊，
// 否則唯讀（SETTINGS_READ）使用者會填完整張表、過完異動原因提示才吃 403。
const canSaveRules = computed(
  () => hasPermission('SETTINGS_WRITE') && hasPermission('ACTIVITY_PAYMENT_APPROVE'),
)

// Task B5：規則變更影響提示——儲存成功訊息改走 notifyRuleChanged，OPEN 週期
// 存在時提示「此變更於下次試算/重算生效」，取代原本固定的「年終規則已儲存」。
const { notifyRuleChanged } = injectOpenCycleHint()

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

// G15（園方福利辦法 115.01.01）：紅利才藝參與率逐年級門檻（顯示用百分比，0~100）。
// 任一年級留空＝該年級沿用單一門檻 dividend_activity_threshold；四年級皆空 → 送出 null。
const gradeThresholdPercents = reactive<GradeThresholdPercents>(emptyGradeThresholdPercents())
// G15：幼生該學期出席堂數「超過」此值才計入才藝參與率分子；null＝停用堂數條件。
const dividendActivityMinSessions = ref<number | null>(null)

// G8（年終批次2）：教課獎勵金——暫依 Excel 慣例（R1）每滿 N 堂計 1 次 × 單價。
// 留空＝null＝沿用後端預設（65 元／4 堂）；不放進 RULE_FIELDS 的 0 預設寫法，
// 因為「未設定」與「設為 0」語意不同（比照 dividendActivityMinSessions 的 null 容錯模式）。
const teachingExtraUnitPrice = ref<number | null>(null)
const teachingExtraSessionsPerUnit = ref<number | null>(null)

const clearAllGradeThresholds = () => {
  Object.assign(gradeThresholdPercents, emptyGradeThresholdPercents())
}

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
    // 舊生率/才藝率門檻：後端存 fraction（0–1），UI 一律顯示百分比（0–100）。
    rules.dividend_returning_threshold = fractionToPercent(rules.dividend_returning_threshold ?? 0)
    rules.dividend_activity_threshold = fractionToPercent(rules.dividend_activity_threshold ?? 0)
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

    // G15 兩新欄位：舊後端缺欄位（undefined）與新後端明確 null 皆視為「未設定」，
    // 由 gradeThresholdsFromApi 統一容錯，不炸也不需另外顯示「不支援」提示。
    const gradeThresholdsRaw = data.dividend_activity_grade_thresholds
    const gradeThresholdsDict =
      gradeThresholdsRaw && typeof gradeThresholdsRaw === 'object'
        ? (gradeThresholdsRaw as Record<string, number>)
        : null
    Object.assign(gradeThresholdPercents, gradeThresholdsFromApi(gradeThresholdsDict))

    const minSessionsRaw = data.dividend_activity_min_sessions
    dividendActivityMinSessions.value =
      typeof minSessionsRaw === 'number' ? minSessionsRaw : null

    // G8：兩欄同樣容錯（舊後端缺欄位 undefined / 新後端未設定 null 皆視為「沿用預設」）
    const teachingUnitPriceRaw = data.teaching_extra_unit_price
    teachingExtraUnitPrice.value =
      typeof teachingUnitPriceRaw === 'number' ? teachingUnitPriceRaw : null
    const teachingSessionsRaw = data.teaching_extra_sessions_per_unit
    teachingExtraSessionsPerUnit.value =
      typeof teachingSessionsRaw === 'number' ? teachingSessionsRaw : null
  } catch (e) {
    ElMessage.error(friendlyError('年終規則載入失敗', e))
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
  // 防禦：按鈕已 disabled，但函式仍可能被直接呼叫（測試/程式化觸發），
  // 需與 UI gate 同一道防線，避免繞過 disabled 直接打到後端吃 403。
  if (!canSaveRules.value) {
    ElMessage.warning('您沒有權限儲存年終規則（需 SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE）')
    return
  }
  // 與 BonusConfig PUT 對齊：變更影響全員年終規則，要求異動原因 ≥10 字（落 audit）。
  // Task B4：改走共用 confirmWithReason（含常用原因快選提示），移除重複 prompt 樣板。
  const reason = await confirmWithReason({
    title: '年終規則變更原因',
    message: '此變更會影響全員年終規則，請輸入異動原因（至少 10 個字）：',
    minLength: 10,
  })
  if (reason == null) return // 使用者按取消

  // 年終 JSON 欄位序列化：dict（班名→單價，略過空班名）+ id list
  const afterClassAwardDict: Record<string, number> = {}
  for (const row of afterClassAwardRows.value) {
    const name = row.className.trim()
    if (name) afterClassAwardDict[name] = Number(row.price) || 0
  }
  // 只送年終欄位；後端 PUT /config/bonus 為部分更新，會保留超額/節慶/底薪等其他設定。
  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...rules,
    // 舊生率/才藝率門檻：UI 百分比（0–100）→ 送後端仍為 fraction（0–1），覆寫 ...rules 展開值。
    dividend_returning_threshold: percentToFraction(rules.dividend_returning_threshold),
    dividend_activity_threshold: percentToFraction(rules.dividend_activity_threshold),
    after_class_award_unit_price: afterClassAwardDict,
    art_teacher_employee_ids: [...artTeacherEmployeeIds.value],
    // G15：逐年級門檻換算回 fraction dict（全空 → null 回退單一門檻）+ 堂數條件（null＝停用）。
    dividend_activity_grade_thresholds: gradeThresholdsToApi(gradeThresholdPercents),
    dividend_activity_min_sessions: dividendActivityMinSessions.value,
    // G8：留空＝null＝沿用後端預設（65 元／4 堂）
    teaching_extra_unit_price: teachingExtraUnitPrice.value,
    teaching_extra_sessions_per_unit: teachingExtraSessionsPerUnit.value,
    reason,
  }

  loading.value = true
  try {
    await updateBonusConfig(payload)
    notifyRuleChanged('年終規則已儲存')
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
    <ReadonlyBadge permission-label="年終規則設定" :show="!canSaveRules" />
    <div class="rules-actions">
      <el-tooltip
        content="需要「系統設定寫入」與「金流簽核」權限（SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE）"
        :disabled="canSaveRules"
        placement="top"
      >
        <span>
          <el-button
            type="primary"
            size="large"
            :disabled="!canSaveRules"
            @click="saveRules"
          >儲存年終規則</el-button>
        </span>
      </el-tooltip>
    </div>

    <p class="desc-text">
      年終獎金 E化引擎使用以下規則自動推導：才藝鼓勵金、學期紅利門檻、考勤扣款費率。
      設定後於年終結算「建立」階段套用，個別金額仍可在總表手動覆寫。
    </p>

    <!-- ① 才藝鼓勵 -->
    <div class="section-title">才藝鼓勵</div>
    <el-card class="mb-6" shadow="never">
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

    <!-- ⑥ 教課獎勵（②③ 為既有編號跳號留白，避免與其他意涵混淆改用下一個未用序號） -->
    <div class="section-title">教課獎勵</div>
    <el-card class="mb-6" shadow="never">
      <p class="desc-text">
        暫依 Excel 慣例（R1）：每滿 N 堂計 1 次 × 單價；留空＝沿用系統預設（65 元／4 堂）。
      </p>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="教課獎勵單價">
            <el-input-number
              v-model="teachingExtraUnitPrice"
              :min="0" :step="5"
              controls-position="right" style="width: 100%"
              :value-on-clear="null"
              placeholder="沿用預設 65"
            />
            <span class="unit-hint">元 / 次</span>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="每次堂數">
            <el-input-number
              v-model="teachingExtraSessionsPerUnit"
              :min="1" :step="1" :precision="0"
              controls-position="right" style="width: 100%"
              :value-on-clear="null"
              placeholder="沿用預設 4"
            />
            <span class="unit-hint">堂 / 次</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- ④ 學期紅利 -->
    <div class="section-title">學期紅利</div>
    <el-card class="mb-6" shadow="never">
      <p class="desc-text">舊生率 / 才藝率達門檻時，發放對應紅利。門檻為百分比（0–100，例：80 代表 80%）。</p>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item>
            <template #label>
              <el-tooltip content="舊生率達此門檻發放紅利（百分比，0–100）" placement="top">
                <span>舊生率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_returning_threshold"
              :min="0" :max="100" :step="1"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">%</span>
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
              <el-tooltip content="才藝率達此門檻發放紅利（百分比，0–100）" placement="top">
                <span>才藝率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_activity_threshold"
              :min="0" :max="100" :step="1"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">%</span>
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

      <el-divider />
      <div class="label mb-2" style="display: flex; align-items: center; justify-content: space-between">
        <span>才藝率逐年級門檻（選填，園方福利辦法 115.01.01）</span>
        <el-button size="small" link @click="clearAllGradeThresholds">清空全部年級門檻</el-button>
      </div>
      <p class="desc-text">
        逐年級設定才藝參與率門檻（百分比，0–100）；未設定之年級沿用上方「才藝率門檻」單一值。
        四個年級皆清空即整組回退為單一門檻。
      </p>
      <el-row :gutter="20">
        <el-col v-for="grade in DIVIDEND_ACTIVITY_GRADES" :key="grade" :span="6">
          <el-form-item :label="grade">
            <el-input-number
              v-model="gradeThresholdPercents[grade]"
              :min="0" :max="100" :step="1"
              controls-position="right" style="width: 100%"
              placeholder="沿用單一門檻"
            />
            <span class="unit-hint">%</span>
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <div class="label mb-2">堂數條件（選填）</div>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item>
            <template #label>
              <el-tooltip content="幼生該學期出席堂數「超過」此值才計入才藝參與率分子" placement="top">
                <span>幼生出席逾 N 堂才計入參加率</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="dividendActivityMinSessions"
              :min="0" :max="200" :step="1"
              controls-position="right" style="width: 100%"
              placeholder="留空＝停用堂數條件"
            />
            <span class="unit-hint">堂</span>
          </el-form-item>
          <p class="desc-text">
            提醒：點名資料不完整時建議停用（清空），避免因出席紀錄不齊而誤少發紅利。
          </p>
        </el-col>
      </el-row>
    </el-card>

    <!-- ⑤ 考勤扣款 -->
    <div class="section-title">考勤扣款</div>
    <el-card shadow="never">
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
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
