<template>
  <div class="billing-codes-tab">
    <div class="toolbar">
      <el-select v-model="schoolYear" style="width: 120px" data-test="bc-year">
        <el-option v-for="y in yearOptions" :key="y" :label="`${y} 學年`" :value="y" />
      </el-select>
      <el-radio-group v-model="semester">
        <el-radio-button :value="1">上學期</el-radio-button>
        <el-radio-button :value="2">下學期</el-radio-button>
      </el-radio-group>
      <el-button
        v-if="canWrite"
        type="primary"
        data-test="bc-suggest"
        :loading="suggesting"
        @click="runSuggest"
      >
        產生建議末四碼（預覽）
      </el-button>
      <span class="hint">規則：第 1 碼年級（1大 2中 3小 4幼）＋班序＋班內編號</span>
    </div>

    <!-- 建議預覽 -->
    <el-alert
      v-if="suggestResult && unresolvedCount > 0"
      type="warning"
      :closable="false"
      class="mb-2"
      :title="`有 ${unresolvedCount} 筆重複或衝突，啟用前請先人工處理`"
    />
    <el-table
      v-if="suggestResult"
      :data="suggestResult.suggestions"
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
    </el-table>
    <div v-if="suggestResult" class="activate-bar">
      <el-date-picker
        v-model="effectiveFrom"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="生效日"
        style="width: 150px"
      />
      <el-button
        v-if="canWrite"
        type="success"
        data-test="bc-activate"
        :disabled="activatableItems.length === 0 || !effectiveFrom"
        :loading="activating"
        @click="runActivate"
      >
        確認啟用 {{ activatableItems.length }} 筆（略過衝突/重複）
      </el-button>
    </div>

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
          <el-button size="small" type="danger" text @click="deactivate(row)">停用</el-button>
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
  } catch (e) {
    ElMessage.error(friendlyError('產生建議失敗', e))
  } finally {
    suggesting.value = false
  }
}

async function runActivate() {
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
.activate-bar {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}
.section-title {
  margin: 16px 0 8px;
}
.mb-2 {
  margin-bottom: 8px;
}
</style>
