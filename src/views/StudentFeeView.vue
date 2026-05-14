<template>
  <div class="student-fee-view">
    <div class="page-header">
      <h2>學費管理</h2>
    </div>

    <el-tabs v-model="activeTab" type="card">
      <!-- ================================================================
           Tab 1：費用項目設定
      ================================================================ -->
      <el-tab-pane label="費用項目設定" name="items">
        <div class="toolbar">
          <div class="filters">
            <el-select
              v-model="itemFilter.period"
              placeholder="學期篩選"
              clearable
              style="width: 180px"
              @change="fetchItems"
            >
              <el-option
                v-for="period in periodOptions"
                :key="period"
                :label="period"
                :value="period"
              />
            </el-select>
            <el-select v-model="itemFilter.is_active" placeholder="狀態" clearable style="width: 110px" @change="fetchItems">
              <el-option label="啟用中" :value="true" />
              <el-option label="已停用" :value="false" />
            </el-select>
            <el-button @click="resetItemFilters">清除篩選</el-button>
          </div>
          <div class="action-buttons">
            <el-button type="primary" @click="generateModalVisible = true">
              依範本批次產生
            </el-button>
            <el-button type="primary" @click="openCreateItem">
              <el-icon><Plus /></el-icon> 新增項目
            </el-button>
          </div>
        </div>

        <el-table :data="feeItems" v-loading="itemsLoading" border>
          <el-table-column label="名稱" prop="name" min-width="120" />
          <el-table-column label="金額（元）" prop="amount" width="110" align="right">
            <template #default="{ row }">{{ row.amount.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="適用班級" min-width="100">
            <template #default="{ row }">{{ row.classroom_name || '全校' }}</template>
          </el-table-column>
          <el-table-column label="學期" prop="period" width="90" />
          <el-table-column label="狀態" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? '啟用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditItem(row)">編輯</el-button>
              <el-button size="small" type="success" @click="openGenerate(row)">批次產生記錄</el-button>
              <el-button size="small" type="danger" @click="handleDeleteItem(row)" :loading="deleteItemLoading">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ================================================================
           Tab 2：繳費記錄
      ================================================================ -->
      <el-tab-pane label="繳費記錄" name="records">
        <FeeRecordsTab
          ref="feeRecordsTabRef"
          :period-options="periodOptions"
          :classrooms="classrooms"
        />
      </el-tab-pane>

      <!-- ================================================================
           Tab 3：費用範本
      ================================================================ -->
      <el-tab-pane label="費用範本" name="templates">
        <FeeTemplateTab />
      </el-tab-pane>
    </el-tabs>

    <!-- ================================================================
         Dialog：新增/編輯費用項目
    ================================================================ -->
    <el-dialog
      v-model="itemDialogVisible"
      :title="editingItem ? '編輯費用項目' : '新增費用項目'"
      width="480px"
      destroy-on-close
    >
      <el-form :model="itemForm" :rules="itemRules" ref="itemFormRef" label-width="90px">
        <el-form-item label="費用名稱" prop="name">
          <el-input v-model="itemForm.name" placeholder="如：學費、雜費、材料費" />
        </el-form-item>
        <el-form-item label="金額（元）" prop="amount">
          <el-input-number v-model="itemForm.amount" :min="0" :max="999999" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="適用班級" prop="classroom_id">
          <el-select v-model="itemForm.classroom_id" placeholder="全校（不選=全校）" clearable style="width: 100%">
            <el-option
              v-for="cls in classrooms"
              :key="cls.id"
              :label="cls.name"
              :value="cls.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="學期" prop="period">
          <el-input v-model="itemForm.period" placeholder="如：2025-1" />
        </el-form-item>
        <el-form-item label="狀態" prop="is_active">
          <el-switch v-model="itemForm.is_active" active-text="啟用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitItem">確定</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Dialog：批次產生記錄
    ================================================================ -->
    <el-dialog v-model="generateDialogVisible" title="批次產生費用記錄" width="400px" destroy-on-close>
      <div v-if="generatingItem">
        <p>費用項目：<strong>{{ generatingItem.name }}</strong>（{{ generatingItem.period }}）</p>
        <p>金額：<strong>{{ generatingItem.amount.toLocaleString() }} 元</strong></p>
        <el-form label-width="90px">
          <el-form-item label="指定班級">
            <el-select v-model="generateClassroomId" placeholder="全校（不選=全部適用學生）" clearable style="width: 100%">
              <el-option
                v-for="cls in classrooms"
                :key="cls.id"
                :label="cls.name"
                :value="cls.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <p class="hint">已存在記錄的學生將自動跳過，不會重複建立。</p>
      </div>
      <template #footer>
        <el-button @click="generateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitGenerate">產生記錄</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Modal：依範本批次產生（Phase 2）
    ================================================================ -->
    <FeeGenerateModal
      v-model="generateModalVisible"
      @generated="handleRecordsRefresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getFeeItems, getFeePeriods, createFeeItem, updateFeeItem, deleteFeeItem,
  generateFeeRecords,
} from '@/api/fees'
import { useClassroomStore } from '@/stores/classroom'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

