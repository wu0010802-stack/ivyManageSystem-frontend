<script setup>
import { ref } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'

const attachDialogVisible = ref(false)
const attachItems = ref([])
const attachLoading = ref(false)

const viewAttachments = async (row) => {
  attachItems.value = []
  attachDialogVisible.value = true
  attachLoading.value = true
  try {
    attachItems.value = await Promise.all(
      row.attachment_paths.map(filename =>
        api.get(`/leaves/${row.id}/attachments/${filename}`, { responseType: 'blob' })
          .then(res => ({
            name: filename,
            url: URL.createObjectURL(res.data),
            isImage: /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(filename),
          }))
      )
    )
  } catch {
    ElMessage.error('載入附件失敗')
  } finally {
    attachLoading.value = false
  }
}

const closeAttachDialog = () => {
  attachItems.value.forEach(a => URL.revokeObjectURL(a.url))
  attachItems.value = []
  attachDialogVisible.value = false
}

defineExpose({ open: viewAttachments })
</script>

<template>
  <el-dialog
    v-model="attachDialogVisible"
    title="假單附件"
    width="660px"
    :before-close="closeAttachDialog"
  >
    <div v-if="attachLoading" style="text-align:center;padding:32px;color:var(--text-secondary)">
      <el-icon class="is-loading"><Loading /></el-icon> 載入中…
    </div>
    <div v-else-if="!attachItems.length" style="text-align:center;padding:32px;color:var(--text-secondary)">
      無附件
    </div>
    <div v-else class="attach-grid">
      <div v-for="(item, i) in attachItems" :key="i" class="attach-item">
        <el-image
          v-if="item.isImage"
          :src="item.url"
          :preview-src-list="attachItems.filter(a => a.isImage).map(a => a.url)"
          :initial-index="attachItems.filter(a => a.isImage).findIndex(a => a.url === item.url)"
          fit="cover"
          class="attach-thumb"
        />
        <a v-else :href="item.url" :download="item.name" class="attach-file">
          <el-icon :size="32"><Document /></el-icon>
          <span class="attach-filename">{{ item.name }}</span>
          <span style="font-size:12px;color:var(--color-primary)">點擊下載</span>
        </a>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.attach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
}

.attach-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.attach-thumb {
  width: 100%;
  height: 150px;
  display: block;
}

.attach-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--space-5);
  text-decoration: none;
  color: var(--text-primary);
  height: 150px;
  transition: background-color 0.2s;
}

.attach-file:hover {
  background-color: var(--bg-color-soft);
}

.attach-filename {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  word-break: break-all;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
