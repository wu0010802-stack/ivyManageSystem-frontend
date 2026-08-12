<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { WORKSPACE_STEPS, normalizeStep, type WorkspaceStepKey } from './workspaceSteps'
import { listYearEndCycles, updateCycleStatus, getCycleProgress } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { CYCLE_STATUS_TAG, cycleStatusLabel } from '@/constants/appraisalYearEnd'
// 多租戶：UI 偏好走 tenantStorage wrapper（單租戶模式 key 與改造前逐字相同，DEV-12）。
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

const YearEndConfigView = defineAsyncComponent(() => import('./YearEndConfigView.vue'))
const YearEndGridView = defineAsyncComponent(() => import('./YearEndGridView.vue'))
const YearEndDetailView = defineAsyncComponent(() => import('./YearEndDetailView.vue'))

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const step = computed<WorkspaceStepKey>(() => normalizeStep(route.query.step))
function goStep(key: WorkspaceStepKey) {
  if (key === step.value) return
  router.replace({ query: { ...route.query, step: key } })
}

const RAIL_COLLAPSE_KEY = 'ye-workspace-rail-collapsed'
const collapsed = ref(tenantGetItem(RAIL_COLLAPSE_KEY) === '1')
function toggleCollapse() {
  collapsed.value = !collapsed.value
  tenantSetItem(RAIL_COLLAPSE_KEY, collapsed.value ? '1' : '0')
}

// ── 週期頭 + 狀態機（Task 7：自 YearEndDetailView 上移）──────────────────────
// 這些是跨步驟共用的週期級動作（鎖定/封存/退回），不屬於任一步驟的內容，
// 故常駐 shell 頭部；三個步驟 view 各自吃 cycleId prop 專注自己的內容。
interface YearEndCycle { id: number; academic_year: number; bonus_calc_date: string; status: string }
interface CycleProgress {
  cycle_status: string
  settings_complete: boolean
  settings_missing_count: number
  settlement_count: number
  unmatched_count: number
  sign_counts: Record<string, number>
  pending_sign_count: number
  finalized_count: number
  total_count: number
  exception_count: number
}

const cycle = ref<YearEndCycle | null>(null)
const progress = ref<CycleProgress | null>(null)
const canFinalize = computed(() => hasPermission('YEAR_END_FINALIZE'))
const statusBusy = ref(false)

// 批次 A①：載入失敗不再靜默（原空 catch 讓表頭/導軌數字無聲消失，使用者會誤信
// 「進度為空＝沒有待辦」）。維持降級語意（不擋既有操作），但失敗必須可見且可重試。
const cycleLoadFailed = ref(false)
const progressLoadFailed = ref(false)
const headerLoadFailed = computed(() => cycleLoadFailed.value || progressLoadFailed.value)

async function loadCycle() {
  try {
    const res = await listYearEndCycles()
    const cycles = res.data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    cycleLoadFailed.value = false
  } catch {
    cycleLoadFailed.value = true
  }
}

async function loadProgress() {
  try {
    const res = await getCycleProgress(cycleId)
    progress.value = res.data as CycleProgress
    progressLoadFailed.value = false
  } catch {
    progressLoadFailed.value = true
  }
}

function retryHeaderLoad() {
  loadCycle()
  loadProgress()
}

onMounted(() => {
  // 兩者彼此無依賴，各自 fire-and-forget（各自 try/catch 已處理降級，不需 Promise.all 聚合錯誤）
  loadCycle()
  loadProgress()
})

async function transitionStatus(newStatus: 'OPEN' | 'LOCKED' | 'CLOSED', confirmMessage: string) {
  if (!cycle.value) return
  try {
    await ElMessageBox.confirm(confirmMessage, '確認狀態變更', { type: 'warning' })
  } catch {
    return // 使用者按取消
  }
  statusBusy.value = true
  try {
    await updateCycleStatus(cycle.value.id, { status: newStatus })
    ElMessage.success('週期狀態已更新')
    // 讓表頭狀態 tag 與導軌數字一併更新
    await Promise.all([loadCycle(), loadProgress()])
  } catch (e) {
    ElMessage.error(apiError(e, '狀態更新失敗'))
  } finally {
    statusBusy.value = false
  }
}

