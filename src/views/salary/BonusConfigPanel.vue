<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig, getGradeTargets, updateGradeTargets } from '@/api/config'
import type { ApiBody } from '@/api/_generated/typed'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import OvertimeBonusTab from './components/OvertimeBonusTab.vue'
import FestivalBonusTab from './components/FestivalBonusTab.vue'
import StandardSalaryTab from './components/StandardSalaryTab.vue'
import JobTitleGradeTab from './components/JobTitleGradeTab.vue'

const loadingBonus = ref(false)
const activeBonusTab = ref('overtime')
const canReadSalarySettings = computed(() => hasPermission('SETTINGS_READ'))
// 金流硬化（薪資模組稽核 P2）：儲存動作最終送到 PUT /config/bonus，
// 後端除 SETTINGS_WRITE 外還額外要求 has_finance_approve（ACTIVITY_PAYMENT_APPROVE），
// 見 ivy-backend api/config/bonus.py update_bonus_config。前端 gate 需對齊，
// 否則唯讀（SETTINGS_READ）使用者會填完整張表、過完異動原因提示才吃 403。
const canSaveBonusSettings = computed(
  () => hasPermission('SETTINGS_WRITE') && hasPermission('ACTIVITY_PAYMENT_APPROVE'),
)

const bonusConfig = reactive({
  head_teacher_ab: 0,
  head_teacher_c: 0,
  assistant_teacher_ab: 0,
  assistant_teacher_c: 0,
  principal_festival: 0,
  director_festival: 0,
  leader_festival: 0,
  driver_festival: 0,
  designer_festival: 0,
  admin_festival: 0,
  principal_dividend: 0,
  director_dividend: 0,
  leader_dividend: 0,
  vice_leader_dividend: 0,
  overtime_head_normal: 0,
  overtime_head_baby: 0,
  overtime_assistant_normal: 0,
  overtime_assistant_baby: 0,
  school_wide_target: 0,
  // 在籍人數計算模式（2026-06-13 L3）：month_end=月底快照 / daily_weighted=按日加權
  enrollment_count_mode: 'month_end',
  // 階段 2-B：園規常數從 hardcode 搬到 BonusConfig
  meeting_default_hours: 2,
  meeting_absence_penalty: 100,
  art_teacher_festival: 2000,
})

const gradeTargets = ref<Record<string, unknown>[]>([])

const fetchBonusConfig = async () => {
  loadingBonus.value = true
  try {
    const response = await getBonusConfig()
    const data = response.data as Record<string, unknown>
    Object.assign(bonusConfig, data)
  } catch (error) {
    ElMessage.error('薪資設定載入失敗')
  } finally {
    loadingBonus.value = false
  }
}

const fetchGradeTargets = async () => {
  try {
    const response = await getGradeTargets()
    gradeTargets.value = Object.entries(response.data as Record<string, Record<string, unknown>>).map(([name, data]) => ({
      name,
      ...data,
    }))
  } catch (error) {
    ElMessage.error('年級目標載入失敗')
  }
}

// 回傳 true=已成功儲存；false=使用者取消原因輸入 或 API 失敗。
// saveAllBonusSettings 依此決定是否續存年級目標與是否顯示總成功訊息，
// 避免「取消原因/儲存失敗」時仍寫入年級目標並謊報全部成功。
const saveBonusConfig = async (): Promise<boolean> => {
  // bug sweep 2026-05-16 P1-5：BonusConfig 變更影響全員獎金基數，
  // 後端對齊 PUT /insurance/brackets 要求 reason ≥10 字 + ACTIVITY_PAYMENT_APPROVE。
  let reason
  try {
    const result = await ElMessageBox.prompt(
      '此變更會影響全員獎金基數，請輸入異動原因（至少 10 個字）：',
      '獎金設定變更原因',
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
      }
    )
    reason = (result as { value: string }).value.trim()
  } catch {
    return false // 使用者按取消
  }

  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...bonusConfig,
    reason,
  }

  loadingBonus.value = true
  try {
    await updateBonusConfig(payload)
    ElMessage.success('薪資設定已儲存')
    return true
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    ElMessage.error(typeof detail === 'string' ? detail : '薪資設定儲存失敗')
    return false
  } finally {
    loadingBonus.value = false
  }
}

