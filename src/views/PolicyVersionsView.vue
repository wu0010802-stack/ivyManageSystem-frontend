<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listPolicies, createPolicy } from '@/api/policy'
import { apiError } from '@/utils/error'
import type { Schema } from '@/api/_generated/typed'

type PolicyRecord = Schema<'PolicyVersionAdminOut'>

// --- 狀態 ---
const records = ref<PolicyRecord[]>([])
const loading = ref(false)

// 新增版本 dialog
const createDialogVisible = ref(false)
const createLoading = ref(false)
const formVersion = ref('')
const formEffectiveAt = ref('')
const formDocumentPath = ref('')
const formSummary = ref('')

// --- 載入 ---
const fetchList = async () => {
  loading.value = true
  try {
    const res = await listPolicies()
    records.value = res.data
  } catch (err) {
    ElMessage.error(apiError(err, '載入政策版本失敗'))
  } finally {
    loading.value = false
  }
}

// --- 開啟新增 dialog ---
const openCreateDialog = () => {
  formVersion.value = ''
  formEffectiveAt.value = ''
  formDocumentPath.value = ''
  formSummary.value = ''
  createDialogVisible.value = true
}

// --- 提交新增 ---
const submitCreate = async () => {
  if (!formVersion.value.trim()) {
    ElMessage.warning('請填寫版本號')
    return
  }
  if (!formEffectiveAt.value) {
    ElMessage.warning('請選擇生效時間')
    return
  }
  if (!formDocumentPath.value.trim()) {
    ElMessage.warning('請填寫文件路徑')
    return
  }
  createLoading.value = true
  try {
    await createPolicy({
      version: formVersion.value.trim(),
      effective_at: formEffectiveAt.value,
      document_path: formDocumentPath.value.trim(),
      summary: formSummary.value.trim() || null,
    })
    ElMessage.success('已建立新政策版本')
    createDialogVisible.value = false
    await fetchList()
  } catch (err) {
    ElMessage.error(apiError(err, '建立失敗'))
  } finally {
    createLoading.value = false
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="policy-versions-view">
    <div class="page-header">
      <h2 class="page-title">隱私政策版本管理</h2>
      <el-button type="primary" @click="openCreateDialog">新增版本</el-button>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
      description="建立 effective_at ≤ 現在的新版本將觸發既有家長下次登入重新簽署"
    />

    <el-table :data="records" v-loading="loading" style="width: 100%">
      <el-table-column prop="version" label="版本號" width="140" />
      <el-table-column prop="effective_at" label="生效時間" width="200" />
      <el-table-column prop="summary" label="摘要" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.summary ?? '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="document_path" label="文件路徑" show-overflow-tooltip />
      <el-table-column prop="created_at" label="建立時間" width="200" />
    </el-table>

    <!-- 新增版本 Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增隱私政策版本"
      width="520px"
    >
      <el-form label-width="100px">
        <el-form-item label="版本號" required>
          <el-input
            v-model="formVersion"
            placeholder="例：v1.2.0"
          />
        </el-form-item>
        <el-form-item label="生效時間" required>
          <el-date-picker
            v-model="formEffectiveAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="選擇生效時間"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="文件路徑" required>
          <el-input
            v-model="formDocumentPath"
            placeholder="例：policies/privacy/v1.2.0.pdf"
          />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input
            v-model="formSummary"
            type="textarea"
            :rows="3"
            placeholder="（選填）本版本主要變更說明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">確認建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.policy-versions-view {
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
