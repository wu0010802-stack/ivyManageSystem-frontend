<template>
  <div class="activity-supplies">
    <div class="toolbar">
      <h2>用品管理</h2>
      <div class="toolbar__actions">
        <AcademicTermSelector />
        <el-button v-if="canWrite" type="primary" @click="openCreate">新增用品</el-button>
      </div>
    </div>

    <el-table :data="supplies" v-loading="loading" border>
      <el-table-column label="用品名稱" prop="name" min-width="160" />
      <el-table-column label="價格（元）" prop="price" width="110" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯用品' : '新增用品'" width="400px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="用品名稱" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="價格（元）" required>
          <el-input-number v-model="form.price" :min="0" :max="999999" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getSupplies, createSupply, updateSupply, deleteSupply } from '@/api/activity'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'

interface Supply { id: number; name: string; price: number }

const termStore = useAcademicTermStore()

// 對齊 ActivityRegistrationView 慣例：READ-only 使用者隱藏 mutation 入口（後端守衛 ACTIVITY_WRITE）
const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))

const supplies = ref<Supply[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = ref<{ name: string; price: number }>({ name: '', price: 0 })

// F5：切換學期競態守衛。每次載入遞增序號，回應落地前比對序號；快速切學期時較慢的
// 舊請求後回不得覆寫較新請求的結果（否則頁面顯示新學期但資料屬舊學期）。
let fetchSeq = 0
async function fetchSupplies() {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const res = await getSupplies({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    if (seq !== fetchSeq) return // 過期回應：已有更新的載入，丟棄不覆寫
    supplies.value = (res.data as { supplies: Supply[] }).supplies
  } catch (e) {
    if (seq !== fetchSeq) return
    // F4：載入失敗須清空清單，否則切學期失敗時畫面留著上一學期的資料且編輯/停用
    // 按鈕仍可操作（學期選擇器顯示新學期但資料屬舊學期），易誤改到舊學期資料。
    supplies.value = []
    ElMessage.error(friendlyError('載入用品資料失敗', e))
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

watch(() => [termStore.school_year, termStore.semester], () => fetchSupplies())

function openCreate() {
  editingId.value = null
  form.value = { name: '', price: 0 }
  dialogVisible.value = true
}

function openEdit(row: Supply) {
  editingId.value = row.id
  form.value = { name: row.name, price: row.price }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫用品名稱和價格')
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateSupply(editingId.value, form.value)
      ElMessage.success('用品更新成功')
    } else {
      // 帶上 selector 選定學期：否則後端缺省成當前學期，非當前學期新增會「消失」
      // 並污染當前學期資料（與 fetchSupplies 同樣以 termStore 查詢對齊）
      await createSupply({
        ...form.value,
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      ElMessage.success('用品新增成功')
    }
    dialogVisible.value = false
    fetchSupplies()
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Supply) {
  try {
    await ElMessageBox.confirm(`確定要停用用品「${row.name}」嗎？`, '確認停用', {
      type: 'warning',
      confirmButtonText: '確定停用',
      confirmButtonClass: 'el-button--danger',
    })
    await deleteSupply(row.id)
    ElMessage.success('用品已停用')
    fetchSupplies()
  } catch (e) {
    if (e !== 'cancel') {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      ElMessage.error(detail || '停用失敗')
    }
  }
}

onMounted(fetchSupplies)
</script>

<style scoped>
.activity-supplies { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.toolbar__actions { display: flex; gap: 8px; align-items: center; }
</style>
