<script setup lang="ts">
/**
 * YearlyEnrollmentTargetSection — 學年度目標人數設定
 *
 * 上下學期 side-by-side 卡片明確區分目標人數，可分別編輯。
 * 缺學期 cycle 時提供 placeholder 含「建立本學期週期」捷徑，
 * 起訖日/基準日由後端依 academic_year+semester 固定推算。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, Check } from '@element-plus/icons-vue'

import {
  getAppraisalCyclesByYear,
  patchAppraisalCycle,
} from '@/api/appraisal'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { hasPermission } from '@/utils/auth'
import { getCurrentAcademicTerm, buildSchoolYearOptions } from '@/utils/academic'
import { injectOpenCycleHint } from './composables/useOpenCycleHint'
import CreateCycleDialog from './components/CreateCycleDialog.vue'
import TargetCrossRef from './components/TargetCrossRef.vue'
import type { CreatedCycle } from './composables/useCreateCycle'
import { confirmWithReason } from './confirmWithReason'

interface CycleEntry {
  id: number
  semester?: string
  enrollment_target?: number | null
  enrollment_actual?: number | null
  base_score?: number | null
  base_score_calc_date?: string
  [key: string]: unknown
}

type SemesterKey = 'FIRST' | 'SECOND'

const { notify } = useErrorNotify()

// Task B5：規則變更影響提示——目標人數修改成功後，若有 OPEN 週期
// 則提示「此變更於下次試算/重算生效」。
const { notifyRuleChanged } = injectOpenCycleHint()

const currentTerm = getCurrentAcademicTerm()
const selectedYear = ref(currentTerm.school_year)
const yearOptions = computed(() => buildSchoolYearOptions(currentTerm.school_year, 5))

const cycles = ref<CycleEntry[]>([]) // 0-2 筆 CycleOut
const loading = ref(false)

const firstCycle = computed<CycleEntry | null>(() => cycles.value.find((c) => c.semester === 'FIRST') || null)
const secondCycle = computed<CycleEntry | null>(() => cycles.value.find((c) => c.semester === 'SECOND') || null)

async function load() {
  loading.value = true
  try {
    const { data } = await getAppraisalCyclesByYear(selectedYear.value)
    cycles.value = (Array.isArray(data) ? data : []) as CycleEntry[]
  } catch (e) {
    notify(e, 'YearlyEnrollmentTargetSection:load', '載入學年週期失敗')
    cycles.value = []
  } finally {
    loading.value = false
  }
}

watch(selectedYear, load)
onMounted(load)

// ── 編輯模式 state（per semester）──────────────────────────
const editing = ref<Record<SemesterKey, boolean>>({ FIRST: false, SECOND: false })
const editForm = ref<Record<SemesterKey, { enrollment_target: number; enrollment_actual: number | null }>>({
  FIRST: { enrollment_target: 0, enrollment_actual: null },
  SECOND: { enrollment_target: 0, enrollment_actual: null },
})
const savingSemester = ref<Record<SemesterKey, boolean>>({ FIRST: false, SECOND: false })

// Task B4：目標人數修改（PATCH /appraisal/cycles/{id}）與 CreateCycleDialog
// 的建立週期共用同一後端守衛（Permission.APPRAISAL_FINALIZE，見
// ivy-backend api/appraisal/cycles.py update_cycle），故沿用同一權限字串；
// 獨立命名 canEditTarget 以對應「編輯已存在週期」這個不同的使用者動作。
const canEditTarget = computed(() => hasPermission('APPRAISAL_FINALIZE'))

function startEdit(cycle: CycleEntry) {
  // 防禦：UI 已用 disabled + tooltip 擋，仍保留一道守衛避免繞過。
  if (!canEditTarget.value) return
  const semester = cycle.semester as SemesterKey
  editForm.value[semester] = {
    enrollment_target: cycle.enrollment_target ?? 0,
    enrollment_actual: cycle.enrollment_actual ?? null,
  }
  editing.value[semester] = true
}

function cancelEdit(semester: SemesterKey) {
  editing.value[semester] = false
}

async function saveEdit(cycle: CycleEntry) {
  if (!canEditTarget.value) return
  const semester = cycle.semester as SemesterKey
  const reason = await confirmWithReason({
    title: '確認更新目標人數',
    message: '此變更會影響考核基礎分數計算，請確認並填寫原因。',
    minLength: 10,
  })
  if (reason == null) return
  savingSemester.value[semester] = true
  try {
    await patchAppraisalCycle(cycle.id, {
      enrollment_target: editForm.value[semester].enrollment_target,
      enrollment_actual: editForm.value[semester].enrollment_actual,
    })
    notifyRuleChanged('已更新目標人數')
    editing.value[semester] = false
    await load()
  } catch (e) {
    notify(e, 'YearlyEnrollmentTargetSection:save', '更新失敗')
  } finally {
    savingSemester.value[semester] = false
  }
}

// ── 建立學期 cycle（Task A7：改開統一 CreateCycleDialog，本區只負責開關 dialog
// 與 @created 後 reload；建立/日期推算/寫入權限全移入該共用元件）──
const createDialogVisible = ref(false)
// canWrite gate 對齊後端 POST /appraisal/cycles 守衛（Permission.APPRAISAL_FINALIZE）
const canCreateCycle = computed(() => hasPermission('APPRAISAL_FINALIZE'))

// ⚠ 修正記錄（code review Task A7，真 UX 回歸）：openCreateDialog 原本無參數，dialog
// 一律 fallback 重置為全域 termStore 當前值，與本頁自己的 selectedYear（可 ±5 年瀏覽）
// 及使用者點擊的卡片（FIRST/SECOND）context 脫節。改為記錄被點擊卡片的學期，連同
// selectedYear 一起以 defaultYear/defaultSemester 傳給 CreateCycleDialog，讓 dialog
// 預帶值與畫面上下文一致。
const pendingCreateSemester = ref<SemesterKey>('FIRST')

function openCreateDialog(semester: SemesterKey) {
  pendingCreateSemester.value = semester
  createDialogVisible.value = true
}

// CreateCycleDialog 自身已在 submit 成功時彈「考核週期已建立」toast，此處僅需 reload。
async function handleCycleCreated(_cycle: CreatedCycle) {
  await load()
}
</script>

<template>
  <div class="yearly-target-section" v-loading="loading">
    <div class="toolbar">
      <label class="year-label">學年度</label>
      <el-select
        v-model="selectedYear"
        style="width: 160px"
        data-test="year-selector"
      >
        <el-option
          v-for="y in yearOptions"
          :key="y"
          :value="y"
          :label="`${y} 學年度`"
        />
      </el-select>
    </div>

    <div class="semester-grid">
      <!-- 上學期 -->
      <div class="semester-card" data-test="card-first">
        <div class="semester-card__header">
          <span class="semester-card__title">上學期 (FIRST)</span>
          <el-tag v-if="firstCycle" size="small" type="success">已建立</el-tag>
          <el-tag v-else size="small" type="info">未建立</el-tag>
        </div>
        <template v-if="firstCycle">
          <template v-if="!editing.FIRST">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="目標人數">
                {{ firstCycle.enrollment_target ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="實際註冊">
                {{ firstCycle.enrollment_actual ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="基礎分數">
                {{ firstCycle.base_score != null ? Number(firstCycle.base_score).toFixed(1) : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="基準日">
                {{ firstCycle.base_score_calc_date || '—' }}
              </el-descriptions-item>
            </el-descriptions>
            <!-- Task B6：三處目標人數對照（本頁僅取得考核週期目標/實際註冊，
            年終 org_settings 目標須至「年終結算 → 本期設定」核對，此處傳 null） -->
            <TargetCrossRef
              :cycle-target="firstCycle.enrollment_target ?? null"
              :org-setting-target="null"
              :actual="firstCycle.enrollment_actual ?? null"
            />
            <div class="semester-card__actions">
              <el-tooltip content="需要考核核定權限（APPRAISAL_FINALIZE）" :disabled="canEditTarget" placement="top">
                <span>
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="!canEditTarget"
                    data-test="edit-first-btn"
                    @click="startEdit(firstCycle)"
                  >
                    編輯
                  </el-button>
                </span>
              </el-tooltip>
            </div>
          </template>
          <template v-else>
            <el-form label-width="100px" size="small">
              <el-form-item label="目標人數">
                <el-input-number
                  v-model="editForm.FIRST.enrollment_target"
                  :min="0"
                  data-test="edit-first-target"
                />
              </el-form-item>
              <el-form-item label="實際註冊">
                <el-input-number
                  v-model="editForm.FIRST.enrollment_actual"
                  :min="0"
                />
              </el-form-item>
            </el-form>
            <div class="semester-card__actions">
              <el-button size="small" @click="cancelEdit('FIRST')">取消</el-button>
              <el-button
                size="small"
                type="primary"
                :icon="Check"
                :loading="savingSemester.FIRST"
                data-test="save-first-btn"
                @click="saveEdit(firstCycle)"
              >
                儲存
              </el-button>
            </div>
          </template>
        </template>
        <template v-else>
          <el-empty description="本學期尚未建立考核週期" :image-size="80">
            <el-button
              type="primary"
              :icon="Plus"
              data-test="create-first-btn"
              @click="openCreateDialog('FIRST')"
            >
              建立本學期週期
            </el-button>
          </el-empty>
        </template>
      </div>

      <!-- 下學期 -->
      <div class="semester-card" data-test="card-second">
        <div class="semester-card__header">
          <span class="semester-card__title">下學期 (SECOND)</span>
          <el-tag v-if="secondCycle" size="small" type="success">已建立</el-tag>
          <el-tag v-else size="small" type="info">未建立</el-tag>
        </div>
        <template v-if="secondCycle">
          <template v-if="!editing.SECOND">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="目標人數">
                {{ secondCycle.enrollment_target ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="實際註冊">
                {{ secondCycle.enrollment_actual ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="基礎分數">
                {{ secondCycle.base_score != null ? Number(secondCycle.base_score).toFixed(1) : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="基準日">
                {{ secondCycle.base_score_calc_date || '—' }}
              </el-descriptions-item>
            </el-descriptions>
            <!-- Task B6：三處目標人數對照（理由同上學期卡，見上方註解） -->
            <TargetCrossRef
              :cycle-target="secondCycle.enrollment_target ?? null"
              :org-setting-target="null"
              :actual="secondCycle.enrollment_actual ?? null"
            />
            <div class="semester-card__actions">
              <el-tooltip content="需要考核核定權限（APPRAISAL_FINALIZE）" :disabled="canEditTarget" placement="top">
                <span>
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="!canEditTarget"
                    data-test="edit-second-btn"
                    @click="startEdit(secondCycle)"
                  >
                    編輯
                  </el-button>
                </span>
              </el-tooltip>
            </div>
          </template>
          <template v-else>
            <el-form label-width="100px" size="small">
              <el-form-item label="目標人數">
                <el-input-number
                  v-model="editForm.SECOND.enrollment_target"
                  :min="0"
                  data-test="edit-second-target"
                />
              </el-form-item>
              <el-form-item label="實際註冊">
                <el-input-number
                  v-model="editForm.SECOND.enrollment_actual"
                  :min="0"
                />
              </el-form-item>
            </el-form>
            <div class="semester-card__actions">
              <el-button size="small" @click="cancelEdit('SECOND')">取消</el-button>
              <el-button
                size="small"
                type="primary"
                :icon="Check"
                :loading="savingSemester.SECOND"
                data-test="save-second-btn"
                @click="saveEdit(secondCycle)"
              >
                儲存
              </el-button>
            </div>
          </template>
        </template>
        <template v-else>
          <el-empty description="本學期尚未建立考核週期" :image-size="80">
            <el-button
              type="primary"
              :icon="Plus"
              data-test="create-second-btn"
              @click="openCreateDialog('SECOND')"
            >
              建立本學期週期
            </el-button>
          </el-empty>
        </template>
      </div>
    </div>

    <!-- 建立考核週期 dialog（Task A7：統一 3 入口；本區兩顆「建立本學期週期」按鈕
    共用同一 dialog，開啟時預帶本頁 selectedYear + 點擊當下卡片所屬學期，與畫面
    上下文一致——使用者仍可在完整表單內自行調整，見 useCreateCycle.ts
    resetToCurrentTerm）-->
    <CreateCycleDialog
      v-model:visible="createDialogVisible"
      :can-write="canCreateCycle"
      :default-year="selectedYear"
      :default-semester="pendingCreateSemester"
      @created="handleCycleCreated"
    />
  </div>
</template>

<style scoped>
.yearly-target-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.year-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.semester-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

@media (max-width: 720px) {
  .semester-grid {
    grid-template-columns: 1fr;
  }
}

.semester-card {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 200px;
}

.semester-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.semester-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.semester-card__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
