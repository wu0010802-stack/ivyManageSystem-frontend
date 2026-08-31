<template>
  <div class="portal-album-detail-view">
    <div class="detail-header">
      <el-button link @click="goBack">← 返回相簿列表</el-button>
      <div v-if="album" class="detail-title-row">
        <h2>{{ album.title }}</h2>
        <span class="detail-date">{{ album.event_date }}</span>
        <el-tag v-if="album.status === 'draft'" type="info" size="small">草稿</el-tag>
        <el-tag v-else type="success" size="small">已發布</el-tag>
        <span v-if="album.untagged_count > 0" class="detail-warning">未標記 {{ album.untagged_count }} 張</span>
      </div>
    </div>

    <div class="upload-panel">
      <el-upload
        multiple
        :auto-upload="false"
        :show-file-list="true"
        accept="image/*"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
      >
        <el-button>選擇照片</el-button>
        <template #tip>
          <div class="upload-tip">單檔上限 10MB，可一次選多張</div>
        </template>
      </el-upload>
      <el-button
        type="primary"
        :loading="uploading"
        :disabled="pendingFiles.length === 0"
        @click="submitUpload"
      >
        上傳 {{ pendingFiles.length }} 張
      </el-button>
    </div>

    <div class="action-toolbar">
      <el-button :disabled="selectedIds.size === 0" @click="openTagDialog()">
        標記所選（{{ selectedIds.size }}）
      </el-button>
      <el-button v-if="album && album.status === 'draft'" type="primary" @click="handlePublish">
        發布相簿
      </el-button>
    </div>

    <el-empty v-if="album && album.photos.length === 0" description="還沒有照片，上傳第一張吧" />

    <div class="photo-grid">
      <div
        v-for="photo in album?.photos ?? []"
        :key="photo.id"
        class="photo-card"
        data-test="photo-card"
      >
        <el-checkbox
          class="photo-checkbox"
          :model-value="selectedIds.has(photo.id)"
          @change="toggleSelect(photo.id)"
        />
        <!-- thumb_url 可能為 null（縮圖尚未產生／產生失敗）：退回原圖。否則
             :src="null" 會讓 Vue 整個不渲染 src 屬性，畫面直接是破圖。 -->
        <img
          class="photo-thumb"
          :src="photo.thumb_url ?? photo.display_url"
          :alt="photo.original_filename ?? '相簿照片'"
          @click="toggleSelect(photo.id)"
        />
        <div class="photo-tags">
          <el-tag v-if="photo.students.length === 0" type="warning" size="small">未標記</el-tag>
          <el-tag v-for="s in photo.students" :key="s.id" size="small">{{ s.name }}</el-tag>
        </div>
        <div class="photo-actions">
          <el-button size="small" link @click="openTagDialog(photo.id)">標記</el-button>
          <el-button size="small" type="danger" link @click="removePhoto(photo.id)">刪除</el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="tagDialogVisible" title="標記學生" width="420px">
      <el-alert
        v-if="selectedIds.size > 1"
        type="warning"
        :closable="false"
        show-icon
        class="tag-overwrite-alert"
        data-test="tag-overwrite-alert"
      >
        套用後將覆蓋所選 {{ selectedIds.size }} 張照片目前的標記
      </el-alert>
      <el-select v-model="tagForm.studentIds" multiple filterable placeholder="選擇學生" style="width: 100%">
        <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <template #footer>
        <el-button @click="tagDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyTags">套用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { deleteAlbumPhoto, getAlbum, publishAlbum, setPhotoTags, uploadAlbumPhotos } from '@/api/classAlbums'
import type { AlbumDetail } from '@/api/classAlbums'
import { getMyStudents } from '@/api/portal'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB，前端先擋，後端仍會再驗一次

const route = useRoute()
const router = useRouter()
const albumId = Number(route.params.id)
const album = ref<AlbumDetail | null>(null)
const uploading = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const pendingFiles = ref<File[]>([])
const tagDialogVisible = ref(false)
const tagForm = ref<{ studentIds: number[] }>({ studentIds: [] })
const students = ref<Array<{ id: number; name: string }>>([])

async function load(): Promise<void> {
  const resp = await getAlbum(albumId)
  album.value = resp.data
  selectedIds.value = new Set()
}

function handleFileChange(uploadFile: UploadFile): void {
  const raw = uploadFile.raw
  if (!raw) return
  if (raw.size > MAX_FILE_SIZE) {
    ElMessage.error(`${raw.name} 超過 10MB，請重新選擇`)
    return
  }
  pendingFiles.value.push(raw)
}

function handleFileRemove(uploadFile: UploadFile): void {
  pendingFiles.value = pendingFiles.value.filter((f) => f !== uploadFile.raw)
}

async function handleUpload(files: File[]): Promise<boolean> {
  if (files.length === 0) return true
  uploading.value = true
  try {
    const formData = new FormData()
    for (const f of files) formData.append('files', f)
    const resp = await uploadAlbumPhotos(albumId, formData)
    const items = resp.data.items
    const failed = items.filter((i) => !i.ok)
    if (failed.length > 0) {
      ElMessage.warning(`${failed.length} 張上傳失敗：${failed.map((f) => `${f.filename}（${f.error ?? ''}）`).join('、')}`)
    } else {
      ElMessage.success(`已上傳 ${items.length} 張照片`)
    }
    await load()
    return true
  } catch {
    // 整個上傳請求失敗（網路斷線／伺服器 500，非個別檔案失敗）：回報失敗讓 submitUpload 保留 pendingFiles，
    // 使用者不必重新選檔即可重試（比照 applyTags 的錯誤處理慣例）
    ElMessage.error('上傳失敗，請重試')
    return false
  } finally {
    uploading.value = false
  }
}

