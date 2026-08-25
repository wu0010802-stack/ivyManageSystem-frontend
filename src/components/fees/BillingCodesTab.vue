<template>
  <div class="billing-codes-tab">
    <div class="toolbar">
      <el-select v-model="schoolYear" aria-label="選擇學年" style="width: 120px" data-test="bc-year">
        <el-option v-for="y in yearOptions" :key="y" :label="`${y} 學年`" :value="y" />
      </el-select>
      <el-radio-group v-model="semester" aria-label="選擇學期">
        <el-radio-button :value="1">上學期</el-radio-button>
        <el-radio-button :value="2">下學期</el-radio-button>
      </el-radio-group>
      <el-button
        v-if="canWrite"
        type="primary"
        data-test="bc-suggest"
        :loading="suggesting"
        aria-label="依現況班級與座號產生建議末四碼（僅預覽）"
        @click="runSuggest"
      >
        產生建議末四碼（預覽）
      </el-button>
      <span class="hint">規則：第 1 碼年級（1大 2中 3小 4幼）＋班序＋班內編號</span>
    </div>

    <!-- 建議預覽：摘要 → 需處理優先 → 無變更以篩選查看 -->
    <template v-if="suggestResult">
      <p class="suggest-summary" data-test="bc-suggest-summary">
        建議結果：新配發 {{ stateCounts.new }}
        <span aria-hidden="true">・</span>與現行衝突 {{ stateCounts.conflict }}
        <span aria-hidden="true">・</span>重複 {{ stateCounts.duplicate }}
        <span aria-hidden="true">・</span>無變更 {{ stateCounts.unchanged }}
        <span aria-hidden="true">・</span>無法產碼 {{ suggestResult.unassignable.length }}
      </p>
      <el-alert
        v-if="unresolvedCount > 0"
        type="warning"
        :closable="false"
        class="mb-2"
        :title="`有 ${unresolvedCount} 筆重複、衝突或無法產碼，啟用前請先人工處理`"
      />

      <div class="scope-row" role="group" aria-label="建議預覽篩選">
        <button
          v-for="scope in PREVIEW_SCOPES"
          :key="scope.value"
          type="button"
          class="scope-chip"
          :class="{ 'scope-chip--active': previewScope === scope.value }"
          :aria-pressed="previewScope === scope.value"
          :data-test="`bc-preview-scope-${scope.value}`"
          @click="previewScope = scope.value"
        >
          {{ scope.label }}
        </button>
      </div>

      <el-table
        :data="visibleSuggestions"
        size="small"
        border
        max-height="360"
        data-test="bc-suggest-table"
      >
        <el-table-column prop="student_name" label="學生" width="110" />
        <el-table-column prop="classroom_name" label="班級" width="90" />
        <el-table-column prop="grade_name" label="年級" width="80" />
        <el-table-column prop="suggested_suffix" label="建議末四碼" width="100" />
        <el-table-column prop="current_suffix" label="現行末四碼" width="100">
          <template #default="{ row }">{{ row.current_suffix || '—' }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="110">
          <template #default="{ row }">
            <el-tag :type="stateTag(row.state)" size="small">{{ stateLabel(row.state) }}</el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <span>
            {{ previewScope === 'pending' ? '沒有需處理的建議：全部為無變更，切換「無變更」或「全部」查看' : '此篩選下沒有資料' }}
          </span>
        </template>
      </el-table>

      <div v-if="suggestResult.unassignable.length" class="unassignable" data-test="bc-unassignable">
        <p class="unassignable__title">無法產碼名單（需人工處理）</p>
        <ul>
          <li v-for="(item, idx) in suggestResult.unassignable" :key="idx">
            {{ unassignableLabel(item) }}：{{ String(item.reason ?? '原因不明') }}
          </li>
        </ul>
      </div>

      <!-- 批次啟用固定在預覽區底部；只寫入「新配發」，不覆蓋衝突/重複 -->
      <div class="activate-bar">
        <el-date-picker
          v-model="effectiveFrom"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="生效日"
          aria-label="批次啟用生效日"
          style="width: 150px"
        />
        <el-button
          v-if="canWrite"
          type="primary"
          data-test="bc-activate"
          :disabled="activatableItems.length === 0 || !effectiveFrom"
          :loading="activating"
          :aria-label="`批次啟用 ${activatableItems.length} 筆新配發末四碼`"
          @click="runActivate"
        >
          確認啟用 {{ activatableItems.length }} 筆（略過衝突/重複）
        </el-button>
      </div>
    </template>

    <!-- 現行配置 -->
    <h4 class="section-title">現行有效配置</h4>
    <el-table :data="assignments" size="small" border v-loading="loading" data-test="bc-table">
      <el-table-column prop="code_suffix" label="末四碼" width="90" sortable />
      <el-table-column prop="student_name" label="學生" width="120" />
      <el-table-column prop="school_year" label="學年" width="80" />
      <el-table-column prop="semester" label="學期" width="70">
        <template #default="{ row }">{{ row.semester === 1 ? '上' : '下' }}</template>
      </el-table-column>
      <el-table-column prop="effective_from" label="生效日" width="110" />
      <!-- P1-1（跨端審查）：完整銷帳編號屬金融資訊，清單常駐顯示一律遮罩前段
           （會計配發時自有完整號；如需全號請查銀行對帳單/配置紀錄） -->
      <el-table-column label="完整銷帳編號" min-width="140">
        <template #default="{ row }">{{ maskCollection(row.full_collection_number) }}</template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="90">
        <template #default="{ row }">
          <el-button size="small" type="danger" text aria-label="停用此學生的末四碼" @click="deactivate(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  activateBillingCodes,
  deactivateBillingCode,
  getBillingCodes,
  suggestBillingCodes,
} from '@/api/fees'

