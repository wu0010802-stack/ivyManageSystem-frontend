<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listStudentAttachments, OWNER_TYPE_LABELS } from '@/api/studentAttachments'
import AttachmentGallery from '@/components/student/AttachmentGallery.vue'

const props = defineProps<{
  studentId: number
}>()

const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const filterType = ref('')

async function reload() {
  loading.value = true
  try {
    const params: Record<string, unknown> = { limit: 200 }
    if (filterType.value) params.owner_type = filterType.value
    const r = await listStudentAttachments(props.studentId, params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items.value = (r as any).data?.items || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    total.value = (r as any).data?.total ?? 0
  } catch {
    ElMessage.error('讀取照片牆失敗')
  } finally {
    loading.value = false
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
    <AttachmentGallery v-else :items="items" />
  </div>
</template>

<style scoped>
.photo-gallery-tab { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; gap: 12px; align-items: center; }
.count { font-size: 14px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
