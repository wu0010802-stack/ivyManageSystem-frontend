<script setup>
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildSelector from '../components/ChildSelector.vue'
import {
  listCourses,
  myRegistrations,
  registerCourses,
  confirmPromotion,
} from '../api/activity'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'

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

function toggleCourse(id) {
  const idx = form.value.course_ids.indexOf(id)
  if (idx >= 0) form.value.course_ids.splice(idx, 1)
  else form.value.course_ids.push(id)
}

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

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
  fetchMy()
  fetchCourses()
})
</script>

<template>
  <div class="activity-view">
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
      <div
        v-for="reg in filteredRegs"
        :key="reg.id"
        class="reg-card"
      >
        <div class="reg-header">
          <span class="reg-student">{{ reg.student_name || studentNameMap.get(reg.student_id) }}</span>
          <span class="reg-term">{{ reg.school_year }}-{{ reg.semester === 1 ? '上' : '下' }}</span>
          <span :class="['paid', reg.is_paid ? 'ok' : 'warn']">
            {{ reg.is_paid ? '已繳費' : '未繳費' }}
          </span>
        </div>
        <div
          v-for="rc in reg.courses"
          :key="rc.course_id"
          class="course-row"
        >
          <span class="course-name">{{ rc.course_name }}</span>
          <span
            class="course-status"
            :style="{
              background: COURSE_STATUS[rc.status]?.color.bg,
              color: COURSE_STATUS[rc.status]?.color.color,
            }"
          >
            {{ COURSE_STATUS[rc.status]?.label || rc.status }}
          </span>
          <button
            v-if="rc.status === 'promoted_pending'"
            class="confirm-btn"
            @click="onConfirmPromotion(reg, rc)"
          >確認轉正式</button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="toolbar">
        <button class="primary-btn icon-btn" @click="openRegister">
          <ParentIcon name="plus" size="sm" />
          開始報名
        </button>
      </div>
      <div v-if="!loading && courses.length === 0" class="empty">目前沒有開放的課程</div>
      <div
        v-for="c in courses"
        :key="c.id"
        class="course-card"
      >
        <div class="course-card-row1">
          <span class="course-card-name">{{ c.name }}</span>
          <span class="course-card-price">${{ c.price?.toLocaleString() }}</span>
        </div>
        <div class="course-card-row2">
          <span>{{ c.school_year }}-{{ c.semester === 1 ? '上' : '下' }}</span>
          <span v-if="c.sessions">・{{ c.sessions }} 堂</span>
          <span :class="['enroll-tag', c.is_full ? 'full' : 'open']">
            {{ c.enrolled_count }}/{{ c.capacity }}
            {{ c.is_full ? (c.allow_waitlist ? '可候補' : '已額滿') : '可報名' }}
          </span>
        </div>
        <div v-if="c.description" class="course-card-desc">{{ c.description }}</div>
      </div>
    </template>

    <!-- 報名 modal -->
    <AppModal
      v-model:open="showRegister"
      labelled-by="activity-register-title"
    >
      <div class="register-header">
        <span id="activity-register-title" class="register-title">報名才藝課</span>
        <button class="close" type="button" aria-label="關閉" @click="showRegister = false">
          <ParentIcon name="close" size="sm" />
        </button>
      </div>
      <div class="form">
        <div class="field">
          <label for="activity-student">學生</label>
          <select id="activity-student" v-model="form.student_id">
            <option
              v-for="c in childrenStore.items"
              :key="c.student_id"
              :value="c.student_id"
            >{{ c.name }}</option>
          </select>
        </div>
        <fieldset class="field">
          <legend>選擇課程（可複選）</legend>
          <div v-if="filteredCourses.length === 0" class="text-muted">無可報名課程</div>
          <label
            v-for="c in filteredCourses"
            :key="c.id"
            class="course-pick"
          >
            <input
              type="checkbox"
              :checked="form.course_ids.includes(c.id)"
              @change="toggleCourse(c.id)"
            />
            <span class="pick-name">{{ c.name }}</span>
            <span class="pick-meta">
              ${{ c.price?.toLocaleString() }}
              <span v-if="c.is_full">・已額滿{{ c.allow_waitlist ? '（候補）' : '' }}</span>
            </span>
          </label>
        </fieldset>
      </div>
      <div class="register-footer">
        <button type="button" class="secondary-btn" @click="showRegister = false">取消</button>
        <button type="button" class="primary-btn" :disabled="submitting" @click="submitRegister">
          {{ submitting ? '送出中...' : '送出報名' }}
        </button>
      </div>
    </AppModal>
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

.secondary-btn {
  padding: 8px 16px;
  background: var(--neutral-0);
  color: var(--pt-text-muted);
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  font-size: 14px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}

.reg-card,
.course-card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--pt-elev-1);
}

.reg-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.reg-student {
  font-weight: 600;
  color: var(--pt-text-strong);
}

.reg-term {
  background: var(--color-info-soft);
  color: var(--pt-info-link);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.paid {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.paid.ok { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.paid.warn { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }

.course-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute);
}

.course-name {
  flex: 1;
  font-size: 14px;
  color: var(--pt-text-muted);
}

.course-status {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.confirm-btn {
  padding: 4px 10px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 6px;
  font-size: 12px;
}

.course-card-row1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-card-name {
  font-weight: 600;
  color: var(--pt-text-strong);
}

.course-card-price {
  color: var(--brand-primary);
  font-weight: 600;
}

.course-card-row2 {
  margin-top: 4px;
  color: var(--pt-text-faint);
  font-size: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.enroll-tag {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: auto;
}
.enroll-tag.open { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.enroll-tag.full { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }

.course-card-desc {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.register-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pt-border-light);
}

.register-title { flex: 1; font-weight: 600; }

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pt-text-placeholder);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--pt-text-muted);
  margin-bottom: 4px;
}

.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
  font-size: 14px;
}

.course-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 14px;
}

.pick-name {
  flex: 1;
  font-weight: 500;
}

.pick-meta {
  color: var(--pt-text-placeholder);
  font-size: 12px;
}

.text-muted {
  color: var(--pt-text-placeholder);
  font-size: 13px;
  text-align: center;
  padding: 12px;
}

.register-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--pt-border-light);
}
</style>
