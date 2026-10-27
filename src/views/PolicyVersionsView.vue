<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
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
const formDirty = () =>
  Boolean(formVersion.value || formEffectiveAt.value || formDocumentPath.value || formSummary.value)

/**
 * 建立前確認文案。後端沒有刪除／修改端點，且生效時間已到的版本會讓本園所所有家長
 * 下次開啟家長端時被要求重新簽署（api/policies_admin.py），所以送出前講清楚影響。
 */
function buildCreateConfirm(version: string, effectiveAt: string, now = new Date()): string {
  const immediate = new Date(effectiveAt) <= now
  const when = immediate
    ? '這個版本立即生效：本園所所有家長下次開啟家長端時，都必須重新閱讀並簽署才能繼續使用。'
    : `這個版本將於 ${effectiveAt.replace('T', ' ')} 生效；屆時本園所所有家長下次開啟家長端時，都必須重新簽署。`
  return `${when}建立後無法刪除或修改，確定要建立 ${version}？`
}

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
  const version = formVersion.value.trim()
  const confirmed = await ElMessageBox.confirm(
    buildCreateConfirm(version, formEffectiveAt.value),
    '確認建立政策版本',
    { type: 'warning', confirmButtonText: '確認建立', cancelButtonText: '再檢查一下' },
  ).catch(() => false)
  if (!confirmed) return
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
    <!-- 本 view 僅內嵌於 SettingsView tab（未獨立路由），用 tab 層級 section 標題，
         不用 PageHeader 以免與外層「系統設定」頁首形成雙頁標題 -->
    <div class="tab-section-header">
      <h3 class="tab-section-title">隱私政策版本管理</h3>
      <el-button type="primary" @click="openCreateDialog">新增版本</el-button>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
      description="新版本一旦生效，本園所所有家長下次開啟家長端時都要重新簽署；版本建立後無法刪除或修改。"
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
    <FormDialog
      v-model="createDialogVisible"
      title="新增隱私政策版本"
      :dirty="formDirty"
      :loading="createLoading"
      submit-text="建立版本"
      @submit="submitCreate"
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
    </FormDialog>
  </div>
</template>

<style scoped>
.policy-versions-view {
  padding: 24px;
}

.tab-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.tab-section-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}
</style>
