<script setup>
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildSelector from '../components/ChildSelector.vue'
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

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const tab = ref('my') // my / new

const courses = ref([])
const myRegs = ref([])
const loading = ref(false)
const submitting = ref(false)
const showRegister = ref(false)

// 報名表單
const form = ref({
  student_id: null,
  school_year: null,
  semester: null,
  course_ids: [],
})

const studentNameMap = computed(() => {
  const m = new Map()
  for (const c of childrenStore.items || []) m.set(c.student_id, c.name)
  return m
})

const filteredRegs = computed(() => {
  if (!selectedId.value) return myRegs.value
  return myRegs.value.filter((r) => r.student_id === selectedId.value)
})

const COURSE_STATUS = {
  enrolled: { label: '已報名', color: { bg: 'var(--brand-primary-soft)', color: 'var(--pt-success-text)' } },
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
        (a, c) => a + Number(c.price_snapshot ?? c.price ?? 0),
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
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function fetchCourses() {
  loading.value = true
  try {
    const { data } = await listCourses()
    courses.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
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
    student_id: selectedId.value || childrenStore.items[0].student_id,
    school_year: c0.school_year,
    semester: c0.semester,
    course_ids: [],
  }
  showRegister.value = true
}

const filteredCourses = computed(() =>
  courses.value.filter(
    (c) =>
      c.school_year === form.value.school_year &&
      c.semester === form.value.semester,
  ),
)

async function submitRegister() {
  if (!form.value.student_id) {
    toast.warn('請選擇學生')
    return
  }
  if (!form.value.course_ids.length) {
    toast.warn('請至少選一門課')
    return
  }
  submitting.value = true
  try {
    await registerCourses({
      student_id: Number(form.value.student_id),
      school_year: form.value.school_year,
      semester: form.value.semester,
      course_ids: form.value.course_ids.map(Number),
      supply_ids: [],
    })
    toast.success('報名成功')
    showRegister.value = false
    fetchMy()
  } catch (err) {
    toast.error(err?.displayMessage || '報名失敗')
  } finally {
    submitting.value = false
  }
}

async function onConfirmPromotion(reg, rc) {
  try {
    await confirmPromotion(reg.id, rc.course_id)
    toast.success('已確認轉正式')
    fetchMy()
  } catch (err) {
    toast.error(err?.displayMessage || '確認失敗')
  }
}

function onScrollSection(key) {
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
  ensureSelected(childrenStore.items)
  fetchMy()
  fetchCourses()
})
</script>

<template>
  <div class="activity-view">
    <ActivityHero
      :active-registrations="activeRegistrations"
      :unpaid-activity-fee="unpaidActivityFee"
      :upcoming-count="upcomingCount"
      @scroll-section="onScrollSection"
    />

    <ChildSelector />
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
      <div v-if="!loading && filteredRegs.length === 0" class="empty">尚無報名</div>
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
        <button class="primary-btn icon-btn" @click="openRegister">
          <ParentIcon name="plus" size="sm" />
          開始報名
        </button>
      </div>
      <div v-if="!loading && courses.length === 0" class="empty">目前沒有開放的課程</div>
      <ActivityCardList v-else :courses="courses" />
    </template>

    <ActivityRegisterSheet
      v-model="showRegister"
      v-model:form-data="form"
      :children="childrenStore.items || []"
      :available-courses="filteredCourses"
      :submitting="submitting"
      @submit="submitRegister"
    />
  </div>
</template>

<style scoped>
.activity-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tab-row {
  display: flex;
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
  box-shadow: var(--pt-elev-1);
}

.tab-btn {
  flex: 1;
  padding: 8px;
  background: transparent;
  border: none;
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--brand-primary);
  color: var(--neutral-0);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
}

.primary-btn:disabled { opacity: 0.5; }

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}
</style>
