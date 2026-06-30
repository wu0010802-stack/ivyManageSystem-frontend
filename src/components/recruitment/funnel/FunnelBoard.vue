<template>
  <div class="funnel-board" v-loading="store.loadingBoard">
    <div class="funnel-board__toolbar">
      <el-select
        v-model="schoolYearLocal"
        placeholder="入學學年"
        clearable
        size="small"
        style="width: 120px"
      >
        <el-option
          v-for="y in yearOptions"
          :key="y"
          :value="y"
          :label="`${y} 學年`"
        />
      </el-select>
      <el-select
        v-model="semesterLocal"
        placeholder="入學學期"
        clearable
        size="small"
        style="width: 100px"
      >
        <el-option :value="1" label="上學期" />
        <el-option :value="2" label="下學期" />
      </el-select>
      <el-button size="small" @click="onRefresh">重新整理</el-button>
      <FunnelAddVisit :dashboard="dashboard" class="funnel-board__add" @created="onVisitCreated" />
    </div>

    <FunnelSummaryBar v-if="store.board" :summary="store.board.summary" />

    <div class="funnel-board__columns">
      <FunnelColumn
        v-for="col in columnConfigs"
        :key="col.stage"
        :stage="col.stage"
        :title="col.title"
        :accent-color="col.color"
        :cards="store.getStageCards(col.stage)"
        :can-drag-set="canDragSetForStage(col.stage)"
        :pending-set="store.pendingTransitions"
        @card-click="onCardClick"
        @transition-attempt="onTransitionAttempt"
      />
    </div>

    <TransitionConfirmDialog
      v-model="dialogOpen"
      :from-stage="pendingTransition?.fromStage ?? 'visited'"
      :to-stage="pendingTransition?.toStage ?? 'visited'"
      :visit-id="pendingTransition?.visitId ?? 0"
      :child-name="pendingTransition?.childName ?? ''"
      @confirm="onDialogConfirm"
      @cancel="onDialogCancel"
    />

    <TimelineDrawer v-model="drawerOpen" :visit-id="drawerVisitId" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { useRecruitmentFunnelStore, type Stage, type FunnelCardData } from '@/stores/recruitmentFunnel'
import { hasPermission } from '@/utils/auth'
import { currentRocYear } from '@/utils/academic'
import FunnelSummaryBar from './FunnelSummaryBar.vue'
import FunnelColumn from './FunnelColumn.vue'
import TransitionConfirmDialog from './TransitionConfirmDialog.vue'
import TimelineDrawer from './TimelineDrawer.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import FunnelAddVisit from './FunnelAddVisit.vue'

defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
}>()

const emit = defineEmits<{
  created: []
}>()

const store = useRecruitmentFunnelStore()

// === 篩選器 ===
const schoolYearLocal = ref<number | null>(null)
const semesterLocal = ref<1 | 2 | null>(null)
const currentYear = currentRocYear()
const yearOptions = computed(() => [currentYear + 1, currentYear, currentYear - 1, currentYear - 2])

async function onRefresh() {
  await store.setFilter(schoolYearLocal.value, semesterLocal.value)
}

// === Column 設定 ===
const columnConfigs: Array<{ stage: Stage; title: string; color: string }> = [
  { stage: 'visited', title: '已訪視', color: '#909399' },
  { stage: 'deposited', title: '已預繳', color: '#e6a23c' },
  { stage: 'enrolled', title: '已報到', color: '#67c23a' },
  { stage: 'active', title: '已開學', color: '#409eff' },
]

// === 權限控管 ===
// 使用 hasPermission() 字串名稱 API（內部已用 BigInt 避免 32-bit overflow）
function canDragSetForStage(stage: Stage): Set<number> {
  let allowed = false
  if (stage === 'visited' || stage === 'deposited') {
    allowed =
      hasPermission('RECRUITMENT_WRITE') || hasPermission('RECRUITMENT_CONVERT')
  } else {
    // enrolled / active：需要 STUDENTS_WRITE 才能拖進
    allowed = hasPermission('STUDENTS_WRITE')
  }
  if (!allowed) return new Set<number>()
  return new Set<number>(store.getStageCards(stage).map((c) => c.visit_id))
}