interface Suggestion {
  student_id: number
  student_name: string
  classroom_id: number
  classroom_name: string | null
  grade_name: string
  suggested_suffix: string
  current_suffix: string | null
  state: string
}
interface SuggestResult {
  school_year: number
  semester: number
  suggestions: Suggestion[]
  unassignable: Record<string, unknown>[]
}
interface Assignment {
  id: number
  student_id: number
  student_name: string | null
  code_suffix: string
  school_year: number
  semester: number
  effective_from: string
  full_collection_number: string | null
}

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const currentYear = new Date().getFullYear() - 1911
const yearOptions = [currentYear - 1, currentYear, currentYear + 1]
const schoolYear = ref(currentYear)
const semester = ref<1 | 2>(1)
const effectiveFrom = ref('')

const loading = ref(false)
const suggesting = ref(false)
const activating = ref(false)
const assignments = ref<Assignment[]>([])
const suggestResult = ref<SuggestResult | null>(null)

const unresolvedCount = computed(() => {
  if (!suggestResult.value) return 0
  return (
    suggestResult.value.suggestions.filter(
      (s) => s.state === 'conflict' || s.state === 'duplicate',
    ).length + suggestResult.value.unassignable.length
  )
})
const activatableItems = computed(() =>
  (suggestResult.value?.suggestions ?? []).filter((s) => s.state === 'new'),
)

// 預覽篩選：預設「需處理」（新配發/衝突/重複），無變更以篩選查看
const PREVIEW_SCOPES = [
  { value: 'pending', label: '需處理' },
  { value: 'unchanged', label: '無變更' },
  { value: 'all', label: '全部' },
] as const
type PreviewScope = (typeof PREVIEW_SCOPES)[number]['value']
const previewScope = ref<PreviewScope>('pending')

const stateCounts = computed(() => {
  const counts = { new: 0, unchanged: 0, conflict: 0, duplicate: 0 }
  for (const s of suggestResult.value?.suggestions ?? []) {
    if (s.state in counts) counts[s.state as keyof typeof counts] += 1
  }
  return counts
})

const visibleSuggestions = computed(() => {
  const all = suggestResult.value?.suggestions ?? []
  if (previewScope.value === 'all') return all
  if (previewScope.value === 'unchanged') return all.filter((s) => s.state === 'unchanged')
  return all.filter((s) => s.state !== 'unchanged')
})

