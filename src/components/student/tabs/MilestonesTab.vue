<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listMilestones, deleteMilestone, MILESTONE_TYPES, autoDetectMilestones } from '@/api/studentMilestones'
import { hasPermission } from '@/utils/auth'
import MilestoneEditorDialog from '../MilestoneEditorDialog.vue'

const props = defineProps<{
  studentId: number
}>()

const list = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref<Record<string, unknown> | null>(null)
const filterType = ref('')

const canWrite = hasPermission('PORTFOLIO_WRITE')

const autoDetecting = ref(false)

async function onAutoDetect() {
  autoDetecting.value = true
  try {
    const r = await autoDetectMilestones(props.studentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { created_count, skipped_existing } = (r as any).data
    ElMessage.success(`偵測完成：新增 ${created_count} 筆，跳過 ${skipped_existing} 筆已存在`)
    await reload()
  } catch (e) {
    ElMessage.error('自動偵測失敗')
  } finally {
    autoDetecting.value = false
  }
}

function typeMeta(t: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (MILESTONE_TYPES as any[]).find((x: any) => x.value === t) || {}
}

async function reload() {
  loading.value = true
  try {
    const resp = await listMilestones(props.studentId, {
      limit: 200,
      milestone_type: filterType.value || undefined,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list.value = (resp as any).data?.items || []
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (e as any)?.response?.data?.detail || '載入失敗'
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}

onMounted(reload)

watch(filterType, () => {
  reload()
})

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(item: Record<string, unknown>) {
  editing.value = item
  dialogVisible.value = true
}

async function handleDelete(item: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${item.title}」這個里程碑嗎？`,
      '刪除確認',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    await deleteMilestone(props.studentId, item.id as number)
    ElMessage.success('已刪除里程碑')
    await reload()
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (e as any)?.response?.data?.detail || '刪除失敗'
    ElMessage.error(msg)
  }
}

function handleSaved() {
  reload()
}
</script>

<template>
  <div class="milestones-tab">
    <!-- Toolbar -->
    <div class="toolbar">
      <el-select
        v-model="filterType"
        placeholder="全部類型"
        clearable
        style="width: 180px"
      >
        <el-option
          v-for="t in MILESTONE_TYPES"
          :key="t.value"
          :label="`${t.icon} ${t.label}`"
          :value="t.value"
        />
      </el-select>

      <el-button
        v-if="canWrite"
        :loading="autoDetecting"
        style="margin-left: auto"
        @click="onAutoDetect"
      >
        🤖 自動偵測
      </el-button>
      <el-button
        v-if="canWrite"
        type="primary"
        @click="openCreate"
      >
        新增里程碑
      </el-button>
    </div>

    <!-- Loading / Empty -->
    <div v-loading="loading">
      <el-empty v-if="!loading && list.length === 0" description="尚無里程碑紀錄" />

      <!-- Card grid -->
      <div v-else class="milestone-grid">
        <el-card
          v-for="item in list"
          :key="item.id as PropertyKey"
          shadow="hover"
          class="milestone-card"
        >
          <!-- Card header -->
          <div class="card-header">
            <span class="card-icon">{{ item.icon || typeMeta(item.milestone_type as string).icon || '✨' }}</span>
            <el-tag size="small" class="type-badge">
              {{ typeMeta(item.milestone_type as string).label || item.milestone_type }}
            </el-tag>
            <span class="achieved-date">{{ item.achieved_on }}</span>
          </div>

          <!-- Title -->
          <div class="card-title">{{ item.title }}</div>

          <!-- Description -->
          <div
            v-if="item.description"
            class="card-description"
          >{{ item.description }}</div>

          <!-- Parent acknowledged -->
          <div v-if="item.parent_acknowledged_at" class="parent-ack">
            家長已看過
            <span v-if="item.reaction_emoji"> · {{ item.reaction_emoji }}</span>
          </div>

          <!-- Actions -->
          <div v-if="canWrite" class="card-actions">
            <el-button size="small" link @click="openEdit(item)">編輯</el-button>
            <el-button size="small" link type="danger" @click="handleDelete(item)">刪除</el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- Editor dialog -->
    <MilestoneEditorDialog
      v-model="dialogVisible"
      :student-id="studentId"
      :milestone="editing"
      @saved="handleSaved"
    />
  </div>
</template>

<style scoped>
.milestones-tab {
  padding: 4px 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.milestone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.milestone-card {
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-icon {
  font-size: 1.4em;
  line-height: 1;
}

.type-badge {
  flex-shrink: 0;
}

.achieved-date {
  margin-left: auto;
  font-size: 0.85em;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.card-title {
  font-weight: 600;
  font-size: 1em;
  margin-bottom: 6px;
  word-break: break-word;
}

.card-description {
  font-size: 0.875em;
  color: var(--el-text-color-regular);
  white-space: pre-line;
  word-break: break-word;
  margin-bottom: 8px;
}

.parent-ack {
  font-size: 0.8em;
  color: #18a058;
  margin-bottom: 8px;
}

.card-actions {
  display: flex;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