async function submitUpload(): Promise<void> {
  const ok = await handleUpload(pendingFiles.value)
  if (ok) pendingFiles.value = []
}

async function removePhoto(photoId: number): Promise<void> {
  try {
    await ElMessageBox.confirm('確定刪除這張照片？', '刪除照片', { type: 'warning' })
  } catch (e) {
    // 使用者按取消 → 靜默返回；非 cancel 的例外照舊往外拋，讓既有全域 handler（Sentry unhandledrejection）接住
    if (e !== 'cancel') throw e
    return
  }
  await deleteAlbumPhoto(albumId, photoId)
  await load()
}

function toggleSelect(photoId: number): void {
  const next = new Set(selectedIds.value)
  if (next.has(photoId)) next.delete(photoId)
  else next.add(photoId)
  selectedIds.value = next
}

async function loadStudents(): Promise<void> {
  try {
    const resp = await getMyStudents(album.value ? { classroom_id: album.value.classroom_id } : undefined)
    // MyStudentsOut 把學生掛在 classrooms[].students 下（比照 class-hub 用法攤平）；
    // 已用 classroom_id query param 讓後端只回本班，這裡再 flatten 成單一清單。
    students.value = (resp.data.classrooms ?? []).flatMap((c) =>
      (c.students ?? []).map((s) => ({ id: s.id, name: s.name })),
    )
  } catch {
    // 學生名單是標記 dialog 的輔助資料，載入失敗不應擋掉相簿主頁面；提示一次後降級為空清單
    students.value = []
    ElMessage.warning('學生名單載入失敗，標記功能暫不可用')
  }
}

function openTagDialog(photoId?: number): void {
  if (photoId != null) selectedIds.value = new Set([photoId])
  if (selectedIds.value.size === 0) {
    ElMessage.warning('請先勾選要標記的照片')
    return
  }
  // 單張時預填既有標記，方便微調；多張批次標記則清空起選，避免誤把單張的既有標記套到整批
  if (selectedIds.value.size === 1 && album.value) {
    const only = album.value.photos.find((p) => selectedIds.value.has(p.id))
    tagForm.value.studentIds = only ? only.students.map((s) => s.id) : []
  } else {
    tagForm.value.studentIds = []
  }
  tagDialogVisible.value = true
}

async function applyTags(): Promise<void> {
  const items = [...selectedIds.value].map((attachmentId) => ({
    attachment_id: attachmentId,
    student_ids: tagForm.value.studentIds,
  }))
  try {
    await setPhotoTags(albumId, items)
    ElMessage.success('標記已更新')
    tagDialogVisible.value = false
    await load()
  } catch {
    // dialog 保持開啟方便使用者重試（比照 PortalAlbumsView.submitCreate 的錯誤處理慣例）
    ElMessage.error('標記失敗，請稍後再試')
  }
}

async function handlePublish(): Promise<void> {
  if (!album.value) return
  const untagged = album.value.untagged_count
  const warning =
    untagged > 0
      ? `尚有 ${untagged} 張未標記，任何家長都看不到這些照片。確定發布？`
      : '發布後被標記學生的家長即可看到照片。確定發布？'
  try {
    await ElMessageBox.confirm(warning, '發布相簿', { type: 'warning' })
  } catch (e) {
    // 使用者按取消 → 靜默返回；非 cancel 的例外照舊往外拋（比照 removePhoto 慣例）
    if (e !== 'cancel') throw e
    return
  }
  try {
    await publishAlbum(albumId)
    ElMessage.success('相簿已發布')
    await load()
  } catch {
    ElMessage.error('發布失敗，請重新整理後再試')
  }
}

function goBack(): void {
  router.push('/portal/albums')
}

onMounted(async () => {
  await load()
  await loadStudents()
})
defineExpose({
  handleUpload,
  submitUpload,
  pendingFiles,
  removePhoto,
  toggleSelect,
  selectedIds,
  album,
  openTagDialog,
  applyTags,
  handlePublish,
  tagForm,
  students,
})
</script>

<style scoped>
/* 版面比照 PortalAlbumsView：grid responsive 卡片；本頁多一列上傳工具列 */
.detail-header { margin-bottom: 16px; }
.detail-title-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.detail-title-row h2 { margin: 0; }
.detail-date { color: var(--el-text-color-secondary); }
.detail-warning { color: var(--el-color-warning); font-size: 13px; }
.upload-panel { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.upload-tip { color: var(--el-text-color-secondary); font-size: 12px; }
.action-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.photo-card { position: relative; border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; padding: 8px; }
.photo-checkbox { position: absolute; top: 8px; left: 8px; z-index: 1; }
.photo-thumb { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 4px; cursor: pointer; }
.photo-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; min-height: 24px; }
.photo-actions { display: flex; justify-content: space-between; margin-top: 4px; }
.tag-overwrite-alert { margin-bottom: 12px; }
</style>