// === 轉換流程 ===
interface PendingTransition {
  visitId: number
  fromStage: Stage
  toStage: Stage
  childName: string
}

const pendingTransition = ref<PendingTransition | null>(null)
const dialogOpen = ref(false)

function needsDialog(from: Stage, to: Stage): boolean {
  // deposited → enrolled：需選教室（dropdown mode）
  if (from === 'deposited' && to === 'enrolled') return true
  // 退回已開學或已報到：destructive
  const order: Stage[] = ['visited', 'deposited', 'enrolled', 'active']
  if (
    (from === 'enrolled' || from === 'active') &&
    order.indexOf(to) < order.indexOf(from)
  ) return true
  return false
}

async function onTransitionAttempt(payload: {
  visitId: number
  fromStage: Stage
  toStage: Stage
}) {
  const card = store.getCardByVisitId(payload.visitId)
  if (!card) return

  if (needsDialog(payload.fromStage, payload.toStage)) {
    pendingTransition.value = { ...payload, childName: card.child_name }
    dialogOpen.value = true
  } else {
    try {
      await store.transition(payload.visitId, payload.toStage, {})
      ElMessage.success('已更新階段')
    } catch (err) {
      handleTransitionError(err)
    }
  }
}

async function onDialogConfirm(payload: { classroomId?: number; reason?: string }) {
  if (!pendingTransition.value) return
  const { visitId, toStage } = pendingTransition.value
  try {
    await store.transition(visitId, toStage, payload)
    ElMessage.success('已更新階段')
  } catch (err) {
    handleTransitionError(err)
  } finally {
    pendingTransition.value = null
  }
}

function onDialogCancel() {
  pendingTransition.value = null
}

function handleTransitionError(err: unknown): void {
  const e = err as {
    response?: {
      status?: number
      data?: { detail?: { code?: string; message?: string } }
    }
  }
  const code = e?.response?.data?.detail?.code
  const status = e?.response?.status
  const msg = e?.response?.data?.detail?.message

  if (code === 'REVERT_STUDENT_HAS_DATA') {
    ElMessageBox.alert(msg ?? '該學生已有業務資料，無法退回', '無法退回', {
      type: 'warning',
    })
  } else if (status === 403) {
    ElMessage.warning('無權限執行此操作')
  } else if (status === 409) {
    ElMessage.info('狀態已被其他人變更，已自動重新載入')
  } else {
    ElMessage.error(msg ?? '操作失敗，請稍後再試')
  }
}

// === 時間線 Drawer ===
const drawerOpen = ref(false)
const drawerVisitId = ref<number | null>(null)

function onCardClick(card: FunnelCardData) {
  drawerVisitId.value = card.visit_id
  drawerOpen.value = true
}

// 看板新增訪視成功：重載看板使新卡片出現；若該訪視月份不在目前篩選的學年/學期，提示使用者
async function onVisitCreated(record: { id: number; [k: string]: unknown }): Promise<void> {
  try {
    await store.loadBoard({ force: true })
  } catch {
    // 重載失敗：仍通知父層同步統計；不做篩選範圍判斷（避免以過期看板誤報）
    ElMessage.warning('新增成功，但看板重載失敗，請手動重新整理')
    emit('created')
    return
  }
  if (!store.getCardByVisitId(record.id)) {
    ElMessage.info('新增成功，但該參觀日期不在目前篩選的學年/學期，請切換篩選查看')
  }
  emit('created')
}

onMounted(() => {
  store.loadBoard()
})
</script>

<style scoped>
.funnel-board {
  padding: 12px;
}

.funnel-board__toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}

.funnel-board__add {
  margin-left: auto;
}

.funnel-board__columns {
  display: flex;
  gap: 12px;
  min-height: 500px;
}
</style>
