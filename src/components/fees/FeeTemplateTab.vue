<template>
  <div class="fee-template-tab">
    <div class="toolbar">
      <el-select v-model="filterYear" placeholder="學年" style="width: 130px" @change="loadTemplates">
        <el-option v-for="y in availableYears" :key="y" :value="y" :label="`${y} 學年度`" />
      </el-select>
      <el-select v-model="filterSemester" placeholder="學期" style="width: 110px" @change="loadTemplates">
        <el-option :value="1" label="上學期" />
        <el-option :value="2" label="下學期" />
      </el-select>
      <el-button type="primary" @click="openCreateDialog">新增範本</el-button>
      <el-button :disabled="!templates.length" @click="copyToNextSemester">
        複製到下學期
      </el-button>
    </div>

    <el-table :data="templates" v-loading="loading" border>
      <el-table-column label="年級" prop="grade_name" min-width="90" />
      <el-table-column label="費用類型" min-width="90">
        <template #default="{ row }">{{ feeTypeLabel(row.fee_type) }}</template>
      </el-table-column>
      <el-table-column label="名稱" prop="name" min-width="160" />
      <el-table-column label="金額" align="right" width="110">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="組成" min-width="200">
        <template #default="{ row }">
          <span v-if="row.breakdown" class="breakdown">
            <span v-for="(v, k) in row.breakdown" :key="k">
              {{ breakdownLabel(k) }}:{{ formatMoney(v) }}
            </span>
          </span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="繳費期限" width="100">
        <template #default="{ row }">{{ row.due_date_offset_days }} 天</template>
      </el-table-column>
      <el-table-column label="狀態" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '啟用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FeeTemplateDialog
      v-if="dialogVisible"
      v-model="dialogVisible"
      :template="editingTemplate"
      :grades="grades"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getFeeTemplates,
  deleteFeeTemplate,
  createFeeTemplate,
} from '@/api/fees'
import { getGrades } from '@/api/classrooms'
import FeeTemplateDialog from './FeeTemplateDialog.vue'

const filterYear = ref(114)
const filterSemester = ref(1)
const templates = ref([])
const grades = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingTemplate = ref(null)

const availableYears = computed(() => {
  // 民國年 = 西元年 - 1911
  const current = new Date().getFullYear() - 1911
  return [current - 1, current, current + 1]
})

const FEE_TYPE_LABELS = {
  registration: '註冊費',
  miscellaneous: '雜費',
  monthly: '月費',
}

const BREAKDOWN_LABELS = {
  tuition: '學費',
  meal: '餐點',
  transport: '交通',
}

function feeTypeLabel(t) {
  return FEE_TYPE_LABELS[t] || t
}
function breakdownLabel(k) {
  return BREAKDOWN_LABELS[k] || k
}
function formatMoney(n) {
  return n != null ? `NT$ ${Number(n).toLocaleString()}` : '—'
}

async function loadTemplates() {
  loading.value = true
  try {
    const list = await getFeeTemplates({
      school_year: filterYear.value,
      semester: filterSemester.value,
    })
    const gradeMap = Object.fromEntries(grades.value.map((g) => [g.id, g.name]))
    templates.value = (list || []).map((t) => ({
      ...t,
      grade_name: gradeMap[t.grade_id] || `#${t.grade_id}`,
    }))
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '載入範本失敗')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingTemplate.value = null
  dialogVisible.value = true
}

function openEditDialog(row) {
  editingTemplate.value = row
  dialogVisible.value = true
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`確認停用範本「${row.name}」?`, '提示', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteFeeTemplate(row.id)
    ElMessage.success('已停用')
    loadTemplates()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '停用失敗')
  }
}

function onSaved() {
  dialogVisible.value = false
  loadTemplates()
}

async function copyToNextSemester() {
  try {
    await ElMessageBox.confirm(
      `將 ${filterYear.value}-${filterSemester.value} 所有啟用範本複製到下學期?`,
      '複製範本',
      { type: 'info' },
    )
  } catch {
    return
  }
  const nextYear = filterSemester.value === 1 ? filterYear.value : filterYear.value + 1
  const nextSem = filterSemester.value === 1 ? 2 : 1
  let copied = 0
  let skipped = 0
  for (const t of templates.value.filter((x) => x.is_active)) {
    try {
      await createFeeTemplate({
        grade_id: t.grade_id,
        school_year: nextYear,
        semester: nextSem,
        fee_type: t.fee_type,
        // 若原名稱含類似「114-1」的字串就替換，否則保留原名
        name: t.name.replace(/\d+-[12]/, `${nextYear}-${nextSem}`),
        amount: t.amount,
        breakdown: t.breakdown,
        due_date_offset_days: t.due_date_offset_days,
      })
      copied++
    } catch (e) {
      if (e.response?.status === 409) {
        skipped++
      } else {
        ElMessage.error(e.response?.data?.detail || '複製失敗')
        throw e
      }
    }
  }
  ElMessage.success(`已複製 ${copied} 筆,跳過 ${skipped} 筆`)
  // 切換到目的學期讓 user 看到結果
  filterYear.value = nextYear
  filterSemester.value = nextSem
  loadTemplates()
}

onMounted(async () => {
  try {
    const res = await getGrades()
    grades.value = (res.data || []).slice().sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '載入年級失敗')
  }
  loadTemplates()
})
</script>

<style scoped>
.fee-template-tab {
  padding-top: var(--space-2, 8px);
}
.toolbar {
  display: flex;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
  flex-wrap: wrap;
}
.breakdown span {
  display: inline-block;
  margin-right: 8px;
  font-size: 12px;
  color: var(--text-secondary, #555);
}
.muted {
  color: var(--text-tertiary, #999);
}
</style>
