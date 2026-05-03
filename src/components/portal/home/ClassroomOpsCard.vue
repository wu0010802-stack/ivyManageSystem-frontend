<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  card: { type: Object, required: true },
})

const router = useRouter()

const cb = computed(() => props.card.contact_book || {})
const cbPercent = computed(() =>
  cb.value.roster ? `${cb.value.published}/${cb.value.roster} (${cb.value.percentage}%)` : '—',
)

const consecutiveAbsences = computed(() => props.card.consecutive_absences || [])
const upcomingBirthdays = computed(() => props.card.upcoming_birthdays_7d || [])
const allergyAlerts = computed(() => props.card.allergy_alerts || [])

function gotoContactBook() {
  router.push({ path: '/portal/contact-book', query: { classroom_id: props.card.classroom_id } })
}
function gotoAttendance() {
  router.push({ path: '/portal/student-attendance', query: { classroom_id: props.card.classroom_id } })
}
function gotoMedications() {
  router.push({ path: '/portal/medications', query: { classroom_id: props.card.classroom_id } })
}
function gotoDismissal() {
  router.push('/portal/dismissal-calls')
}
</script>

<template>
  <div class="pt-card classroom-ops">
    <div class="header">
      <div class="title">{{ card.classroom_name }}</div>
      <div class="meta">{{ card.student_count }} 位學生</div>
    </div>

    <div class="kpi-row">
      <button class="kpi press-scale" @click="gotoContactBook">
        <span class="kpi-label">聯絡簿</span>
        <span class="kpi-value">{{ cbPercent }}</span>
        <span v-if="cb.draft" class="kpi-sub">草稿 {{ cb.draft }}</span>
      </button>
      <button class="kpi press-scale" @click="gotoAttendance">
        <span class="kpi-label">點名</span>
        <span class="kpi-value">{{ card.attendance_called_today ? '已完成' : '未點名' }}</span>
      </button>
      <button class="kpi press-scale" @click="gotoDismissal">
        <span class="kpi-label">接送</span>
        <span class="kpi-value">{{ card.pending_dismissal_calls }} 件待處理</span>
      </button>
      <button class="kpi press-scale" @click="gotoMedications">
        <span class="kpi-label">用藥</span>
        <span class="kpi-value">{{ card.pending_medications_today }} 筆未執行</span>
      </button>
    </div>

    <div v-if="consecutiveAbsences.length" class="alert-row">
      <span class="alert-label">⚠ 連續缺席</span>
      <span class="alert-content">
        <span v-for="a in consecutiveAbsences" :key="a.student_id" class="chip warn">
          {{ a.student_name }}（{{ a.days }} 天）
        </span>
      </span>
    </div>

    <div v-if="upcomingBirthdays.length" class="alert-row">
      <span class="alert-label">🎂 近期生日</span>
      <span class="alert-content">
        <span v-for="b in upcomingBirthdays" :key="b.student_id" class="chip happy">
          {{ b.student_name }}（{{ b.days_until === 0 ? '今天' : `${b.days_until} 天後` }}）
        </span>
      </span>
    </div>

    <div v-if="allergyAlerts.length" class="alert-row">
      <span class="alert-label">⚠ 過敏注意</span>
      <span class="alert-content">
        <span v-for="a in allergyAlerts" :key="a.student_id" class="chip danger">
          {{ a.student_name }}：{{ (a.allergens || []).map(x => x.allergen).join('、') }}
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.classroom-ops {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.header { display: flex; justify-content: space-between; align-items: baseline; }
.title { font-size: var(--text-lg); font-weight: 600; color: var(--pt-text-strong); }
.meta { font-size: var(--text-sm); color: var(--pt-text-muted); }

.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-2);
}
.kpi {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--space-3);
  background: var(--pt-surface-mute);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
}
.kpi:hover { background: var(--pt-surface-mute-soft); }
.kpi-label { font-size: var(--text-xs); color: var(--pt-text-muted); }
.kpi-value { font-size: var(--text-base); font-weight: 600; color: var(--pt-text-strong); }
.kpi-sub { font-size: var(--text-xs); color: var(--color-warning); }

.alert-row {
  display: flex; gap: var(--space-2); align-items: flex-start;
  font-size: var(--text-sm);
}
.alert-label {
  width: 80px;
  color: var(--pt-text-muted);
  flex-shrink: 0;
}
.alert-content { flex: 1; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center;
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
}
.chip.warn { background: var(--color-warning-lighter); color: var(--color-warning); }
.chip.happy { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }
.chip.danger { background: var(--color-danger-lighter); color: var(--color-danger); }
</style>
