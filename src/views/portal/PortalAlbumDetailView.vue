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
        <img class="photo-thumb" :src="photo.thumb_url" :alt="photo.original_filename" @click="toggleSelect(photo.id)" />
        <div class="photo-tags">
          <el-tag v-if="photo.students.length === 0" type="warning" size="small">未標記</el-tag>
          <el-tag v-for="s in photo.students" :key="s.id" size="small">{{ s.name }}</el-tag>
        </div>
        <el-button class="photo-delete" size="small" type="danger" link @click="removePhoto(photo.id)">
          刪除
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { deleteAlbumPhoto, getAlbum, uploadAlbumPhotos } from '@/api/classAlbums'
import type { AlbumDetail } from '@/api/classAlbums'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB，前端先擋，後端仍會再驗一次

const route = useRoute()
const router = useRouter()
const albumId = Number(route.params.id)
const album = ref<AlbumDetail | null>(null)
const uploading = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const pendingFiles = ref<File[]>([])

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

async function handleUpload(files: File[]): Promise<void> {
  if (files.length === 0) return
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
  } finally {
    uploading.value = false
  }
}

async function submitUpload(): Promise<void> {
  const files = pendingFiles.value
  pendingFiles.value = []
  await handleUpload(files)
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

function goBack(): void {
  router.push('/portal/albums')
}

onMounted(load)
defineExpose({ handleUpload, removePhoto, toggleSelect, selectedIds, album })
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
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.photo-card { position: relative; border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; padding: 8px; }
.photo-checkbox { position: absolute; top: 8px; left: 8px; z-index: 1; }
.photo-thumb { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 4px; cursor: pointer; }
.photo-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; min-height: 24px; }
.photo-delete { margin-top: 4px; }
</style>