const saveGradeTargets = async (): Promise<boolean> => {
  try {
    const updatePromises = gradeTargets.value.map(grade => {
      const payload = {
        grade_name: grade.name,
        festival_two_teachers: grade.festival_two_teachers,
        festival_one_teacher: grade.festival_one_teacher,
        festival_shared: grade.festival_shared,
        overtime_two_teachers: grade.overtime_two_teachers,
        overtime_one_teacher: grade.overtime_one_teacher,
        overtime_shared: grade.overtime_shared
      }
      return updateGradeTargets(payload)
    })
    await Promise.all(updatePromises)
    return true
  } catch (error) {
    ElMessage.error('年級目標儲存失敗')
    return false
  }
}

const saveAllBonusSettings = async () => {
  // 防禦：按鈕已 disabled，但函式仍可能被直接呼叫（測試/程式化觸發），
  // 需與 UI gate 同一道防線，避免繞過 disabled 直接打到後端吃 403。
  if (!canSaveBonusSettings.value) {
    ElMessage.warning('您沒有權限儲存薪資設定（需 SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE）')
    return
  }
  loadingBonus.value = true
  try {
    // 費率是稽核閘門（需異動原因）：取消或失敗就不得續存年級目標、也不得謊報全部成功
    const bonusOk = await saveBonusConfig()
    if (!bonusOk) return
    const gradeOk = await saveGradeTargets()
    if (gradeOk) ElMessage.success('所有薪資設定已儲存')
  } finally {
    loadingBonus.value = false
  }
}

onMounted(() => {
  if (!canReadSalarySettings.value) return
  fetchBonusConfig()
  fetchGradeTargets()
})
</script>

<template>
  <div v-if="canReadSalarySettings" v-loading="loadingBonus">
    <div class="bonus-actions">
      <el-tooltip
        content="需要「系統設定寫入」與「金流簽核」權限（SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE）"
        :disabled="canSaveBonusSettings"
        placement="top"
      >
        <span>
          <el-button
            type="primary"
            size="large"
            :disabled="!canSaveBonusSettings"
            @click="saveAllBonusSettings"
          >儲存所有薪資設定</el-button>
        </span>
      </el-tooltip>
    </div>

    <el-tabs v-model="activeBonusTab" type="border-card">
      <!-- 超額獎金 -->
      <el-tab-pane label="超額獎金" name="overtime">
        <OvertimeBonusTab :bonus-config="bonusConfig" :grade-targets="gradeTargets" />
      </el-tab-pane>

      <!-- 節慶獎金（合併：教師基數 + 主管獎金 + 目標人數） -->
      <el-tab-pane label="節慶獎金" name="festival">
        <FestivalBonusTab :bonus-config="bonusConfig" :grade-targets="gradeTargets" />
      </el-tab-pane>

      <!-- 職位標準底薪 -->
      <el-tab-pane label="職位標準底薪" name="position_salary">
        <StandardSalaryTab />
      </el-tab-pane>

      <!-- 階段 2-D：職稱→節慶獎金等級對應 -->
      <el-tab-pane label="職稱等級對應" name="job_title_grade">
        <JobTitleGradeTab />
      </el-tab-pane>
    </el-tabs>
  </div>
  <el-alert v-else type="warning" :closable="false" show-icon title="目前帳號沒有查看薪資設定的權限" />
</template>

<style scoped>
/* section-title / box-card / label / desc-text / config-grid / card-header 等
   已隨各 tab 樣板搬進對應子元件（src/views/salary/components/*Tab.vue）的
   scoped style，此處只留父層自己模板（外部儲存按鈕列）仍在用的 class。
   .kv-row / .unit-hint 在拆分前就已無任何模板引用（dead code），一併移除。 */
.bonus-actions {
  margin-bottom: var(--space-4);
  text-align: right;
}
</style>
