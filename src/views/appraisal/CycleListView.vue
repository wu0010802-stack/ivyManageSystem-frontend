<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Lock, Unlock, FolderChecked, Setting } from '@element-plus/icons-vue'
import {
  listAppraisalCycles,
  createAppraisalCycle,
  lockAppraisalCycle,
  unlockAppraisalCycle,
  closeAppraisalCycle,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'

const router = useRouter()
const loading = ref(false)
const cycles = ref([])
const dialogVisible = ref(false)
const submitting = ref(false)

const semesterOptions = [
  { value: 'FIRST', label: '上學期' },
  { value: 'SECOND', label: '下學期' },
]

const statusMeta = {
  OPEN: { label: '進行中', type: 'success' },
  LOCKED: { label: '已鎖定', type: 'warning' },
  CLOSED: { label: '已封存', type: 'info' },
}

const semesterLabel = (v) =>
  semesterOptions.find((o) => o.value === v)?.label || v

const form = reactive({
  academic_year: null,
  semester: 'FIRST',
  base_score_calc_date: null,
})

const resetForm = () => {
  form.academic_year = null
  form.semester = 'FIRST'
  form.base_score_calc_date = null
}

const fetchCycles = async () => {
  loading.value = true
  try {
    const res = await listAppraisalCycles()
    cycles.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入週期列表失敗'))
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const submitCreate = async () => {
  if (!form.academic_year || form.academic_year < 100 || form.academic_year > 200) {
    ElMessage.warning('學年需介於民國 100 ~ 200 年')
    return
  }
  submitting.value = true
  try {
    const payload = {
      academic_year: Number(form.academic_year),
      semester: form.semester,
    }
    if (form.base_score_calc_date) {
      payload.base_score_calc_date = form.base_score_calc_date
    }
    await createAppraisalCycle(payload)
    ElMessage.success('週期已建立')
    dialogVisible.value = false
    fetchCycles()
  } catch (error) {
    const detail = error.response?.data?.detail || ''
    if (detail.startsWith('cycle_already_exists')) {
      ElMessage.error('該學年/學期已建立過週期')
    } else {
      ElMessage.error(apiError(error, '建立失敗'))
    }
  } finally {
    submitting.value = false
  }
}

// 後端錯誤碼 → UI 友善訊息（見 cycles.py / unlock & close handler）
const mapCycleActionError = (error, fallback) => {
  const detail = error.response?.data?.detail || ''
  if (detail.startsWith('cycle_status_invalid')) return '週期狀態不允許此操作（可能已被他人變更）'
  if (detail.startsWith('cycle_closed')) return '已封存週期不可再變更'
  if (detail.startsWith('not_all_finalized')) return '仍有 summary 未到 FINALIZED 狀態，無法封存'
  if (detail === 'cycle_not_found') return '週期不存在或已刪除'
  return apiError(error, fallback)
}

const doLock = async (row) => {
  try {
    await ElMessageBox.confirm(
      `鎖定週期「${row.academic_year} 學年 ${semesterLabel(row.semester)}」後將禁止新增/修改事件，確定？`,
      '鎖定週期',
      { type: 'warning', confirmButtonText: '鎖定', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await lockAppraisalCycle(row.id)
    ElMessage.success('週期已鎖定')
    fetchCycles()
  } catch (error) {
    ElMessage.error(mapCycleActionError(error, '鎖定失敗'))
  }
}

const doUnlock = async (row) => {
  let reason
  try {
    const res = await ElMessageBox.prompt(
      '解鎖會記錄稽核軌跡並通知最高主管，請輸入原因（≥ 4 字）',
      '解鎖週期',
      {
        confirmButtonText: '解鎖',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (v) =>
          (v && v.trim().length >= 4) || '原因至少需 4 個字',
      },
    )
    reason = res.value.trim()
  } catch {
    return
  }
  try {
    await unlockAppraisalCycle(row.id, reason)
    ElMessage.success('週期已解鎖')
    fetchCycles()
  } catch (error) {
    ElMessage.error(mapCycleActionError(error, '解鎖失敗'))
  }
}

const doClose = async (row) => {
  try {
    await ElMessageBox.confirm(
      `封存後此週期不可再變動，並會列入歷史紀錄。封存前須所有考核 summary 達 FINALIZED 狀態。確定封存「${row.academic_year} 學年 ${semesterLabel(row.semester)}」？`,
      '封存週期',
      { type: 'warning', confirmButtonText: '封存', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await closeAppraisalCycle(row.id)
    ElMessage.success('週期已封存')
    fetchCycles()
  } catch (error) {
    ElMessage.error(mapCycleActionError(error, '封存失敗'))
  }
}

const sortedCycles = computed(() =>
  [...cycles.value].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return b.academic_year - a.academic_year
    return a.semester === 'FIRST' ? -1 : 1
  }),
)

onMounted(fetchCycles)
</script>

<template>
  <div class="cycle-list-view">
    <header class="page-header">
      <p class="hint">每學期一個週期；OPEN 期間可登錄事件，LOCKED 後唯讀，CLOSED 後封存歷史。</p>
      <div class="actions">
        <el-button :icon="Refresh" @click="fetchCycles" :loading="loading">重新整理</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">建立週期</el-button>
      </div>
    </header>

    <el-table
      :data="sortedCycles"
      v-loading="loading"
      empty-text="尚無週期，點擊右上角「建立週期」開始"
      stripe
    >
      <el-table-column label="學年" width="100">
        <template #default="{ row }">{{ row.academic_year }} 學年</template>
      </el-table-column>
      <el-table-column label="學期" width="100">
        <template #default="{ row }">{{ semesterLabel(row.semester) }}</template>
      </el-table-column>
      <el-table-column label="起訖日期" min-width="200">
        <template #default="{ row }">
          {{ row.start_date }} ～ {{ row.end_date }}
        </template>
      </el-table-column>
      <el-table-column label="基數計算日" prop="base_score_calc_date" width="140" />
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="statusMeta[row.status]?.type || ''" disable-transitions>
            {{ statusMeta[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="建立時間" prop="created_at" width="180">
        <template #default="{ row }">
          {{ row.created_at?.slice(0, 19).replace('T', ' ') }}
        </template>
      </el-table-column>
      <el-table-column label="動作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            :icon="Setting"
            @click="router.push(`/appraisal/cycles/${row.id}`)"
          >管理</el-button>
          <el-button
            v-if="row.status === 'OPEN'"
            size="small"
            :icon="Lock"
            @click="doLock(row)"
          >鎖定</el-button>
          <el-button
            v-if="row.status === 'LOCKED'"
            size="small"
            :icon="Unlock"
            @click="doUnlock(row)"
          >解鎖</el-button>
          <el-button
            v-if="row.status !== 'CLOSED'"
            size="small"
            type="danger"
            :icon="FolderChecked"
            @click="doClose(row)"
          >封存</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      title="建立考核週期"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px" @submit.prevent="submitCreate">
        <el-form-item label="學年" required>
          <el-input-number
            v-model="form.academic_year"
            :min="100"
            :max="200"
            :step="1"
            placeholder="民國學年（例 114）"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="學期" required>
          <el-radio-group v-model="form.semester">
            <el-radio-button
              v-for="opt in semesterOptions"
              :key="opt.value"
              :value="opt.value"
            >{{ opt.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="基數計算日">
          <el-date-picker
            v-model="form.base_score_calc_date"
            type="date"
            placeholder="留空則自動帶入（上學期 9/15、下學期 3/15）"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
        >建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cycle-list-view {
  padding: var(--space-5);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-5);
  gap: var(--space-4);
}

.page-header h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xl);
  color: var(--text-primary);
}

.page-header .hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
</style>
