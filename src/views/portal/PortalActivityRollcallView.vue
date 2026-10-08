<script setup lang="ts">
/**
 * 課程點名｜單一場次（2026-09-14 改版）。
 *
 * 原本點名開在列表右側的 drawer 裡。改成獨立頁面的理由：
 *  - 與到園點名（/portal/student-attendance）一致，教師端只剩一套點名語彙
 *  - 手機上 drawer 本來就是全螢幕，卻還要塞下四欄表格
 *  - 有自己的網址，首頁待辦／通知可以直接深連結到某一堂
 *
 * 儲存後刻意留在本頁（composable 傳 closeOnSuccess: false）：關掉等於把人踢回列表，
 * 還要自己找回剛剛那一列。
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import type { AttendanceStudentGroup } from '@/composables/useActivityAttendanceDrawer'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { formatTaipeiDateTimeMinute } from '@/utils/format'
import { dayLabel } from '@/utils/activitySessionBoard'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import PortalRollcallPanel from './components/activity/PortalRollcallPanel.vue'

const route = useRoute()
const router = useRouter()

const sessionId = computed(() => Number(route.params.sessionId))

const {
  drawerLoading,
  drawerSession,
  saveLoading,
  groupedStudents,
  drawerPresentCount,
  drawerAbsentCount,
  drawerUnmarkedCount,
  dirtyCount,
  openDrawer,
  setUnmarkedPresent,
  handleSave,
  isDirty,
} = useActivityAttendanceDrawer({
  // 與 admin call site 相同的邊界：composable 以 unknown-arg 泛型定義 getSessionFn／
  // updateFn，其 SessionData 內部型別與 codegen 後的 API 型別不完全一致。
  // @ts-expect-error TODO(ts-strict): composable unknown-arg 契約 vs 型別化 API 的邊界
  getSessionFn: (id, params) => getPortalAttendanceSession(id as number, params),
  // @ts-expect-error TODO(ts-strict): 同上（records 型別於邊界相接）
  updateFn: (id, records) => batchUpdatePortalAttendance(id as number, records),
  closeOnSuccess: false,
})

useUnsavedChangesGuard(() => isDirty())

const students = computed(() => drawerSession.value?.students ?? [])
const totalCount = computed(() => students.value.length)

const subtitle = computed(() => {
  const s = drawerSession.value
  if (!s) return ''
  const parts = [dayLabel(s.session_date), `${totalCount.value} 人`]
  const classes = groupedStudents.value.map((g) => `${g.classroom_name} ${g.students.length}`)
  if (classes.length > 1) parts.push(classes.join('・'))
  return parts.join('・')
})

const lastSaved = computed(() => {
  const s = drawerSession.value
  if (!s?.last_recorded_at) return ''
  const who = s.last_recorded_by ? `・${s.last_recorded_by}` : ''
  return `上次儲存 ${formatTaipeiDateTimeMinute(s.last_recorded_at)}${who}`
})

function setGroupPresent(group: AttendanceStudentGroup) {
  // 只補未點名的人；已標好出席／缺席的不動（點到一半才按批次是常態）。
  group.students.forEach((s) => {
    if (s.is_present === null) s.is_present = true
  })
}

function goBack() {
  router.push({ name: 'portal-activity-attendance' })
}

async function load() {
  if (!Number.isFinite(sessionId.value)) {
    ElMessage.error('場次編號不正確')
    return
  }
  // group_by=classroom 讓後端一併回分組；composable 也會自己從扁平名冊算 groups，
  // 兩邊同一份物件參考，分組模式的輸入照樣進得了儲存來源。
  await openDrawer({ id: sessionId.value }, { group_by: 'classroom' })
}

onMounted(load)
</script>

<template>
  <div class="rollcall-page">
    <PortalPageHeader
      :title="drawerSession?.course_name || '課程點名'"
      :subtitle="subtitle"
      back-label="課程點名"
      @back="goBack"
    >
      <template v-if="lastSaved" #actions>
        <span class="rollcall-page__last">{{ lastSaved }}</span>
      </template>
    </PortalPageHeader>

    <div v-if="drawerLoading" v-loading="true" class="rollcall-page__loading" />

    <PortalRollcallPanel
      v-else-if="drawerSession"
      :groups="groupedStudents"
      :students="students"
      :present-count="drawerPresentCount"
      :absent-count="drawerAbsentCount"
      :unmarked-count="drawerUnmarkedCount"
      :save-loading="saveLoading"
      :dirty-count="dirtyCount"
      @set-unmarked-present="setUnmarkedPresent"
      @set-group-present="setGroupPresent"
      @save="handleSave()"
    />

    <p v-else class="rollcall-page__error">
      載入不到這場的名冊。
      <el-button link type="primary" @click="load">重新整理</el-button>
    </p>
  </div>
</template>

<style scoped>
.rollcall-page {
  padding: var(--space-4, 16px);
}
.rollcall-page__last {
  color: var(--pt-text-muted);
  font-size: var(--text-xs, 12px);
}
.rollcall-page__loading {
  min-height: 240px;
}
.rollcall-page__error {
  padding: var(--space-6, 24px);
  text-align: center;
  color: var(--pt-text-muted);
  font-size: var(--text-sm, 13px);
}
</style>