function lockCycle() {
  return transitionStatus('LOCKED', `確定要鎖定「${cycle.value?.academic_year} 學年度」週期嗎？鎖定後將無法再自動重新試算。`)
}

// 封存前置檢核：改用 progress.pending_sign_count（= total - finalized，與 Detail
// 原本用 settlements 本地過濾 status !== 'FINALIZED' 同義），shell 不必自載 settlements。
// fail-closed：cycle 與 progress 各自獨立載入（見 loadCycle/loadProgress），progress
// 尚未就緒或載入失敗時 pending_sign_count 未知，不可用 ?? 0 當「無待簽」而放行封存
// ——舊版 cycle+settlements 原子載入、沒載成功「封存」鈕根本不出現；重構後兩者分離，
// 若在此以 fail-open 處理，會把仍有未核定結算單的週期送去封存（BE 雖有守衛擋，但
// FE 無警示直接送出，對使用者是誤導）。
async function closeCycle() {
  if (progress.value == null) {
    ElMessage.warning('週期進度尚未載入完成，暫時無法確認是否可封存，請稍後再試')
    return
  }
  const pending = progress.value.pending_sign_count
  if (pending > 0) {
    ElMessageBox.alert(
      `尚有 ${pending} 筆結算單未核定（FINALIZED），無法封存。請先完成簽核。`,
      '無法封存',
      { type: 'error' },
    )
    return
  }
  return transitionStatus('CLOSED', `封存前請確認：此週期所有結算單須全數核定（FINALIZED）。確定要封存「${cycle.value?.academic_year} 學年度」週期嗎？`)
}
function reopenToLocked() {
  return transitionStatus('LOCKED', `確定要將「${cycle.value?.academic_year} 學年度」退回鎖定狀態嗎？（救援用途）`)
}
function reopenToOpen() {
  return transitionStatus('OPEN', `確定要將「${cycle.value?.academic_year} 學年度」退回開放狀態嗎？（救援用途）`)
}
</script>

