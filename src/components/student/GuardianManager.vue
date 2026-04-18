<template>
  <div class="guardian-manager">
    <div class="toolbar">
      <div class="toolbar-info">
        <el-tag v-if="primaryGuardian" type="success" size="small">
          主要聯絡人：{{ primaryGuardian.name }}
        </el-tag>
        <el-tag v-else type="warning" size="small">尚未設定主要聯絡人</el-tag>
      </div>
      <el-button
        v-if="canWrite"
        type="primary"
        size="small"
        @click="openCreateDialog"
      >
        ＋ 新增監護人
      </el-button>
    </div>

    <el-table
      :data="guardians"
      v-loading="loading"
      border
      stripe
      style="width: 100%; margin-top: 12px"
      empty-text="尚無監護人資料"
    >
      <el-table-column label="姓名" prop="name" width="110" />
      <el-table-column label="關係" prop="relation" width="90" align="center" />
      <el-table-column label="電話" prop="phone" width="140" />
      <el-table-column label="Email" prop="email" min-width="160" show-overflow-tooltip />
      <el-table-column label="旗標" width="210" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_primary" type="success" size="small" style="margin-right: 4px">主要</el-tag>
          <el-tag v-if="row.is_emergency" type="danger" size="small" style="margin-right: 4px">緊急</el-tag>
          <el-tag v-if="row.can_pickup" type="warning" size="small">可接送</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="custody_note" min-width="140" show-overflow-tooltip />
      <el-table-column v-if="canWrite" label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增 / 編輯 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增監護人' : '編輯監護人'"
      width="520px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="關係" prop="relation">
          <el-select v-model="form.relation" placeholder="請選擇" clearable style="width: 100%">
            <el-option v-for="r in relationOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="電話" prop="phone">
          <el-input v-model="form.phone" placeholder="0912-345-678" />
        </el-form-item>
        <el-form-item label="Email" prop="email">
          <el-input v-model="form.email" placeholder="選填" />
        </el-form-item>
        <el-form-item label="角色旗標">
          <div class="flags">
            <el-checkbox v-model="form.is_primary">主要聯絡人</el-checkbox>
            <el-checkbox v-model="form.is_emergency">緊急聯絡人</el-checkbox>
            <el-checkbox v-model="form.can_pickup">授權接送</el-checkbox>
          </div>
          <div class="flag-hint">主要聯絡人每位學生至多一位，設定時會自動取代舊的主要聯絡人。</div>
        </el-form-item>
        <el-form-item label="備註" prop="custody_note">
          <el-input
            v-model="form.custody_note"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="如：離婚探視、單方監護等"
          />
        </el-form-item>
        <el-form-item label="排序" prop="sort_order">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createGuardian,
  deleteGuardian,
  listGuardians,
  updateGuardian,
} from '@/api/students'
import { hasPermission } from '@/utils/auth'

const props = defineProps({
  studentId: { type: Number, required: true },
})
const emit = defineEmits(['change'])

const relationOptions = ['父親', '母親', '祖父', '祖母', '外公', '外婆', '監護人', '其他']
const canWrite = computed(() => hasPermission('GUARDIANS_WRITE'))

const guardians = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref('create')
const saving = ref(false)
const formRef = ref(null)

const emptyForm = () => ({
  id: null,
  name: '',
  phone: '',
  email: '',
  relation: null,
  is_primary: false,
  is_emergency: false,
  can_pickup: false,
  custody_note: '',
  sort_order: 0,
})
const form = reactive(emptyForm())

const formRules = {
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  phone: [
    {
      pattern: /^[\d\-+() ]{7,20}$/,
      message: '電話格式不正確',
      trigger: 'blur',
    },
  ],
  email: [{ type: 'email', message: 'Email 格式不正確', trigger: 'blur' }],
}

const primaryGuardian = computed(() => guardians.value.find((g) => g.is_primary) || null)

async function fetchGuardians() {
  if (!props.studentId) return
  loading.value = true
  try {
    const { data } = await listGuardians(props.studentId)
    guardians.value = data.items || []
  } catch (err) {
    ElMessage.error(err.displayMessage || '讀取監護人失敗')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
}

function openCreateDialog() {
  dialogMode.value = 'create'
  resetForm()
  // 若尚無主要聯絡人，預設勾選
  form.is_primary = !primaryGuardian.value
  dialogVisible.value = true
}

function openEditDialog(row) {
  dialogMode.value = 'edit'
  Object.assign(form, { ...emptyForm(), ...row })
  dialogVisible.value = true
}

async function handleSave() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload = { ...form }
    // 後端 PATCH 不接受 null phone 以外的空值，去除 null
    if (payload.phone === '') payload.phone = null
    if (payload.email === '') payload.email = null
    if (payload.custody_note === '') payload.custody_note = null

    if (dialogMode.value === 'create') {
      delete payload.id
      await createGuardian(props.studentId, payload)
      ElMessage.success('新增成功')
    } else {
      const id = payload.id
      delete payload.id
      await updateGuardian(id, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    await fetchGuardians()
    emit('change')
  } catch (err) {
    ElMessage.error(err.displayMessage || '儲存失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除監護人「${row.name}」嗎？`,
      '確認刪除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteGuardian(row.id)
    ElMessage.success('已刪除')
    await fetchGuardians()
    emit('change')
  } catch (err) {
    ElMessage.error(err.displayMessage || '刪除失敗')
  }
}

defineExpose({ refresh: fetchGuardians })

onMounted(fetchGuardians)
watch(() => props.studentId, fetchGuardians)
</script>

<style scoped>
.guardian-manager {
  width: 100%;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.toolbar-info {
  display: flex;
  gap: 8px;
}
.flags {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.flag-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
