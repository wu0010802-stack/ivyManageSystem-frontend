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
import { ElMessageBox } from 'element-plus'

import {
  getAppraisalCyclesByYear,
  patchAppraisalCycle,
} from '@/api/appraisal'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { hasPermission } from '@/utils/auth'
import ReadonlyBadge from '@/components/common/ReadonlyBadge.vue'
import { getCurrentAcademicTerm, buildSchoolYearOptions } from '@/utils/academic'
import { autoEnrollmentCaption } from '@/utils/headcountLabels'
import { formatTaipeiDateTimeMinute } from '@/utils/format'
import { injectOpenCycleHint } from '@/views/appraisalYearEnd/shared/useOpenCycleHint'
import CreateCycleDialog from './components/CreateCycleDialog.vue'
import TargetCrossRef from '@/views/appraisalYearEnd/shared/TargetCrossRef.vue'
import type { CreatedCycle } from './composables/useCreateCycle'
import { confirmWithReason } from '@/views/appraisalYearEnd/shared/confirmWithReason'

interface CycleEntry {
  id: number
  semester?: string
  enrollment_target?: number | null
  enrollment_actual?: number | null
  base_score?: number | null
  base_score_calc_date?: string
  enrollment_actual_auto?: number | null
  enrollment_actual_overridden?: boolean
  enrollment_actual_override_reason?: string | null
  [key: string]: unknown
}

interface EditForm {
  enrollment_target: number
  enrollment_actual: number | null
  /** 註冊口徑下是否手動覆寫招生實際人數（spec C7） */
  override: boolean
  override_reason: string
}

/** 後端 OVERRIDE_REASON_MIN_LEN（api/appraisal/cycles.py）：覆寫原因 trim 後至少 10 字 */
const OVERRIDE_REASON_MIN_LEN = 10

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
/**
 * spec C1：OPEN 期間補登收款會改變註冊數。`enrollment_actual_auto` 是後端在每次
 * GET 時即時計算（CycleOut 未帶 updated_at），故「最後計算」取本頁最後一次載入的時間。
 */
const loadedAt = ref<string>('—')

const firstCycle = computed<CycleEntry | null>(() => cycles.value.find((c) => c.semester === 'FIRST') || null)
const secondCycle = computed<CycleEntry | null>(() => cycles.value.find((c) => c.semester === 'SECOND') || null)

