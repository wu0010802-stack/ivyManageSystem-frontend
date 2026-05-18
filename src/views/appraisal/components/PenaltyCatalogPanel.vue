<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Edit } from '@element-plus/icons-vue'
import {
  listAppraisalPenaltyCatalog,
  patchAppraisalPenaltyCatalog,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'

interface PenaltyItem {
  id: number
  code?: string
  category?: string
  subcategory?: string
  description?: string
  default_event_type?: string
  default_score_delta?: number | string
  severity_max?: number
  display_order?: number
  is_active?: boolean
  [key: string]: unknown
}

const items = ref<PenaltyItem[]>([])
const loading = ref(false)
const showInactive = ref(false)
const categoryFilter = ref('')

const dialogVisible = ref(false)
const submitting = ref(false)
const editTarget = ref<PenaltyItem | null>(null)
const form = reactive({
  default_score_delta: 0,
  severity_max: 1,
  display_order: 0,
  is_active: true,
})

const categoryOptions = [
  { value: '', label: '全部分類' },
  { value: 'MISCONDUCT', label: '行為不當' },
  { value: 'MEDICATION', label: '用藥相關' },
  { value: 'ACCIDENT', label: '意外事故' },
  { value: 'DISPUTE', label: '糾紛' },
  { value: 'NEGLIGENCE', label: '疏失' },
  { value: 'MERIT', label: '功績' },
  { value: 'SPECIAL', label: '特別事件' },
]
const categoryLabel = (v: string) =>
  categoryOptions.find((o) => o.value === v)?.label || v

const eventTypeLabel: Record<string, string> = {
  MAJOR_MERIT: '大功',
  MINOR_MERIT: '小功',
  COMMENDATION: '嘉獎',
  WARNING: '警告',
  MINOR_DEMERIT: '小過',
  MAJOR_DEMERIT: '大過',
  ORAL_WARNING: '口頭警告',
  SCORE_ADJUST: '分數調整',
}

const sortedItems = computed(() => {
  let arr = items.value
  if (categoryFilter.value) {
    arr = arr.filter((i) => i.category === categoryFilter.value)
  }
  return [...arr].sort((a, b) => {
    const ac = a.category ?? '', bc = b.category ?? ''
    if (ac !== bc) return ac.localeCompare(bc)
    const ad = a.display_order ?? 0, bd = b.display_order ?? 0
    if (ad !== bd) return ad - bd
    return a.id - b.id
  })
})

const fetchItems = async () => {
  loading.value = true
  try {
    const res = await (listAppraisalPenaltyCatalog as (p: Record<string, unknown>) => Promise<{ data: unknown }>)({
      active_only: !showInactive.value,
    })
    items.value = ((res.data || []) as PenaltyItem[])
  } catch (error) {
    ElMessage.error(apiError(error, '載入扣分目錄失敗'))
  } finally {
    loading.value = false
  }
}

const openEdit = (row: PenaltyItem) => {
  editTarget.value = row
  form.default_score_delta = Number(row.default_score_delta)
  form.severity_max = row.severity_max ?? 1
  form.display_order = row.display_order ?? 0
  form.is_active = row.is_active ?? true
  dialogVisible.value = true
}

const submitForm = async () => {
  submitting.value = true
  try {
    const res = await (patchAppraisalPenaltyCatalog as (id: number, p: Record<string, unknown>) => Promise<{ data: unknown }>)(editTarget.value!.id, {
      default_score_delta: form.default_score_delta,
      severity_max: form.severity_max,
      display_order: form.display_order,
      is_active: form.is_active,
    })
    const updated = res.data as PenaltyItem
    const idx = items.value.findIndex((i) => i.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    ElMessage.success('已更新')
    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(apiError(error, '更新失敗'))
  } finally {
    submitting.value = false
  }
}

// is_active inline switch（只送 is_active 一個欄位）
const toggleActive = async (row: PenaltyItem, val: boolean) => {
  try {
    const res = await (patchAppraisalPenaltyCatalog as (id: number, p: Record<string, unknown>) => Promise<{ data: unknown }>)(row.id, { is_active: val })
    const idx = items.value.findIndex((i) => i.id === row.id)
    if (idx >= 0) items.value[idx] = res.data as PenaltyItem
    ElMessage.success(val ? '已啟用' : '已停用')
  } catch (error) {
    // 失敗時恢復原值
    row.is_active = !val
    ElMessage.error(apiError(error, '切換失敗'))
  }
}

onMounted(fetchItems)
</script>

<template>
  <div class="penalty-catalog-panel">
    <div class="panel-head">
      <div>
        <p class="hint">
          扣分項目為 seed 資料，僅可調整分數預設值、嚴重度上限、顯示順序與啟用狀態；新增項目請走 migration。
        </p>
      </div>
      <div class="actions">
        <el-select
          v-model="categoryFilter"
          placeholder="篩選分類"
          style="width: 140px"
        >
          <el-option
            v-for="opt in categoryOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
        <el-checkbox v-model="showInactive" @change="fetchItems">
          含已停用
        </el-checkbox>
        <el-button :icon="Refresh" @click="fetchItems" :loading="loading">
          重新整理
        </el-button>
      </div>
    </div>

    <el-table
      :data="sortedItems"
      v-loading="loading"
      empty-text="無項目"
      stripe
    >
      <el-table-column label="代碼" prop="code" width="100" />
      <el-table-column label="分類" min-width="100">
        <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
      </el-table-column>
      <el-table-column label="子分類" prop="subcategory" min-width="120" />
      <el-table-column label="說明" prop="description" min-width="240" />
      <el-table-column label="預設類別" width="110">
        <template #default="{ row }">
          {{ eventTypeLabel[row.default_event_type] || row.default_event_type }}
        </template>
      </el-table-column>
      <el-table-column label="預設分數" prop="default_score_delta" width="100" align="right">
        <template #default="{ row }">
          <span :class="Number(row.default_score_delta) >= 0 ? 'score-pos' : 'score-neg'">
            {{ Number(row.default_score_delta) > 0 ? '+' : '' }}{{ row.default_score_delta }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="嚴重度" prop="severity_max" width="80" align="center" />
      <el-table-column label="順序" prop="display_order" width="80" align="center" />
      <el-table-column label="啟用" width="80" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.is_active"
            @change="(val) => toggleActive(row, val as boolean)"
          />
        </template>
      </el-table-column>
      <el-table-column label="動作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="openEdit(row)">
            編輯
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      title="編輯扣分項"
      width="480px"
      :close-on-click-modal="false"
    >
      <p v-if="editTarget" class="edit-target">
        {{ editTarget.code }} ・{{ editTarget.description }}
      </p>
      <el-form label-width="100px" @submit.prevent="submitForm">
        <el-form-item label="預設分數">
          <el-input-number
            v-model="form.default_score_delta"
            :min="-20"
            :max="20"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="嚴重度上限">
          <el-input-number
            v-model="form.severity_max"
            :min="1"
            :max="5"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="顯示順序">
          <el-input-number
            v-model="form.display_order"
            :min="0"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="啟用">
          <el-switch v-model="form.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          儲存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.penalty-catalog-panel {
  padding: var(--space-2) 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  gap: var(--space-3);
  flex-wrap: wrap;
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
  align-items: center;
  flex-shrink: 0;
}

.score-pos {
  color: var(--color-success);
  font-weight: 600;
}

.score-neg {
  color: var(--color-danger);
  font-weight: 600;
}

.edit-target {
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  background: var(--neutral-50);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}
</style>
