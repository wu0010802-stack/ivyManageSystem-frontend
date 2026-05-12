<template>
  <span>
    <el-button v-if="canIssue" type="primary" plain size="small"
               @click="open = true">開立在學證明</el-button>
    <el-dialog v-model="open" title="開立在學證明書" width="420px">
      <el-form :model="form" label-width="80px" @submit.prevent="submit">
        <el-form-item label="開立日期" required>
          <el-date-picker v-model="form.issue_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="申請用途" required>
          <el-input v-model="form.purpose" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="份數">
          <el-input-number v-model="form.copies" :min="1" :max="20" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submit">產生 PDF</el-button>
      </template>
    </el-dialog>
  </span>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { generateCertificate } from '@/api/govMoe'
import { hasPermission } from '@/utils/auth'

const props = defineProps({ studentId: { type: Number, required: true } })

const canIssue = computed(() => hasPermission('GOV_REPORTS_EXPORT'))

const open = ref(false)
const loading = ref(false)
const form = ref({
  issue_date: new Date().toISOString().slice(0, 10),
  purpose: '',
  copies: 1,
})

async function submit() {
  if (!form.value.purpose) {
    ElMessage.warning('請填寫申請用途')
    return
  }
  loading.value = true
  try {
    const { data } = await generateCertificate(props.studentId, form.value)
    const blob = new Blob(
      [Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))],
      { type: 'application/pdf' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${data.serial}.pdf`; a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已開立 ${data.serial}`)
    open.value = false
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '開立失敗')
  } finally {
    loading.value = false
  }
}
</script>
