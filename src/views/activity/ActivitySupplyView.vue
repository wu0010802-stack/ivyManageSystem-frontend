<template>
  <div class="activity-supplies">
    <div class="toolbar">
      <h2>用品管理</h2>
      <el-button type="primary" @click="openCreate">新增用品</el-button>
    </div>

    <el-table :data="supplies" v-loading="loading" border>
      <el-table-column label="用品名稱" prop="name" min-width="160" />
      <el-table-column label="價格（元）" prop="price" width="110" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center" fixed="right">
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
          <el-input-number v-model="form.price" :min="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSupplies, createSupply, updateSupply, deleteSupply } from '@/api/activity'

const supplies = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)
const form = ref({ name: '', price: 0 })

async function fetchSupplies() {
  loading.value = true
  try {
    const res = await getSupplies()
    supplies.value = res.data.supplies
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { name: '', price: 0 }
  dialogVisible.value = true
}

function openEdit(row) {
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
      await createSupply(form.value)
      ElMessage.success('用品新增成功')
    }
    dialogVisible.value = false
    fetchSupplies()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
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
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '停用失敗')
  }
}

onMounted(fetchSupplies)
</script>

<style scoped>
.activity-supplies { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
</style>
