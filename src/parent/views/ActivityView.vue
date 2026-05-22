<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import ActivityHero from '../components/activity/ActivityHero.vue'
import ActivityCardList from '../components/activity/ActivityCardList.vue'
import ActivityRegisterSheet from '../components/activity/ActivityRegisterSheet.vue'
import RegistrationStatusList from '../components/activity/RegistrationStatusList.vue'
import {
  listCourses,
  myRegistrations,
  registerCourses,
  confirmPromotion,
} from '../api/activity'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import PullToRefresh from '../components/PullToRefresh.vue'

interface RegCourse { course_id: number; course_name: string; status: string; price?: number; price_snapshot?: unknown }
interface Registration { id: number; student_id: number; student_name?: string; school_year: number; semester: number; is_paid: boolean; courses: RegCourse[] }
interface Course { id: number; name: string; price?: number; school_year: number; semester: number; capacity: number; enrolled_count: number; is_full: boolean; allow_waitlist: boolean; sessions?: number; description?: string; price_snapshot?: unknown }

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const tab = ref('my') // my / new

const courses = ref<Course[]>([])
const myRegs = ref<Registration[]>([])
const loading = ref(false)
const submitting = ref(false)
const showRegister = ref(false)

// 報名表單（符合 ActivityRegisterSheet FormData interface）
const form = ref<{
  student_id?: number
  school_year?: number | null
  semester?: string | null
  course_ids?: number[]
  [key: string]: unknown
}>({
  student_id: undefined,
  school_year: null,
  semester: null,
  course_ids: [],
})

const childrenTyped = computed(() => (childrenStore.items || []) as { student_id: number; name: string }[])

const studentNameMap = computed(() => {
  const m = new Map<number, string>()
  for (const c of childrenStore.items || []) {
    const child = c as { student_id: number; name: string }
    m.set(child.student_id, child.name)
  }
  return m
})

const filteredRegs = computed(() => {
  if (!selectedId.value) return myRegs.value
  return myRegs.value.filter((r) => r.student_id === selectedId.value)
})