function unassignableLabel(item: Record<string, unknown>): string {
  if (item.student_id != null) return `學生 #${item.student_id}`
  if (item.classroom_id != null) return `班級 #${item.classroom_id}`
  return '項目'
}

function maskCollection(value: string | null): string {
  if (!value) return '—'
  if (value.length <= 4) return value
  return '•'.repeat(value.length - 4) + value.slice(-4)
}

function stateLabel(state: string): string {
  return (
    { new: '新配發', unchanged: '無變更', conflict: '與現行衝突', duplicate: '重複' }[
      state
    ] ?? state
  )
}
function stateTag(state: string): 'success' | 'info' | 'warning' | 'danger' {
  return (
    (
      {
        new: 'success',
        unchanged: 'info',
        conflict: 'warning',
        duplicate: 'danger',
      } as const
    )[state] ?? 'info'
  )
}

async function fetchAssignments() {
  loading.value = true
  try {
    assignments.value = (await getBillingCodes({ active_only: true })) as Assignment[]
  } catch (e) {
    ElMessage.error(friendlyError('載入銷帳碼失敗', e))
  } finally {
    loading.value = false
  }
}

async function runSuggest() {
  suggesting.value = true
  try {
    suggestResult.value = (await suggestBillingCodes({
      school_year: schoolYear.value,
      semester: semester.value,
    })) as SuggestResult
    previewScope.value = 'pending'
  } catch (e) {
    ElMessage.error(friendlyError('產生建議失敗', e))
  } finally {
    suggesting.value = false
  }
}

async function runActivate() {
  try {
    await ElMessageBox.confirm(
      `將啟用 ${activatableItems.value.length} 筆「新配發」末四碼（生效日 ${effectiveFrom.value}），` +
        '衝突與重複項目將略過、既有有效碼不會被覆蓋。',
      '確認批次啟用',
      { type: 'warning' },
    )
  } catch {
    return
  }
  activating.value = true
  try {
    const result = await activateBillingCodes({
      school_year: schoolYear.value,
      semester: semester.value,
      effective_from: effectiveFrom.value,
      items: activatableItems.value.map((s) => ({
        student_id: s.student_id,
        code_suffix: s.suggested_suffix,
      })),
    })
    ElMessage.success(`已啟用 ${result.activated} 筆（關閉舊碼 ${result.closed} 筆）`)
    suggestResult.value = null
    fetchAssignments()
  } catch (e) {
    ElMessage.error(friendlyError('啟用失敗', e))
  } finally {
    activating.value = false
  }
}

async function deactivate(row: Assignment) {
  try {
    await ElMessageBox.confirm(
      `確定停用學生「${row.student_name}」的末四碼 ${row.code_suffix}？歷史配置保留供對帳。`,
      '停用銷帳碼',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deactivateBillingCode(row.id, {
      effective_to: todayISO(),
      reason: '人工停用',
    })
    ElMessage.success('已停用')
    fetchAssignments()
  } catch (e) {
    ElMessage.error(friendlyError('停用失敗', e))
  }
}

onMounted(fetchAssignments)
defineExpose({ fetchAssignments })
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.suggest-summary {
  margin: 0 0 8px;
  font-size: var(--text-sm, 13px);
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.scope-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.scope-chip {
  padding: 4px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md, 6px);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: var(--text-sm, 13px);
  line-height: 1.4;
  cursor: pointer;
  transition: border-color var(--transition-fast, 0.15s), color var(--transition-fast, 0.15s);
}

.scope-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.scope-chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.scope-chip--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.unassignable {
  margin-top: 8px;
  font-size: var(--text-sm, 13px);
  color: var(--el-text-color-regular);
}

.unassignable__title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--el-color-danger);
}

.unassignable ul {
  margin: 0;
  padding-left: 20px;
}

.activate-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
  padding: 8px 0;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
}
.section-title {
  margin: 16px 0 8px;
}
.mb-2 {
  margin-bottom: 8px;
}
</style>
