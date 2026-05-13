<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="批次產生費用單"
    width="700"
  >
    <el-form :model="form" label-width="100">
      <el-form-item label="學年">
        <el-input-number v-model="form.school_year" :min="100" :max="200" />
      </el-form-item>
      <el-form-item label="學期">
        <el-radio-group v-model="form.semester">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="費用類型">
        <el-checkbox-group v-model="form.fee_types">
          <el-checkbox value="registration">註冊費</el-checkbox>
          <el-checkbox value="miscellaneous">雜費</el-checkbox>
          <el-checkbox value="monthly">月費(展開為 6 張)</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>

    <el-button type="primary" plain :loading="loading" @click="onPreview">
      預覽
    </el-button>

    <div v-if="preview" class="preview-block">
      <el-alert type="info" :closable="false">
        將新建 <b>{{ preview.created }}</b> 筆 ·
        已存在跳過 <b>{{ preview.skipped }}</b> 筆
      </el-alert>
      <el-table :data="preview.preview || []" max-height="300" class="mt-12">
        <el-table-column prop="student_name" label="學生" />
        <el-table-column prop="classroom_name" label="班級" />
        <el-table-column prop="fee_item_name" label="費用" />
        <el-table-column prop="amount_due" label="金額" align="right">
          <template #default="{ row }">NT$ {{ row.amount_due.toLocaleString() }}</template>
        </el-table-column>
      </el-table>
      <p v-if="preview.created > (preview.preview?.length || 0)" class="muted">
        ...等 {{ preview.created }} 筆(顯示前 {{ preview.preview?.length || 0 }} 筆)
      </p>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="confirming"
        :disabled="!preview || preview.created === 0"
        @click="onConfirm"
      >
        確認產生 ({{ preview?.created || 0 }} 筆)
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { generateFeesFromTemplates } from '@/api/fees'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'generated'])

const form = reactive({
  school_year: new Date().getFullYear() - 1911,
  semester: 1,
  fee_types: ['registration', 'miscellaneous'],
})

const loading = ref(false)
const confirming = ref(false)
const preview = ref(null)

async function onPreview() {
  if (!form.fee_types.length) {
    ElMessage.warning('請至少選一項費用類型')
    return
  }
  loading.value = true
  try {
    preview.value = await generateFeesFromTemplates({ ...form, dry_run: true })
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '預覽失敗')
  } finally {
    loading.value = false
  }
}

async function onConfirm() {
  confirming.value = true
  try {
    const result = await generateFeesFromTemplates({ ...form, dry_run: false })
    ElMessage.success(`已產生 ${result.created} 筆,跳過 ${result.skipped} 筆`)
    emit('generated', result)
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '產生失敗')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.preview-block { margin-top: 16px; }
.mt-12 { margin-top: 12px; }
.muted { color: #888; font-size: 12px; margin-top: 8px; }
</style>
