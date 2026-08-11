<template>
  <div class="template-panel">
    <div class="template-panel__toolbar">
      <el-checkbox v-model="includeInactive" @change="load">顯示已停用範本</el-checkbox>
      <el-button v-if="canWrite" type="primary" @click="openCreateDialog">新增範本</el-button>
    </div>

    <el-table v-loading="loading" :data="templates" style="width: 100%" table-layout="auto">
      <el-table-column prop="title" label="標題" min-width="180" />
      <el-table-column label="類型" width="120">
        <template #default="{ row }">{{ docTypeLabel(row.doc_type) }}</template>
      </el-table-column>
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column label="待簽" width="80">
        <template #default="{ row }">{{ row.pending_count }}</template>
      </el-table-column>
      <el-table-column label="已簽" width="80">
        <template #default="{ row }">{{ row.signed_count }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '啟用中' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditDialog(row)">編輯</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && templates.length === 0" description="尚無範本" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '編輯範本' : '新增範本'"
      width="900px"
      @closed="resetForm"
    >
      <div class="template-editor">
        <el-form :model="form" label-position="top" class="template-editor__form">
          <el-form-item label="標題" required>
            <el-input v-model="form.title" maxlength="100" show-word-limit />
          </el-form-item>
          <el-form-item label="文件類型" required>
            <el-select v-model="form.doc_type" style="width: 100%">
              <el-option
                v-for="opt in DOC_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="內容（Markdown，支援 ### 標題 / - 項目 / **粗體**）" required>
            <div class="template-editor__var-buttons">
              <el-button size="small" @click="insertVariable('{{student_name}}')">
                插入「學生姓名」
              </el-button>
              <el-button size="small" @click="insertVariable('{{academic_year}}')">
                插入「學年度」
              </el-button>
            </div>
            <el-input
              ref="bodyInputRef"
              v-model="form.body_md"
              type="textarea"
              :rows="14"
              placeholder="### 入學契約&#10;{{student_name}} 於 {{academic_year}} 學年度入學。"
            />
          </el-form-item>
          <el-form-item v-if="editingId" label="狀態">
            <el-switch v-model="form.is_active" active-text="啟用" inactive-text="停用" />
          </el-form-item>
        </el-form>
        <div class="template-editor__preview">
          <div class="template-editor__preview-label">即時預覽</div>
          <div class="template-editor__preview-body" v-html="previewHtml" />
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { listSignTemplates, createSignTemplate, updateSignTemplate } from '@/api/signDocuments'

defineProps<{ canWrite: boolean }>()

interface TemplateRow {
  id: number
  title: string
  doc_type: string
  body_md: string
  is_active: boolean
  version: number
  pending_count: number
  signed_count: number
}

const DOC_TYPE_OPTIONS = [
  { value: 'contract', label: '入學契約' },
  { value: 'consent_form', label: '同意書' },
  { value: 'photo_release', label: '照片授權書' },
  { value: 'other', label: '其他' },
] as const

function docTypeLabel(value: string): string {
  return DOC_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

const templates = ref<TemplateRow[]>([])
const loading = ref(false)
const includeInactive = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await listSignTemplates({ include_inactive: includeInactive.value })
    templates.value = data as TemplateRow[]
  } catch {
    ElMessage.error('範本列表載入失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)

marked.setOptions({ breaks: true, gfm: true })

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const bodyInputRef = ref<{ textarea?: HTMLTextAreaElement } | null>(null)

const form = reactive({
  title: '',
  doc_type: 'contract' as string,
  body_md: '',
  is_active: true,
})

const previewHtml = computed(() => {
  const raw = marked.parse(form.body_md || '') as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
})

function resetForm() {
  editingId.value = null
  form.title = ''
  form.doc_type = 'contract'
  form.body_md = ''
  form.is_active = true
}

function openCreateDialog() {
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(row: TemplateRow) {
  editingId.value = row.id
  form.title = row.title
  form.doc_type = row.doc_type
  form.body_md = row.body_md
  form.is_active = row.is_active
  dialogVisible.value = true
}

function insertVariable(token: string) {
  const el = bodyInputRef.value?.textarea
  if (!el) {
    form.body_md += token
    return
  }
  const start = el.selectionStart ?? form.body_md.length
  const end = el.selectionEnd ?? form.body_md.length
  form.body_md = form.body_md.slice(0, start) + token + form.body_md.slice(end)
}

async function save() {
  if (!form.title.trim() || !form.body_md.trim()) {
    ElMessage.warning('標題與內容為必填')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateSignTemplate(editingId.value, {
        title: form.title,
        doc_type: form.doc_type,
        body_md: form.body_md,
        is_active: form.is_active,
      })
    } else {
      await createSignTemplate({
        title: form.title,
        doc_type: form.doc_type,
        body_md: form.body_md,
        is_active: true,
      })
    }
    ElMessage.success('已儲存')
    dialogVisible.value = false
    await load()
  } catch {
    ElMessage.error('儲存失敗')
  } finally {
    saving.value = false
  }
}

defineExpose({ load })
</script>

<style scoped>
.template-panel__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3, 12px);
}

.template-editor {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4, 16px);
}

@media (max-width: 900px) {
  .template-editor {
    grid-template-columns: 1fr;
  }
}

.template-editor__var-buttons {
  margin-bottom: var(--space-2, 8px);
  display: flex;
  gap: var(--space-2, 8px);
}

.template-editor__preview {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-3, 12px);
  overflow-y: auto;
  max-height: 420px;
}

.template-editor__preview-label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: var(--space-2, 8px);
}

.template-editor__preview-body :deep(h3) {
  font-size: 15px;
  margin: 0.5em 0;
}
</style>
