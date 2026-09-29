<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { hasPermission } from '@/utils/auth'
import {
  deleteStudentAttachment,
  listStudentAttachments,
  OWNER_TYPE_LABELS,
} from '@/api/studentAttachments'
import type { ApiQuery } from '@/api/_generated/typed'
import AttachmentGallery from '@/components/student/AttachmentGallery.vue'

const props = defineProps<{
  studentId: number
}>()

const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const filterType = ref('')

const canWrite = computed(() => hasPermission('PORTFOLIO_WRITE'))

async function reload() {
  loading.value = true
  try {
    const params: ApiQuery<'/students/{student_id}/attachments', 'get'> = { limit: 200 }
    if (filterType.value) params.owner_type = filterType.value
    const r = await listStudentAttachments(props.studentId, params)
    items.value = (r.data?.items ?? []) as unknown as Record<string, unknown>[]
    total.value = r.data?.total ?? 0
  } catch (e) {
    ElMessage.error(friendlyError('載入照片牆失敗', e))
  } finally {
    loading.value = false
  }
}

async function onDelete(item: Record<string, unknown>) {
  const isClassAlbum = item.owner_type === 'class_album'
  const source = OWNER_TYPE_LABELS[item.owner_type as keyof typeof OWNER_TYPE_LABELS] ?? '其他來源'
  // 班級相簿照片標記整班：後端只解除這位幼兒的標記，不影響相簿與其他幼兒
  const message = isClassAlbum
    ? '這張照片來自班級相簿，只會從這位幼兒的照片牆移除，相簿與其他幼兒不受影響。確定要移除嗎？'
    : `這張照片來自「${source}」，刪除後原紀錄中的照片也會一併移除，家長端將無法再看到。確定要刪除嗎？`
  try {
    await ElMessageBox.confirm(message, isClassAlbum ? '移除確認' : '刪除確認', {
      type: 'warning',
      confirmButtonText: isClassAlbum ? '移除' : '刪除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await deleteStudentAttachment(props.studentId, item.id as number)
    ElMessage.success(isClassAlbum ? '已從照片牆移除' : '已刪除照片')
    await reload()
  } catch (e) {
    ElMessage.error(friendlyError('刪除照片失敗', e))
  }
}

const OWNER_OPTIONS = computed(() =>
   
  Object.entries(OWNER_TYPE_LABELS as Record<string, string>).map(([value, label]) => ({ value, label })),
)

onMounted(reload)
watch(filterType, reload)
</script>

<template>
  <div class="photo-gallery-tab">
    <div class="toolbar">
      <el-select v-model="filterType" placeholder="全部來源" clearable style="width: 200px">
        <el-option
          v-for="opt in OWNER_OPTIONS"
          :key="opt.value"
          :value="opt.value"
          :label="opt.label"
        />
      </el-select>
      <span class="count">共 {{ total }} 張</span>
    </div>

    <el-empty v-if="!loading && items.length === 0" description="尚無照片" />
    <AttachmentGallery v-else :items="items" :deletable="canWrite" @delete="onDelete" />
  </div>
</template>

<style scoped>
.photo-gallery-tab { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; gap: 12px; align-items: center; }
.count { font-size: 14px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