async function load() {
  loading.value = true
  try {
    const { data } = await getAppraisalCyclesByYear(selectedYear.value)
    cycles.value = (Array.isArray(data) ? data : []) as CycleEntry[]
    loadedAt.value = formatTaipeiDateTimeMinute(new Date())
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
const emptyForm = (): EditForm => ({
  enrollment_target: 0,
  enrollment_actual: null,
  override: false,
  override_reason: '',
})
const editForm = ref<Record<SemesterKey, EditForm>>({
  FIRST: emptyForm(),
  SECOND: emptyForm(),
})
const savingSemester = ref<Record<SemesterKey, boolean>>({ FIRST: false, SECOND: false })

// Task B4：目標人數修改（PATCH /appraisal/cycles/{id}）與 CreateCycleDialog
// 的建立週期共用同一後端守衛（Permission.APPRAISAL_FINALIZE，見
// ivy-backend api/appraisal/cycles.py update_cycle），故沿用同一權限字串；
// 獨立命名 canEditTarget 以對應「編輯已存在週期」這個不同的使用者動作。
const canEditTarget = computed(() => hasPermission('APPRAISAL_FINALIZE'))

// ── spec C7：註冊口徑下招生實際人數自動帶入基準日註冊數 ──────────────
// 後端只在新口徑（基準日所在月 ≥ cutoff）回 enrollment_actual_auto；舊口徑租戶／學期
// 為 null 且未覆寫 → 維持原本手填行為，不唯讀、不出覆寫按鈕（零漂移）。
function usesRegisteredBasis(cycle: CycleEntry): boolean {
  return cycle.enrollment_actual_auto != null || cycle.enrollment_actual_overridden === true
}

/** 編輯中「實際註冊」是否唯讀：註冊口徑且尚未進入手動覆寫。 */
function isActualLocked(cycle: CycleEntry): boolean {
  const semester = cycle.semester as SemesterKey
  return usesRegisteredBasis(cycle) && !editForm.value[semester].override
}

function startOverride(semester: SemesterKey) {
  editForm.value[semester].override = true
}

function canSaveEdit(cycle: CycleEntry): boolean {
  const form = editForm.value[cycle.semester as SemesterKey]
  if (!usesRegisteredBasis(cycle) || !form.override) return true
  return form.override_reason.trim().length >= OVERRIDE_REASON_MIN_LEN
}

/**
 * 組 PATCH body。註冊口徑未覆寫時不送 enrollment_actual（前端手上的數字可能已過時，
 * 送出去會被當成覆寫而 422），改送 `enrollment_actual_overridden: false`：後端先寫
 * target，再以基準日註冊數重寫 actual 並重算 base_score——只送 target 會跳過
 * actual 處理，base_score 停在舊值。
 */
function buildPatchPayload(cycle: CycleEntry, form: EditForm) {
  if (!usesRegisteredBasis(cycle)) {
    return { enrollment_target: form.enrollment_target, enrollment_actual: form.enrollment_actual }
  }
  if (!form.override) {
    return { enrollment_target: form.enrollment_target, enrollment_actual_overridden: false }
  }
  return {
    enrollment_target: form.enrollment_target,
    enrollment_actual: form.enrollment_actual,
    enrollment_actual_override_reason: form.override_reason.trim(),
  }
}

/**
 * 檢視模式的「實際註冊」：註冊口徑未覆寫時顯示即時註冊數（enrollment_actual_auto），
 * 已覆寫或舊口徑顯示存檔值；auto 為 null 時退回存檔值。
 */
function displayedActual(cycle: CycleEntry): number | null {
  if (!cycle.enrollment_actual_overridden && cycle.enrollment_actual_auto != null) {
    return cycle.enrollment_actual_auto
  }
  return cycle.enrollment_actual ?? null
}

/**
 * 基礎分數是存檔值（隨 enrollment_actual 一併存）；未覆寫且即時註冊數已與存檔值
 * 不同時提示「重算後生效」，避免把畫面上的基礎分數誤讀成以即時註冊數算的。
 */
function pendingAutoNote(cycle: CycleEntry): string | null {
  const auto = cycle.enrollment_actual_auto
  if (cycle.enrollment_actual_overridden || auto == null) return null
  if (auto === (cycle.enrollment_actual ?? null)) return null
  return `目前註冊數 ${auto}，重算後生效`
}

// 建週期 dialog 的註冊口徑說明：本學年已有週期帶 enrollment_actual_auto 才顯示
const registeredModeInUse = computed(() => cycles.value.some((c) => c.enrollment_actual_auto != null))

async function restoreAuto(cycle: CycleEntry) {
  if (!canEditTarget.value) return
  try {
    await ElMessageBox.confirm(
      '恢復後招生實際人數改回自動帶入基準日註冊數，基礎分數隨之重算。',
      '恢復自動帶入',
      { confirmButtonText: '恢復自動', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await patchAppraisalCycle(cycle.id, { enrollment_actual_overridden: false })
    notifyRuleChanged('已恢復自動帶入註冊數')
    editing.value[cycle.semester as SemesterKey] = false
    await load()
  } catch (e) {
    notify(e, 'YearlyEnrollmentTargetSection:restoreAuto', '恢復自動帶入失敗')
  }
}

function startEdit(cycle: CycleEntry) {
  // 防禦：UI 已用 disabled + tooltip 擋，仍保留一道守衛避免繞過。
  if (!canEditTarget.value) return
  const semester = cycle.semester as SemesterKey
  editForm.value[semester] = {
    enrollment_target: cycle.enrollment_target ?? 0,
    enrollment_actual: cycle.enrollment_actual ?? null,
    override: cycle.enrollment_actual_overridden === true,
    override_reason: cycle.enrollment_actual_override_reason ?? '',
  }
  editing.value[semester] = true
}

function cancelEdit(semester: SemesterKey) {
  editing.value[semester] = false
}

async function saveEdit(cycle: CycleEntry) {
  if (!canEditTarget.value || !canSaveEdit(cycle)) return
  const semester = cycle.semester as SemesterKey
  // 手動覆寫已在表單內填原因（並隨 PATCH 送出），不再跳第二次原因確認
  const inlineOverride = usesRegisteredBasis(cycle) && editForm.value[semester].override
  if (!inlineOverride) {
    const reason = await confirmWithReason({
      title: '確認更新目標人數',
      message: '此變更會影響考核基礎分數計算，請確認並填寫原因。',
      minLength: 10,
    })
    if (reason == null) return
  }
  savingSemester.value[semester] = true
  try {
    await patchAppraisalCycle(cycle.id, buildPatchPayload(cycle, editForm.value[semester]))
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
    <ReadonlyBadge permission-label="考核核定" :show="!canEditTarget" />
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
                <span data-test="actual-value-first">{{ displayedActual(firstCycle) ?? '—' }}</span>
                <div v-if="usesRegisteredBasis(firstCycle)" class="actual-meta" data-test="actual-meta-first">
                  <template v-if="firstCycle.enrollment_actual_overridden">
                    <el-tag size="small" type="warning">已手動覆寫</el-tag>
                    <span class="actual-meta__text">自動註冊數 {{ firstCycle.enrollment_actual_auto ?? '—' }}</span>
                    <span v-if="firstCycle.enrollment_actual_override_reason" class="actual-meta__reason">
                      原因：{{ firstCycle.enrollment_actual_override_reason }}
                    </span>
                    <el-button
                      size="small"
                      link
                      type="primary"
                      :disabled="!canEditTarget"
                      data-test="restore-first-btn"
                      @click="restoreAuto(firstCycle)"
                    >
                      恢復自動
                    </el-button>
                  </template>
                  <template v-else>
                    <span class="actual-meta__text">{{ autoEnrollmentCaption(firstCycle.base_score_calc_date) }}</span>
                    <span class="actual-meta__text">最後計算：{{ loadedAt }}</span>
                  </template>
                </div>
              </el-descriptions-item>
              <el-descriptions-item label="基礎分數">
                {{ firstCycle.base_score != null ? Number(firstCycle.base_score).toFixed(1) : '—' }}
                <span v-if="pendingAutoNote(firstCycle)" class="actual-meta__text" data-test="base-score-pending-first">{{ pendingAutoNote(firstCycle) }}</span>
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
              :actual="displayedActual(firstCycle)"
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
                  :disabled="isActualLocked(firstCycle)"
                />
                <div v-if="usesRegisteredBasis(firstCycle)" class="actual-meta" data-test="edit-first-actual-caption">
                  <template v-if="!editForm.FIRST.override">
                    <span class="actual-meta__text">{{ autoEnrollmentCaption(firstCycle.base_score_calc_date) }}</span>
                    <el-button size="small" link type="primary" data-test="override-first-btn" @click="startOverride('FIRST')">
                      手動覆寫
                    </el-button>
                  </template>
                  <span v-else class="actual-meta__text">
                    手動覆寫（自動註冊數 {{ firstCycle.enrollment_actual_auto ?? '—' }}）
                  </span>
                </div>
              </el-form-item>
              <el-form-item v-if="usesRegisteredBasis(firstCycle) && editForm.FIRST.override" label="覆寫原因">
                <el-input
                  v-model="editForm.FIRST.override_reason"
                  type="textarea"
                  :rows="2"
                  maxlength="500"
                  placeholder="至少 10 字，例：業主裁定本學期以在籍名冊計算"
                  data-test="override-reason-first"
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
                :disabled="!canSaveEdit(firstCycle)"
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
                <span data-test="actual-value-second">{{ displayedActual(secondCycle) ?? '—' }}</span>
                <div v-if="usesRegisteredBasis(secondCycle)" class="actual-meta" data-test="actual-meta-second">
                  <template v-if="secondCycle.enrollment_actual_overridden">
                    <el-tag size="small" type="warning">已手動覆寫</el-tag>
                    <span class="actual-meta__text">自動註冊數 {{ secondCycle.enrollment_actual_auto ?? '—' }}</span>
                    <span v-if="secondCycle.enrollment_actual_override_reason" class="actual-meta__reason">
                      原因：{{ secondCycle.enrollment_actual_override_reason }}
                    </span>
                    <el-button
                      size="small"
                      link
                      type="primary"
                      :disabled="!canEditTarget"
                      data-test="restore-second-btn"
                      @click="restoreAuto(secondCycle)"
                    >
                      恢復自動
                    </el-button>
                  </template>
                  <template v-else>
                    <span class="actual-meta__text">{{ autoEnrollmentCaption(secondCycle.base_score_calc_date) }}</span>
                    <span class="actual-meta__text">最後計算：{{ loadedAt }}</span>
                  </template>
                </div>
              </el-descriptions-item>
              <el-descriptions-item label="基礎分數">
                {{ secondCycle.base_score != null ? Number(secondCycle.base_score).toFixed(1) : '—' }}
                <span v-if="pendingAutoNote(secondCycle)" class="actual-meta__text" data-test="base-score-pending-second">{{ pendingAutoNote(secondCycle) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="基準日">
                {{ secondCycle.base_score_calc_date || '—' }}
              </el-descriptions-item>
            </el-descriptions>
            <!-- Task B6：三處目標人數對照（理由同上學期卡，見上方註解） -->
            <TargetCrossRef
              :cycle-target="secondCycle.enrollment_target ?? null"
              :org-setting-target="null"
              :actual="displayedActual(secondCycle)"
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
                  :disabled="isActualLocked(secondCycle)"
                />
                <div v-if="usesRegisteredBasis(secondCycle)" class="actual-meta" data-test="edit-second-actual-caption">
                  <template v-if="!editForm.SECOND.override">
                    <span class="actual-meta__text">{{ autoEnrollmentCaption(secondCycle.base_score_calc_date) }}</span>
                    <el-button size="small" link type="primary" data-test="override-second-btn" @click="startOverride('SECOND')">
                      手動覆寫
                    </el-button>
                  </template>
                  <span v-else class="actual-meta__text">
                    手動覆寫（自動註冊數 {{ secondCycle.enrollment_actual_auto ?? '—' }}）
                  </span>
                </div>
              </el-form-item>
              <el-form-item v-if="usesRegisteredBasis(secondCycle) && editForm.SECOND.override" label="覆寫原因">
                <el-input
                  v-model="editForm.SECOND.override_reason"
                  type="textarea"
                  :rows="2"
                  maxlength="500"
                  placeholder="至少 10 字，例：業主裁定本學期以在籍名冊計算"
                  data-test="override-reason-second"
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
                :disabled="!canSaveEdit(secondCycle)"
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
      :registered-mode="registeredModeInUse"
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

.actual-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: 12px;
  color: var(--text-secondary);
}

.actual-meta__reason {
  flex-basis: 100%;
}

.semester-card__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
