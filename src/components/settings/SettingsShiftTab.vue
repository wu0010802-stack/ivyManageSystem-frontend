<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createShiftType,
  deleteShiftType,
  getShiftTypes,
  updateShiftType,
} from '@/api/shifts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useShiftStore } from '@/stores/shift'
import { apiError } from '@/utils/error'
import type { ApiResponse } from '@/api/_generated/typed'

type ShiftTypeRow = ApiResponse<'/shifts/types', 'get'>[number]

const router = useRouter()
// 其他頁（排班管理等）共用 shiftStore；本 tab 需要 usage 計數所以自抓，
// 但每次異動後仍 refresh store，讓共用快取不過期。
const shiftStore = useShiftStore()

const rows = ref<ShiftTypeRow[]>([])
const loading = ref(false)

const fetchRows = async () => {
  loading.value = true
  try {
    const res = await getShiftTypes({ include_usage: true })
    rows.value = res.data
  } catch (error) {
    ElMessage.error(apiError(error, '載入班別失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchRows)

// ── 工時預覽（跨日與休息分鐘） ──────────────────────────────────────────────
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** end <= start 視為跨日（與後端 calculate_shift_hours 同語意） */
const isOvernight = (workStart: string, workEnd: string): boolean =>
  !!workStart && !!workEnd && toMinutes(workEnd) <= toMinutes(workStart)

const spanMinutes = (workStart: string, workEnd: string): number => {
  if (!workStart || !workEnd) return 0
  let span = toMinutes(workEnd) - toMinutes(workStart)
  if (span <= 0) span += 1440 // 跨日
  return span
}

const previewHours = (workStart: string, workEnd: string, breakMinutes: number): string => {
  if (!workStart || !workEnd) return '-'
  const mins = Math.max(0, spanMinutes(workStart, workEnd) - (breakMinutes || 0))
  return `${(mins / 60).toFixed(1)}h`
}

// ── 表單 ────────────────────────────────────────────────────────────────────
interface ShiftForm {
  id: number | null
  name: string
  work_start: string
  work_end: string
  break_minutes: number
  color: string | null
  sort_order: number
  is_active: boolean
}

const shiftDialogVisible = ref(false)
const shiftForm = reactive<ShiftForm>({
  id: null,
  name: '',
  work_start: '08:00',
  work_end: '17:00',
  break_minutes: 0,
  color: null,
  sort_order: 0,
  is_active: true,
})

// 品牌色系供快速挑選（可自訂其他色）
const PRESET_COLORS = ['#4EB87A', '#2D8F5A', '#FFD75E', '#FF8C42', '#69C4E0', '#909399']

const formPreviewHours = computed(() =>
  previewHours(shiftForm.work_start, shiftForm.work_end, shiftForm.break_minutes)
)
const formIsOvernight = computed(() => isOvernight(shiftForm.work_start, shiftForm.work_end))

const handleAddShift = () => {
  shiftForm.id = null
  shiftForm.name = ''
  shiftForm.work_start = '08:00'
  shiftForm.work_end = '17:00'
  shiftForm.break_minutes = 0
  shiftForm.color = null
  shiftForm.sort_order = rows.value.length + 1
  shiftForm.is_active = true
  shiftDialogVisible.value = true
}

const handleEditShift = (row: ShiftTypeRow) => {
  shiftForm.id = row.id
  shiftForm.name = row.name
  shiftForm.work_start = row.work_start
  shiftForm.work_end = row.work_end
  shiftForm.break_minutes = row.break_minutes ?? 0
  shiftForm.color = row.color ?? null
  shiftForm.sort_order = row.sort_order
  shiftForm.is_active = row.is_active
  shiftDialogVisible.value = true
}

const saveShift = async () => {
  if (!shiftForm.name.trim()) {
    ElMessage.warning('請填寫班別名稱')
    return
  }
  if (!shiftForm.work_start || !shiftForm.work_end) {
    ElMessage.warning('請填寫上下班時間')
    return
  }
  if (shiftForm.break_minutes >= spanMinutes(shiftForm.work_start, shiftForm.work_end)) {
    ElMessage.warning('休息分鐘不可大於等於班別時間跨度')
    return
  }
  try {
    if (shiftForm.id) {
      await updateShiftType(shiftForm.id, {
        name: shiftForm.name,
        work_start: shiftForm.work_start,
        work_end: shiftForm.work_end,
        break_minutes: shiftForm.break_minutes,
        color: shiftForm.color,
        sort_order: shiftForm.sort_order,
        is_active: shiftForm.is_active,
      })
    } else {
      await createShiftType({
        name: shiftForm.name,
        work_start: shiftForm.work_start,
        work_end: shiftForm.work_end,
        break_minutes: shiftForm.break_minutes,
        color: shiftForm.color,
        sort_order: shiftForm.sort_order,
      })
    }
    ElMessage.success('已儲存')
    shiftDialogVisible.value = false
    fetchRows()
    shiftStore.refresh()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存失敗'))
  }
}

// ── 停用／啟用（歷史排班使用中的班別走這條，不走刪除） ──────────────────────
const toggleActive = async (row: ShiftTypeRow) => {
  try {
    await updateShiftType(row.id, { is_active: !row.is_active })
    ElMessage.success(row.is_active ? '已停用（不再出現在新排班選單）' : '已重新啟用')
    fetchRows()
    shiftStore.refresh()
  } catch (error) {
    ElMessage.error(apiError(error, '狀態切換失敗'))
  }
}

// ── 刪除（使用中保護：改引導停用；後端另有 400 擋 hard delete） ────────────
const handleDeleteShift = async (row: ShiftTypeRow) => {
  const usageTotal = row.usage?.total ?? 0
  if (usageTotal > 0) {
    try {
      await ElMessageBox.confirm(
        `「${row.name}」已被 ${usageTotal} 筆排班／換班紀錄使用，不可刪除（會改寫歷史）。要改為停用嗎？停用後不再出現在新排班選單，歷史紀錄維持不變。`,
        '班別使用中',
        { confirmButtonText: '改為停用', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
    if (row.is_active) await toggleActive(row)
    return
  }
  try {
    await ElMessageBox.confirm(`確定刪除班別「${row.name}」？`, '警告', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteShiftType(row.id)
    ElMessage.success('已刪除')
    fetchRows()
    shiftStore.refresh()
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  }
}

const goSchedule = () => router.push('/schedule')
</script>

<template>
  <div>
    <div class="tab-header">
      <el-button type="primary" @click="handleAddShift">新增班別</el-button>
      <el-button data-test="go-schedule" @click="goSchedule">前往排班管理</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" style="width: 100%; margin-top: 20px;">
      <el-table-column prop="sort_order" label="排序" width="72" sortable />
      <el-table-column prop="name" label="班別名稱" min-width="120">
        <template #default="{ row }">
          <span
            v-if="row.color"
            class="color-dot"
            :style="{ backgroundColor: row.color }"
            aria-hidden="true"
          />
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column prop="work_start" label="上班" width="80" />
      <el-table-column prop="work_end" label="下班" width="80" />
      <el-table-column label="跨日" width="64" align="center">
        <template #default="{ row }">
          <el-tag v-if="isOvernight(row.work_start, row.work_end)" type="warning" size="small">跨日</el-tag>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="break_minutes" label="休息(分)" width="84" align="right" />
      <el-table-column label="預估工時" width="90" align="right">
        <template #default="{ row }">
          {{ previewHours(row.work_start, row.work_end, row.break_minutes) }}
        </template>
      </el-table-column>
      <el-table-column label="使用中" width="84" align="right">
        <template #default="{ row }">
          <span :class="{ 'text-muted': !(row.usage?.total) }">{{ row.usage?.total ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="is_active" label="狀態" width="76">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '啟用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190">
        <template #default="scope">
          <el-button link type="primary" @click="handleEditShift(scope.row)">編輯</el-button>
          <el-button link data-test="toggle-active" @click="toggleActive(scope.row)">
            {{ scope.row.is_active ? '停用' : '啟用' }}
          </el-button>
          <el-button link type="danger" @click="handleDeleteShift(scope.row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Shift Type Dialog -->
    <el-dialog v-model="shiftDialogVisible" :title="shiftForm.id ? '編輯班別' : '新增班別'" width="480px">
      <el-form :model="shiftForm" label-width="100px">
        <el-form-item label="班別名稱" required>
          <el-input v-model="shiftForm.name" placeholder="例如：早值" maxlength="50" />
        </el-form-item>
        <el-form-item label="上班時間" required>
          <el-time-select v-model="shiftForm.work_start" start="00:00" step="00:15" end="23:45" placeholder="選擇上班時間" />
        </el-form-item>
        <el-form-item label="下班時間" required>
          <el-time-select v-model="shiftForm.work_end" start="00:00" step="00:15" end="23:45" placeholder="選擇下班時間" />
        </el-form-item>
        <el-form-item label="休息分鐘">
          <el-input-number v-model="shiftForm.break_minutes" :min="0" :max="720" :step="5" />
        </el-form-item>
        <el-form-item label="計薪工時">
          <span data-test="hours-preview">{{ formPreviewHours }}</span>
          <el-tag v-if="formIsOvernight" type="warning" size="small" style="margin-left: 8px;">跨日班</el-tag>
        </el-form-item>
        <el-form-item label="辨識色">
          <el-color-picker v-model="shiftForm.color" :predefine="PRESET_COLORS" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="shiftForm.sort_order" :min="0" />
        </el-form-item>
        <el-form-item v-if="shiftForm.id" label="啟用">
          <el-switch v-model="shiftForm.is_active" data-test="active-switch" />
          <span class="form-hint">停用後不再出現在新排班選單；歷史排班顯示不變</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shiftDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveShift">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-header {
  margin-top: 10px;
  display: flex;
  gap: var(--space-3);
}
.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: baseline;
}
.text-muted {
  color: var(--text-tertiary);
}
.form-hint {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