const COURSE_STATUS = {
  enrolled: { label: '已報名', color: { bg: 'var(--brand-primary-soft)', color: 'var(--m3-primary, var(--pt-success-text))' } },
  waitlist: { label: '候補中', color: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text-soft)' } },
  promoted_pending: { label: '待您確認', color: { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' } },
}

// hero stats
const activeRegistrations = computed(() =>
  filteredRegs.value.filter((r) =>
    (r.courses || []).some(
      (c) => c.status === 'enrolled' || c.status === 'confirmed',
    ),
  ).length,
)

const unpaidActivityFee = computed(() =>
  filteredRegs.value
    .filter((r) => !r.is_paid)
    .reduce((s, r) => {
      const total = (r.courses || []).reduce(
        (a, c) => a + Number((c as unknown as { price_snapshot?: unknown; price?: number }).price_snapshot ?? c.price ?? 0),
        0,
      )
      return s + total
    }, 0),
)

// MVP：後端 course response 無 start_date，先設 0；後續若新增欄位再算 7 天內
const upcomingCount = computed(() => 0)

async function fetchMy() {
  loading.value = true
  try {
    const { data } = await myRegistrations()
    myRegs.value = data?.items || []
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function fetchCourses() {
  loading.value = true
  try {
    const { data } = await listCourses()
    courses.value = data?.items || []
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

function openRegister() {
  if ((childrenStore.items || []).length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  if (courses.value.length === 0) {
    toast.warn('目前沒有可報名的課程')
    return
  }
  // 預設帶入第一門課的學期
  const c0 = courses.value[0]
  form.value = {
    student_id: selectedId.value ?? (childrenStore.items[0] as { student_id: number }).student_id,
    school_year: c0.school_year,
    semester: String(c0.semester),
    course_ids: [],
  }
  showRegister.value = true
}

const filteredCourses = computed(() =>
  courses.value.filter(
    (c) =>
      c.school_year === form.value.school_year &&
      String(c.semester) === form.value.semester,
  ),
)

async function submitRegister() {
  if (!form.value.student_id) {
    toast.warn('請選擇學生')
    return
  }
  if (!(form.value.course_ids?.length)) {
    toast.warn('請至少選一門課')
    return
  }
  submitting.value = true
  try {
    await registerCourses({
      student_id: Number(form.value.student_id),
      school_year: form.value.school_year,
      semester: form.value.semester,
      course_ids: (form.value.course_ids ?? []).map(Number),
      supply_ids: [],
    })
    toast.success('報名成功')
    showRegister.value = false
    fetchMy()
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '報名失敗'))
  } finally {
    submitting.value = false
  }
}

async function onConfirmPromotion(reg: Registration, rc: RegCourse) {
  try {
    await confirmPromotion(reg.id, rc.course_id)
    toast.success('已確認轉正式')
    fetchMy()
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '確認失敗'))
  }
}

function onScrollSection(key: string) {
  if (key === 'active') {
    tab.value = 'my'
    requestAnimationFrame(() =>
      document.querySelector('#act-active')?.scrollIntoView({ behavior: 'smooth' }),
    )
  } else if (key === 'upcoming') {
    tab.value = 'new'
    requestAnimationFrame(() =>
      document.querySelector('#act-upcoming')?.scrollIntoView({ behavior: 'smooth' }),
    )
  } else if (key === 'unpaid') {
    tab.value = 'my'
    requestAnimationFrame(() => {
      const el = document.querySelector('.reg-card .paid.warn')
      if (el) el.closest('.reg-card')?.scrollIntoView({ behavior: 'smooth' })
      else
        document
          .querySelector('#act-active')
          ?.scrollIntoView({ behavior: 'smooth' })
    })
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  fetchMy()
  fetchCourses()
})

async function pullRefresh() {
  await Promise.all([fetchMy(), fetchCourses()])
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="activity-view">
    <ActivityHero
      :active-registrations="activeRegistrations"
      :unpaid-activity-fee="unpaidActivityFee"
      :upcoming-count="upcomingCount"
      @scroll-section="onScrollSection"
    />

    <ChildContextHeader v-if="tab === 'my'" variant="page" />
    <div class="tab-row">
      <button
        class="tab-btn"
        :class="{ active: tab === 'my' }"
        @click="tab = 'my'"
      >我的報名</button>
      <button
        class="tab-btn"
        :class="{ active: tab === 'new' }"
        @click="tab = 'new'"
      >可報名課程</button>
    </div>

    <template v-if="tab === 'my'">
      <div v-if="!loading && filteredRegs.length === 0" class="pt-empty">
        <div class="pt-empty-title">尚無報名</div>
      </div>
      <RegistrationStatusList
        v-else
        :registrations="filteredRegs"
        :student-name-map="studentNameMap"
        :course-status-map="COURSE_STATUS"
        @confirm-promotion="onConfirmPromotion"
      />
    </template>

    <template v-else>
      <div class="toolbar">
        <button class="pt-action-btn" @click="openRegister">
          <ParentIcon name="plus" size="sm" />
          開始報名
        </button>
      </div>
      <div v-if="!loading && courses.length === 0" class="pt-empty">
        <div class="pt-empty-title">目前沒有開放的課程</div>
      </div>
      <ActivityCardList v-else :courses="courses" />
    </template>

    <ActivityRegisterSheet
      v-model="showRegister"
      v-model:form-data="form"
      :children="childrenTyped"
      :available-courses="filteredCourses"
      :submitting="submitting"
      @submit="submitRegister"
    />
  </PullToRefresh>
</template>

<style scoped>
.activity-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--pt-page-gap, 18px);
}

.tab-row {
  display: flex;
  background: var(--pt-surface-recessed, var(--pt-surface-mute));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 18px;
  padding: 4px;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  min-height: var(--touch-target-min, 44px);
  padding: 8px;
  background: transparent;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  color: var(--pt-text-soft);
  border-radius: 14px;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}

.tab-btn:hover { background: var(--pt-surface-mute-soft, #fefcf3); }

.tab-btn.active {
  background: var(--pt-surface-raised, var(--neutral-0));
  border-color: var(--pt-border-light, #ecf5f9);
  color: var(--brand-primary);
  box-shadow: var(--pt-shadow-press, var(--pt-elev-1));
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}
</style>
