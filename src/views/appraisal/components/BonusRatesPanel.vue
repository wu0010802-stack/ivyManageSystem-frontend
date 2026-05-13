<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import {
  listAppraisalBonusRates,
  createAppraisalBonusRate,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'

const rates = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)

const roleGroupOptions = [
  { value: 'SUPERVISOR', label: '主管' },
  { value: 'HEAD_TEACHER', label: '主教' },
  { value: 'ASSISTANT', label: '助教' },
]
const roleGroupLabel = (v) =>
  roleGroupOptions.find((o) => o.value === v)?.label || v

const gradeOptions = [
  { value: 'OUTSTANDING', label: '優' },
  { value: 'GOOD', label: '甲' },
  { value: 'PASS', label: '乙' },
  { value: 'WARN', label: '丙' },
  { value: 'FAIL', label: '丁' },
]
const gradeLabel = (v) => gradeOptions.find((o) => o.value === v)?.label || v
const gradeTagType = {
  OUTSTANDING: 'success',
  GOOD: 'success',
  PASS: '',
  WARN: 'warning',
  FAIL: 'danger',
}

const sortedRates = computed(() =>
  [...rates.value].sort((a, b) => {
    if (a.effective_from !== b.effective_from)
      return a.effective_from < b.effective_from ? 1 : -1
    if (a.role_group !== b.role_group)
      return a.role_group.localeCompare(b.role_group)
    return a.grade.localeCompare(b.grade)
  }),
)

const form = reactive({
  effective_from: null,
  role_group: 'HEAD_TEACHER',
  grade: 'GOOD',
  base_amount: 0,
})

const resetForm = () => {
  form.effective_from = null
  form.role_group = 'HEAD_TEACHER'
  form.grade = 'GOOD'
  form.base_amount = 0
}

const fetchRates = async () => {
  loading.value = true
  try {
    const res = await listAppraisalBonusRates()
    rates.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入獎金率失敗'))
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.effective_from) {
    ElMessage.warning('請選擇生效日')
    return
  }
  if (form.base_amount < 0) {
    ElMessage.warning('金額不可為負')
    return
  }
  submitting.value = true
  try {
    await createAppraisalBonusRate({
      effective_from: form.effective_from,
      role_group: form.role_group,
      grade: form.grade,
      base_amount: form.base_amount,
    })
    ElMessage.success('已新增版本')
    dialogVisible.value = false
    fetchRates()
  } catch (error) {
    if (error.response?.data?.detail?.startsWith('bonus_rate_conflict')) {
      ElMessage.error('同生效日 + 角色群 + 等第 已存在版本')
    } else {
      ElMessage.error(apiError(error, '新增失敗'))
    }
  } finally {
    submitting.value = false
  }
}

onMounted(fetchRates)
</script>

<template>
  <div class="bonus-rates-panel">
    <div class="panel-head">
      <div>
        <p class="hint">
          年終獎金率為「versioned setting」，依生效日疊加；engine 在重算 summary 時取對應日期的最新版本。
          舊版本不應刪除（保留歷史對齊）。
        </p>
      </div>
      <div class="actions">
        <el-button :icon="Refresh" @click="fetchRates" :loading="loading">
          重新整理
        </el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">
          新增版本
        </el-button>
      </div>
    </div>

    <el-table
      :data="sortedRates"
      v-loading="loading"
      empty-text="尚無獎金率版本"
      stripe
    >
      <el-table-column label="生效日" prop="effective_from" width="140" />
      <el-table-column label="角色群" min-width="120">
        <template #default="{ row }">{{ roleGroupLabel(row.role_group) }}</template>
      </el-table-column>
      <el-table-column label="等第" width="100" align="center">
        <template #default="{ row }">
          <el-tag
            :type="gradeTagType[row.grade] || ''"
            disable-transitions
            size="small"
          >{{ gradeLabel(row.grade) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="基數金額" prop="base_amount" align="right" min-width="140">
        <template #default="{ row }">
          <strong>${{ Number(row.base_amount).toLocaleString() }}</strong>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      title="新增獎金率版本"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px" @submit.prevent="submitForm">
        <el-form-item label="生效日" required>
          <el-date-picker
            v-model="form.effective_from"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="此日（含）起套用此費率"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="角色群" required>
          <el-select v-model="form.role_group" style="width: 100%">
            <el-option
              v-for="opt in roleGroupOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="等第" required>
          <el-select v-model="form.grade" style="width: 100%">
            <el-option
              v-for="opt in gradeOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="基數金額" required>
          <el-input-number
            v-model="form.base_amount"
            :min="0"
            :step="1000"
            :precision="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          建立
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bonus-rates-panel {
  padding: var(--space-2) 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-4);
  gap: var(--space-3);
}

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  max-width: 600px;
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
</style>