// ─── 依範本批次產生 modal ────────────────────────────────────────────────────
const generateModalVisible = ref(false)

// ─── Tab 狀態 ────────────────────────────────────────────────────────────────
const activeTab = ref('items')
const periodOptions = ref([])

// ─── 子元件 ref（records tab） ──────────────────────────────────────────────
const feeRecordsTabRef = ref(null)

function handleRecordsRefresh() {
  feeRecordsTabRef.value?.fetchRecords()
}

// ─── 費用項目 ─────────────────────────────────────────────────────────────────
const feeItems = ref([])
const itemsLoading = ref(false)
const itemFilter = ref({ period: '', is_active: null })

async function fetchItems() {
  itemsLoading.value = true
  try {
    const params = {}
    if (itemFilter.value.period) params.period = itemFilter.value.period
    if (itemFilter.value.is_active !== null && itemFilter.value.is_active !== undefined) {
      params.is_active = itemFilter.value.is_active
    }
    feeItems.value = await getFeeItems(params)
  } catch {
    ElMessage.error('載入費用項目失敗')
  } finally {
    itemsLoading.value = false
  }
}

async function fetchFeePeriods() {
  try {
    periodOptions.value = await getFeePeriods()
  } catch {
    ElMessage.error('載入學期列表失敗')
  }
}

function resetItemFilters() {
  itemFilter.value = { period: '', is_active: null }
  fetchItems()
}

// ─── 班級列表（供下拉選單） ───────────────────────────────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

// ─── 新增/編輯費用項目 ────────────────────────────────────────────────────────
const itemDialogVisible = ref(false)
const editingItem = ref(null)
const saving = ref(false)
const deleteItemLoading = ref(false)
const itemFormRef = ref(null)
const itemForm = ref({
  name: '',
  amount: 0,
  classroom_id: null,
  period: '',
  is_active: true,
})
const itemRules = {
  name: [{ required: true, message: '請輸入費用名稱', trigger: 'blur' }],
  amount: [{ required: true, message: '請輸入金額', trigger: 'blur' }],
  period: [{ required: true, message: '請輸入學期（如 2025-1）', trigger: 'blur' }],
}

function openCreateItem() {
  editingItem.value = null
  itemForm.value = { name: '', amount: 0, classroom_id: null, period: '', is_active: true }
  itemDialogVisible.value = true
}

function openEditItem(row) {
  editingItem.value = row
  itemForm.value = {
    name: row.name,
    amount: row.amount,
    classroom_id: row.classroom_id || null,
    period: row.period,
    is_active: row.is_active,
  }
  itemDialogVisible.value = true
}

async function submitItem() {
  const valid = await itemFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editingItem.value) {
      await updateFeeItem(editingItem.value.id, itemForm.value)
      ElMessage.success('費用項目已更新')
    } else {
      await createFeeItem(itemForm.value)
      ElMessage.success('費用項目已新增')
    }
    itemDialogVisible.value = false
    await Promise.all([
      fetchItems(),
      fetchFeePeriods(),
      feeRecordsTabRef.value?.refreshFeeItems?.(),
    ])
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDeleteItem(row) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.name}」費用項目嗎？若有關聯記錄將無法刪除。`,
      '刪除確認',
      { type: 'warning' },
    )
  } catch {
    return
  }
  deleteItemLoading.value = true
  try {
    await deleteFeeItem(row.id)
    ElMessage.success('已刪除')
    await Promise.all([
      fetchItems(),
      fetchFeePeriods(),
      feeRecordsTabRef.value?.refreshFeeItems?.(),
    ])
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  } finally {
    deleteItemLoading.value = false
  }
}

// ─── 批次產生記錄 ─────────────────────────────────────────────────────────────
const generateDialogVisible = ref(false)
const generatingItem = ref(null)
const generateClassroomId = ref(null)

function openGenerate(row) {
  generatingItem.value = row
  generateClassroomId.value = null
  generateDialogVisible.value = true
}

async function submitGenerate() {
  saving.value = true
  try {
    const result = await generateFeeRecords({
      fee_item_id: generatingItem.value.id,
      classroom_id: generateClassroomId.value || null,
    })
    ElMessage.success(`已產生 ${result.created} 筆記錄，跳過 ${result.skipped} 筆（已存在）`)
    generateDialogVisible.value = false
    if (activeTab.value === 'records') feeRecordsTabRef.value?.fetchRecords()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '產生記錄失敗')
  } finally {
    saving.value = false
  }
}

// ─── 切換 Tab 時自動載入 ──────────────────────────────────────────────────────
watch(activeTab, (val) => {
  if (val === 'records') feeRecordsTabRef.value?.fetchRecords()
})

onMounted(() => {
  fetchItems()
  fetchFeePeriods()
  classroomStore.fetchClassrooms()
})
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}

.page-header {
  margin-bottom: var(--space-4);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-3);
}

.filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.action-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  margin-top: var(--space-2);
}
</style>
