<template>
  <div class="portal-albums-view">
    <div class="view-header">
      <h2>班級相簿</h2>
      <el-button type="primary" @click="createVisible = true">建立相簿</el-button>
    </div>

    <el-empty v-if="!loading && albums.length === 0" description="還沒有相簿，建立第一本吧" />

    <div class="album-grid">
      <div
        v-for="album in albums"
        :key="album.id"
        class="album-card"
        data-test="album-card"
        @click="goDetail(album.id)"
      >
        <div class="album-cover">
          <img v-if="album.cover_thumb_url" :src="album.cover_thumb_url" :alt="album.title" />
          <div v-else class="album-cover-empty">尚無照片</div>
        </div>
        <div class="album-info">
          <div class="album-title">{{ album.title }}</div>
          <div class="album-meta">
            <span>{{ album.event_date }}</span>
            <span>{{ album.photo_count }} 張</span>
            <el-tag v-if="album.status === 'draft'" type="info" size="small">草稿</el-tag>
            <el-tag v-else type="success" size="small">已發布</el-tag>
          </div>
          <div v-if="album.untagged_count > 0" class="album-warning">未標記 {{ album.untagged_count }} 張</div>
        </div>
      </div>
    </div>

    <el-dialog v-model="createVisible" title="建立相簿" width="420px">
      <el-form label-width="80px">
        <el-form-item label="班級" required>
          <el-select v-model="createForm.classroom_id" placeholder="選擇班級">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="標題" required>
          <el-input v-model="createForm.title" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="活動日期" required>
          <el-date-picker v-model="createForm.event_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submitCreate">建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

import { createAlbum, getAlbumClassrooms, listAlbums } from '@/api/classAlbums'
import type { AlbumClassroomOption, AlbumSummary } from '@/api/classAlbums'

const router = useRouter()
const loading = ref(false)
const albums = ref<AlbumSummary[]>([])
const classrooms = ref<AlbumClassroomOption[]>([])
const createVisible = ref(false)
const createForm = ref<{ classroom_id: number | null; title: string; event_date: string; description: string }>({
  classroom_id: null, title: '', event_date: '', description: '',
})

const canSubmit = computed(
  () => createForm.value.classroom_id != null && createForm.value.title.trim() !== '' && createForm.value.event_date !== '',
)

async function load(): Promise<void> {
  loading.value = true
  try {
    const resp = await listAlbums()
    albums.value = resp.data
  } finally {
    loading.value = false
  }
}

async function submitCreate(): Promise<void> {
  if (!canSubmit.value) return
  try {
    await createAlbum({
      classroom_id: createForm.value.classroom_id as number,
      title: createForm.value.title.trim(),
      event_date: createForm.value.event_date,
      description: createForm.value.description.trim() || undefined,
    })
    ElMessage.success('相簿已建立')
    createVisible.value = false
    createForm.value = { classroom_id: null, title: '', event_date: '', description: '' }
    await load()
  } catch {
    ElMessage.error('建立失敗，請稍後再試')
  }
}

function goDetail(id: number): void {
  router.push(`/portal/albums/${id}`)
}

onMounted(async () => {
  await load()
  const resp = await getAlbumClassrooms()
  const list = resp.data
  classrooms.value = list
  if (list.length === 1) createForm.value.classroom_id = list[0].id
})

defineExpose({ createForm, submitCreate })
</script>

<style scoped>
/* 版面比照其他 Portal*View 的卡片樣式；grid 2-4 欄 responsive，封面 4:3 object-fit: cover */
.album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.album-card { cursor: pointer; border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; }
.album-cover { aspect-ratio: 4 / 3; background: var(--el-fill-color-light); }
.album-cover img { width: 100%; height: 100%; object-fit: cover; }
.album-info { padding: 10px 12px; }
.album-warning { color: var(--el-color-warning); font-size: 12px; margin-top: 4px; }
.view-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
</style>