<template>
  <div class="ye-workspace" :class="{ 'ye-workspace--collapsed': collapsed }">
    <nav class="ye-rail" aria-label="年終流程導軌">
      <button class="ye-rail__toggle" type="button" @click="toggleCollapse"
        :aria-label="collapsed ? '展開導軌' : '收合導軌'">{{ collapsed ? '»' : '«' }}</button>
      <ul class="ye-rail__steps">
        <li v-for="s in WORKSPACE_STEPS" :key="s.key">
          <button
            type="button"
            class="ye-rail__step"
            :class="{ 'is-active': step === s.key }"
            :data-test="`rail-step-${s.key}`"
            :aria-current="step === s.key ? 'step' : undefined"
            @click="goStep(s.key)"
          >
            <span class="ye-rail__label">
              {{ s.label }}
              <span
                v-if="s.key === 'config' && progress && progress.settings_missing_count > 0"
                data-test="rail-badge-config"
                class="ye-rail__badge"
              >缺 {{ progress.settings_missing_count }}</span>
              <span v-else-if="s.key === 'grid' && progress" data-test="rail-count-grid" class="ye-rail__count">
                {{ progress.settlement_count }}
                <span
                  v-if="progress.unmatched_count > 0"
                  data-test="rail-badge-grid-unmatched"
                  class="ye-rail__badge"
                >未匹配 {{ progress.unmatched_count }}</span>
              </span>
              <span v-else-if="s.key === 'detail' && progress" data-test="rail-count-detail" class="ye-rail__count">
                待簽 {{ progress.pending_sign_count }}
              </span>
            </span>
            <span v-if="!collapsed" class="ye-rail__hint">{{ s.hint }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <section class="ye-workspace__body">
      <!-- Task 7：週期頭（學年/基準日/狀態）+ 狀態機 toolbar，自 YearEndDetailView 上移常駐 -->
      <div class="ye-header">
        <!-- 批次 A①：載入失敗可見化＋重試（原空 catch 靜默降級） -->
        <el-alert
          v-if="headerLoadFailed"
          type="error" :closable="false" show-icon
          title="週期資訊載入失敗，學年、狀態與流程進度可能未顯示。"
          data-test="header-load-error"
          style="margin-bottom: 12px"
        >
          <el-button size="small" data-test="header-retry-button" @click="retryHeaderLoad">重試</el-button>
        </el-alert>
        <div v-if="cycle" class="ye-header__meta">
          <strong>{{ cycle.academic_year }} 學年度</strong> ｜
          基準日 {{ cycle.bonus_calc_date }} ｜
          <el-tag :type="CYCLE_STATUS_TAG[cycle.status] || 'info'" size="small">{{ cycleStatusLabel(cycle.status) }}</el-tag>
          <span v-if="progress" class="ye-header__progress" data-test="header-progress">
            已核定 {{ progress.finalized_count }} / {{ progress.total_count }}
          </span>
        </div>

        <!-- LOCKED 週期語意明示——鎖定後僅可簽核/核定，不可再試算/手動調整/改設定 -->
        <el-alert
          v-if="cycle?.status === 'LOCKED'"
          type="info" :closable="false" show-icon
          title="週期已鎖定：僅可簽核與核定；不可再試算、手動調整或修改設定。"
          style="margin-bottom: 12px"
        />

        <div class="ye-toolbar">
          <template v-if="canFinalize && cycle">
            <el-button
              v-if="cycle.status === 'OPEN'"
              type="warning"
              :loading="statusBusy"
              data-test="lock-cycle-button"
              @click="lockCycle"
            >鎖定</el-button>
            <template v-else-if="cycle.status === 'LOCKED'">
              <el-button
                type="primary"
                :loading="statusBusy"
                data-test="close-cycle-button"
                @click="closeCycle"
              >封存</el-button>
              <el-button
                :loading="statusBusy"
                data-test="reopen-open-button"
                @click="reopenToOpen"
              >退回開放</el-button>
            </template>
            <el-button
              v-else-if="cycle.status === 'CLOSED'"
              :loading="statusBusy"
              data-test="reopen-locked-button"
              @click="reopenToLocked"
            >退回鎖定</el-button>
          </template>
        </div>
      </div>

      <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
      <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
      <YearEndDetailView v-else :cycle-id="cycleId" />
    </section>
  </div>
</template>

<style scoped>
.ye-workspace { display: flex; gap: var(--space-4); align-items: flex-start; padding: var(--space-4); }
.ye-rail { flex: 0 0 200px; position: sticky; top: var(--space-4); }
.ye-workspace--collapsed .ye-rail { flex-basis: 56px; }
.ye-rail__toggle { border: none; background: transparent; cursor: pointer; color: var(--text-secondary); margin-bottom: var(--space-2); }
.ye-rail__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.ye-rail__step { width: 100%; text-align: left; border: none; background: transparent; cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border-left: 3px solid transparent; display: flex; flex-direction: column; gap: 2px; }
.ye-rail__step.is-active { background: var(--el-color-primary-light-9); border-left-color: var(--el-color-primary); }
.ye-rail__label { font-weight: 600; font-size: var(--text-sm); display: flex; align-items: center; gap: 6px; }
.ye-rail__hint { font-size: var(--text-xs); color: var(--text-secondary); }
.ye-rail__count { font-weight: 400; font-size: var(--text-xs); color: var(--text-secondary); }
.ye-rail__badge { margin-left: 2px; font-size: var(--text-xs); font-weight: 600; color: var(--el-color-warning);
  background: var(--el-color-warning-light-9); border-radius: var(--radius-sm, 4px); padding: 0 6px; }
.ye-workspace__body { flex: 1; min-width: 0; }
.ye-header { margin-bottom: var(--space-3); }
.ye-header__meta { margin: var(--space-3) 0; padding: var(--space-3); background: var(--el-fill-color-light, #f5f7fa); border-radius: 4px; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ye-header__progress { margin-left: auto; font-size: var(--text-sm); color: var(--text-secondary); }
.ye-toolbar { margin: var(--space-2) 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
</style>
