<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePortalClassHub } from '@/composables/usePortalClassHub'
import { usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'
import { getPortalPickupPendingCount } from '@/api/portal'
import { getHomeSummary } from '@/api/portalHome'
import { getMeasurementsLatest } from '@/api/portalMeasurements'
import PortalBatchMeasurementSheet from '@/components/portal/sheets/PortalBatchMeasurementSheet.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import PortalErrorState from '@/components/portal/PortalErrorState.vue'
import {
  visibleClassFeatures,
  featureBadge,
  type ClassFeatureDef,
  type ClassFeatureGroup,
} from '@/constants/portalClassFeatures'
import type { PortalHubCounts } from '@/utils/portalHubCounts'

interface ClassroomOption {
  classroom_id: number
  classroom_name: string
}

const route = useRoute()
const router = useRouter()

// 班級切換：null = 用後端解析的預設班
const classroomId = ref<number | null>(null)
const { data, loading, error, refresh } = usePortalClassHub(classroomId)

const { pendingCount: dismissalPendingCount } = usePortalDismissalAlerts()
const pickupPendingCount = ref(0)

const classrooms = ref<ClassroomOption[]>([])
const hubCounts = computed(
  () => (data.value?.counts ?? null) as PortalHubCounts | null,
)
const classroomName = computed(() => (data.value?.classroom_name as string) || '')
const studentCount = computed(() => {
  const id = data.value?.classroom_id as number | undefined
  const hit = classrooms.value.find((c) => c.classroom_id === id)
  return (hit as { student_count?: number } | undefined)?.student_count ?? null
})
const showSwitch = computed(() => classrooms.value.length > 1)
const selectedClassroomId = computed(
  () => data.value?.classroom_id as number | undefined,
)

const groups: { id: ClassFeatureGroup; title: string }[] = [
  { id: 'teach', title: '教學' },
  { id: 'manage', title: '管理' },
]

function featuresOf(group: ClassFeatureGroup): ClassFeatureDef[] {
  return visibleClassFeatures(group)
}

function badgeOf(f: ClassFeatureDef): number {
  if (f.externalBadge === 'dismissal') return dismissalPendingCount.value
  if (f.externalBadge === 'pickup') return pickupPendingCount.value
  return featureBadge(f, hubCounts.value)
}

// ── 全班量體位抽屜 ──
const measurementSheetOpen = ref(false)
const lastBatchMeasuredOn = ref<string | null>(null)

// 原 PortalClassHubView.vue:113-124 的 refreshLastBatchDate，隨頁面搬過來。
async function refreshLastBatchDate() {
  try {
    const { data: latestData } = await getMeasurementsLatest()
    const dates = (latestData as { last_measurement?: { measured_on?: string } }[])
      .map((r) => r.last_measurement?.measured_on)
      .filter((d): d is string => Boolean(d))
      .sort()
    lastBatchMeasuredOn.value = dates.length > 0 ? dates[dates.length - 1] : null
  } catch (_) {
    lastBatchMeasuredOn.value = null
  }
}

function captionOf(f: ClassFeatureDef): string {
  if (f.action === 'measurement') {
    return lastBatchMeasuredOn.value ? `上次 ${lastBatchMeasuredOn.value}` : '尚未量測'
  }
  return ''
}

function onFeatureClick(f: ClassFeatureDef) {
  if (f.action === 'measurement') {
    measurementSheetOpen.value = true
    return
  }
  if (f.to) router.push(f.to)
}

function onMeasurementDone() {
  refreshLastBatchDate()
}

// 深連結：桌機側欄「全班量體位」與存量通知都靠 ?sheet=measurement 進來。
// immediate 讓直接貼網址也有效；已在本頁時 push 只改 query 不重掛元件，
// 沒有這個 watch 抽屜就不會開。
watch(
  () => route.query.sheet,
  (name) => {
    const key = Array.isArray(name) ? name[0] : name
    if (key === 'measurement') measurementSheetOpen.value = true
  },
  { immediate: true },
)

watch(
  () => route.query.classroom_id,
  (raw) => {
    const v = Array.isArray(raw) ? raw[0] : raw
    const parsed = v == null ? null : Number(v)
    classroomId.value = Number.isFinite(parsed) ? (parsed as number) : null
  },
  { immediate: true },
)

async function loadClassrooms() {
  try {
    const { data: summary } = await getHomeSummary()
    const list = (summary as { classrooms?: ClassroomOption[] })?.classrooms || []
    classrooms.value = list
  } catch (_) {
    classrooms.value = []
  }
}

async function loadPickupCount() {
  try {
    const { data: res } = await getPortalPickupPendingCount()
    pickupPendingCount.value = (res as { count?: number })?.count || 0
  } catch (_) {
    pickupPendingCount.value = 0
  }
}

function onSwitchClassroom(id: number) {
  classroomId.value = id
}

onMounted(() => {
  refreshLastBatchDate()
  loadClassrooms()
  loadPickupCount()
})

function manualRefresh() {
  refresh().catch(() => {})
}
</script>

<template>
  <div class="portal-class">
    <PortalPageHeader
      :title="classroomName || '班級'"
      :subtitle="studentCount != null ? `${studentCount} 位學生` : ''"
    >
      <template #actions>
        <el-select
          v-if="showSwitch"
          data-test="classroom-switch"
          :model-value="selectedClassroomId"
          placeholder="切換班級"
          @change="onSwitchClassroom"
        >
          <el-option
            v-for="c in classrooms"
            :key="c.classroom_id"
            :label="c.classroom_name"
            :value="c.classroom_id"
          />
        </el-select>
        <el-button :loading="loading" @click="manualRefresh">重新整理</el-button>
      </template>
    </PortalPageHeader>

    <PortalErrorState
      v-if="error && !data"
      message="班級資料載入失敗，請確認網路後重試"
      @retry="manualRefresh"
    />

    <template v-else>
      <section v-for="g in groups" :key="g.id" class="feature-group">
        <h3 class="group-title">{{ g.title }}</h3>
        <div class="feature-grid">
          <button
            v-for="f in featuresOf(g.id)"
            :key="f.key"
            type="button"
            class="feature-tile press-scale"
            :data-test="`feature-${f.key}`"
            @click="onFeatureClick(f)"
          >
            <span class="feature-label">{{ f.label }}</span>
            <span v-if="badgeOf(f) > 0" class="feature-badge">{{ badgeOf(f) }}</span>
            <span v-if="captionOf(f)" class="feature-caption">{{ captionOf(f) }}</span>
          </button>
        </div>
      </section>
    </template>

    <PortalBatchMeasurementSheet
      v-model="measurementSheetOpen"
      @done="onMeasurementDone"
    />
  </div>
</template>

<style scoped>
.portal-class {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.group-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin: 0 0 var(--space-2);
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}

.feature-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 64px;
  padding: var(--space-3);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
}
.feature-tile:hover {
  background: var(--el-fill-color-light);
}

.feature-label {
  font-size: var(--text-sm);
  color: var(--el-text-color-primary);
}

.feature-caption {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.feature-badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--el-color-white);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
