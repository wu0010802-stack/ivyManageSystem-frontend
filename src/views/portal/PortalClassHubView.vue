<template>
  <div class="class-hub" v-loading="loading && !data">
    <ClassHubCommBar
      :messages-unread="messagesUnread"
      @open-panel="onOpenPanel"
    />

    <ClassHubStickyNext :next="data?.sticky_next" @jump="jumpDeep" />

    <div class="class-hub__header">
      <h2 class="class-hub__title">
        {{ data?.classroom_name || '今日工作台' }}
      </h2>
      <span v-if="data?.fetched_at" class="class-hub__updated">
        最後更新 {{ formatTime(data.fetched_at) }}
      </span>
      <el-button :loading="loading" size="small" @click="manualRefresh">
        手動刷新
      </el-button>
    </div>

    <div
      v-if="!data || data.classroom_id === 0"
      class="class-hub__empty"
    >
      <el-empty description="目前沒有班級任務" />
    </div>

    <template v-else>
      <ClassHubTimeSlotCard
        v-for="slot in data.slots"
        :key="slot.slot_id"
        :slot="slot"
        :is-current="slot.slot_id === currentSlotId"
        @open-sheet="onOpenSheet"
        @jump-page="onJumpPage"
      />
    </template>

    <ClassHubAttendanceSheet
      v-model:show="sheets.attendance"
      @done="onSheetDone('attendance_pending')"
    />
    <ClassHubMedicationSheet
      v-model:show="sheets.medication"
      @done="onSheetDone('medications_pending')"
    />
    <ClassHubIncidentQuickSheet
      v-model:show="sheets.incident"
      @done="manualRefresh"
    />

    <ClassHubMessagesDrawer
      :model-value="panel === 'messages'"
      :thread-id="threadId"
      @update:model-value="onMessagesDrawerToggle"
      @open-thread="openThread"
      @close-thread="closeThread"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePortalClassHub } from '@/composables/usePortalClassHub'
import { useClassHubPanelQuery } from '@/composables/useClassHubPanelQuery'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { hasPermission } from '@/utils/auth'
import ClassHubStickyNext from '@/components/portal/class-hub/ClassHubStickyNext.vue'
import ClassHubTimeSlotCard from '@/components/portal/class-hub/ClassHubTimeSlotCard.vue'
import ClassHubAttendanceSheet from '@/components/portal/class-hub/ClassHubAttendanceSheet.vue'
import ClassHubMedicationSheet from '@/components/portal/class-hub/ClassHubMedicationSheet.vue'
import ClassHubIncidentQuickSheet from '@/components/portal/class-hub/ClassHubIncidentQuickSheet.vue'
import ClassHubCommBar from '@/components/portal/class-hub/ClassHubCommBar.vue'
import ClassHubMessagesDrawer from '@/components/portal/class-hub/ClassHubMessagesDrawer.vue'

const { data, loading, refresh, decrementCount } = usePortalClassHub()
const router = useRouter()
const messagesStore = usePortalMessagesStore()
const { unreadCount: messagesUnread } = storeToRefs(messagesStore)
const {
  panel,
  threadId,
  openPanel,
  closePanel,
  openThread,
  closeThread,
} = useClassHubPanelQuery()

const sheets = reactive({
  attendance: false,
  medication: false,
  incident: false,
})

// 訊息未讀也要主動拉一次（store 沒有 auto-fetch）
async function refreshMessagesUnread() {
  if (!hasPermission('PARENT_MESSAGES_WRITE')) return
  try {
    await messagesStore.refreshUnread()
  } catch {
    /* silent */
  }
}

// Re-evaluate which slot is current every minute
const nowTick = ref(Date.now())
let tickTimer = null
onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60_000)
  refreshMessagesUnread()
})
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})

const currentSlotId = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  nowTick.value
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  if (m < 9 * 60) return 'morning'
  if (m < 12 * 60) return 'forenoon'
  if (m < 14 * 60) return 'noon'
  return 'afternoon'
})

function manualRefresh() {
  refresh().catch(() => {})
  refreshMessagesUnread()
}

function onOpenSheet(task) {
  if (task.kind === 'attendance') sheets.attendance = true
  else if (task.kind === 'medication') sheets.medication = true
  else if (task.kind === 'incident') sheets.incident = true
}

function onSheetDone(countKey) {
  decrementCount(countKey)
}

function onJumpPage(task) {
  const map = {
    observation: '/portal/observations',
    contact_book: '/portal/contact-book',
  }
  const target = map[task.kind]
  if (target) router.push(`${target}?from=hub`)
}

function jumpDeep(deepLink) {
  if (!deepLink) return
  router.push(deepLink)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// drawer 控制
function onOpenPanel(name) {
  openPanel(name)
}

function onMessagesDrawerToggle(val) {
  if (!val) closePanel()
}

// 關閉 panel / thread 時刷未讀
watch(panel, (newPanel, oldPanel) => {
  if (oldPanel === 'messages' && newPanel !== 'messages') refreshMessagesUnread()
})
</script>

<style scoped>
.class-hub {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}
.class-hub__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.class-hub__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.class-hub__updated {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}
.class-hub__empty {
  padding: 48px 0;
}
</style>
