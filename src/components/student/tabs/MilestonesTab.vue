<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listMilestones, deleteMilestone, MILESTONE_TYPES } from '@/api/studentMilestones'
import { hasPermission } from '@/utils/auth'
import MilestoneEditorDialog from '../MilestoneEditorDialog.vue'

const props = defineProps({
  studentId: { type: Number, required: true },
})

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(null)
const filterType = ref('')

const canWrite = hasPermission('PORTFOLIO_WRITE')

function typeMeta(t) {
  return MILESTONE_TYPES.find((x) => x.value === t) || {}
}

async function reload() {
  loading.value = true
  try {
    const resp = await listMilestones(props.studentId, {
      limit: 200,
      milestone_type: filterType.value || undefined,
    })
    list.value = resp.data.items
  } catch (e) {
    const msg = e?.response?.data?.detail || '載入失敗'
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

function openEdit(item) {
  editing.value = item
  dialogVisible.value = true
}

async function handleDelete(item) {
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
    await deleteMilestone(props.studentId, item.id)
    ElMessage.success('已刪除里程碑')
    await reload()
  } catch (e) {
    const msg = e?.response?.data?.detail || '刪除失敗'
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
        type="primary"
        @click="openCreate"
        style="margin-left: auto"
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
          :key="item.id"
          shadow="hover"
          class="milestone-card"
        >
          <!-- Card header -->
          <div class="card-header">
            <span class="card-icon">{{ item.icon || typeMeta(item.milestone_type).icon || '✨' }}</span>
            <el-tag size="small" class="type-badge">
              {{ typeMeta(item.milestone_type).label || item.milestone_type }}
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
