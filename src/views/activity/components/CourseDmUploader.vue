<template>
  <div class="course-dm-uploader">
    <div v-if="dmPages && dmPages.length" class="dm-preview">
      <img :src="dmPages[0]" alt="課程 DM 縮圖" class="dm-thumb" />
      <span class="dm-page-count">共 {{ dmPages.length }} 頁</span>
      <el-button size="small" type="danger" plain :loading="removing" @click="handleRemove">
        移除
      </el-button>
    </div>
    <template v-else>
      <el-upload
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        :auto-upload="true"
        :show-file-list="false"
        :http-request="handleDmUpload"
        :before-upload="beforeDmUpload"
      >
        <el-button type="primary" plain :loading="uploading">上傳課程 DM</el-button>
      </el-upload>
      <div class="dm-hint">支援 PDF（≤10 頁）或圖片，單檔 ≤ 10MB</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadRawFile } from 'element-plus'
import { deleteCourseDm, uploadCourseDm } from '@/api/activity'

const props = defineProps<{ courseId: number; dmUrl?: string | null; dmPages?: string[] | null }>()
const emit = defineEmits<{ (e: 'updated', payload: { dm_url: string | null; dm_pages: string[] | null }): void }>()
const uploading = ref(false)
const removing = ref(false)

// 比照 ActivitySettingsView.vue 海報上傳段落：apiErrorMessage 該檔亦為本地函式（未從
// 共用模組匯入），此處維持同一寫法而非另立 utils，避免單一用途的共用模組。
function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (
    error as { response?: { data?: { detail?: unknown } } }
  )?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          const msg = (item as { msg?: unknown }).msg
          return typeof msg === 'string' ? msg : ''
        }
        return ''
      })
      .filter(Boolean)
    if (messages.length) return messages.join('；')
  }
  return fallback
}

function beforeDmUpload(file: UploadRawFile) {
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
    ElMessage.error('僅支援 pdf / jpg / jpeg / png / webp')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('檔案不能超過 10MB')
    return false
  }
  return true
}

async function handleDmUpload({ file }: { file: UploadRawFile }) {
  uploading.value = true
  try {
    const res = await uploadCourseDm(props.courseId, file)
    emit('updated', { dm_url: res.data.dm_url, dm_pages: res.data.dm_pages })
    ElMessage.success('課程 DM 已更新')
  } catch (e) {
    ElMessage.error(apiErrorMessage(e, '上傳失敗'))
  } finally {
    uploading.value = false
  }
}

async function handleRemove() {
  // 比照本檔 ActivityCourseView.vue::handleDelete 的取消處理慣例：confirm 被拒
  // （使用者按取消）時吞掉 rejection 直接 return，不當錯誤處理。
  try {
    await ElMessageBox.confirm(
      '確定移除這份課程 DM？家長端將不再顯示「課程簡介」。',
      '移除 DM',
      { type: 'warning' },
    )
  } catch {
    return
  }
  removing.value = true
  try {
    await deleteCourseDm(props.courseId)
    emit('updated', { dm_url: null, dm_pages: null })
    ElMessage.success('課程 DM 已移除')
  } catch (e) {
    ElMessage.error(apiErrorMessage(e, '移除失敗'))
  } finally {
    removing.value = false
  }
}
</script>

<style scoped>
.dm-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dm-thumb {
  height: 120px;
  width: auto;
  max-width: 160px;
  object-fit: contain;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
.dm-page-count {
  font-size: 13px;
  color: var(--text-secondary, #606266);
}
.dm-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary, #909399);
}
</style>
