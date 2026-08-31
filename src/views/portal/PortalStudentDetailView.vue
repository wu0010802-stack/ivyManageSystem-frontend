<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getStudentDetail } from '@/api/portalStudentDetail'
import { Odometer, Star } from '@element-plus/icons-vue'
import PortalMeasurementSheet from '@/components/portal/sheets/PortalMeasurementSheet.vue'
import PortalMilestoneSheet from '@/components/portal/sheets/PortalMilestoneSheet.vue'
import PortalErrorState from '@/components/portal/PortalErrorState.vue'
import { LIFECYCLE_LABELS_PORTAL } from '@/constants/lifecycle'

const props = defineProps({
  studentId: { type: [String, Number], required: true },
})

// phone_masked：後端 schemas/portal_students.StudentDetailGuardian 只回遮罩後的電話，
// 沒有 `phone` 這個欄位。本 interface 帶 index signature，寫錯欄位名不會被 vue-tsc 抓到，
// 因此欄位名以後端 schema 為準（要看完整號碼須另接 revealStudentPhone，
// 作法見 PortalStudentDrawer.vue）。
interface Guardian { id?: number; name?: string; relation?: string; is_primary?: boolean; is_emergency?: boolean; can_pickup?: boolean; phone_masked?: string | null; email?: string; user_id?: number; [key: string]: unknown }
interface StudentDetail { student?: Record<string, unknown>; classroom?: { name?: string; [key: string]: unknown }; health?: Record<string, unknown>; guardians?: Guardian[]; attendance_30d?: Record<string, unknown>; recent_observations_30d?: Record<string, unknown>[]; recent_assessments?: Record<string, unknown>[]; recent_incidents_30d?: Record<string, unknown>[]; contact_book_recent?: Record<string, unknown>[]; [key: string]: unknown }

const router = useRouter()
const route = useRoute()
const detail = ref<StudentDetail | null>(null)
const sheets = ref({ measurement: false, milestone: false })

function openMeasurementSheet() {
  sheets.value.measurement = true
}
function openMilestoneSheet() {
  sheets.value.milestone = true
}
const loading = ref(false)
const error = ref<unknown>(null)
// 支援 deep-link 指定分頁（如搜尋面板家長結果帶 ?tab=guardians）
const activeTab = ref((route.query.tab as string) || 'health')

// 教師端受眾用語；原本直接顯示 raw lifecycle_status（無 label）→ 補上中文 label
function lifecycleLabel(s: string | undefined | null) {
  return (s && LIFECYCLE_LABELS_PORTAL[s]) || s || ''
}

// request-sequence guard：快速切換學生時，慢回應不得覆蓋新學生的畫面
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  try {
    const { data } = await getStudentDetail(Number(props.studentId))
    if (seq !== loadSeq) return
    detail.value = data
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = e
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '讀取失敗')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

onMounted(load)
watch(() => props.studentId, load)

const ageLabel = computed(() => {
  const bday = detail.value?.student?.birthday as string | undefined
  if (!bday) return ''
  const b = new Date(bday)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  let months = now.getMonth() - b.getMonth()
  if (now.getDate() < b.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  return `${years} 歲 ${months} 個月`
})

const primaryGuardian = computed(() =>
  detail.value?.guardians?.find((g) => g.is_primary) || detail.value?.guardians?.[0] || null,
)

// Typed accessor helpers for template
const studentInfo = computed(() => detail.value?.student as Record<string, unknown> | undefined)
const classroomInfo = computed(() => detail.value?.classroom)
const healthInfo = computed(() => detail.value?.health as Record<string, unknown> | undefined)
const attendance30d = computed(() => detail.value?.attendance_30d as Record<string, unknown> | undefined)
const observations = computed(() => detail.value?.recent_observations_30d as Record<string, unknown>[] | undefined)
const assessments = computed(() => detail.value?.recent_assessments as Record<string, unknown>[] | undefined)
const incidents = computed(() => detail.value?.recent_incidents_30d as Record<string, unknown>[] | undefined)
const contactBookRecent = computed(() => detail.value?.contact_book_recent as Record<string, unknown>[] | undefined)

function goObservation() {
  router.push({ path: '/portal/observations', query: { student_id: props.studentId } })
}

function back() {
  router.push('/portal/students')
}
</script>

<template>
  <div class="student-detail">
    <el-button text @click="back">← 返回班級學生</el-button>

    <div v-if="loading" class="loading">
      <div class="pt-shimmer skeleton-block"></div>
      <div class="pt-shimmer skeleton-block"></div>
    </div>

    <!-- 載入失敗改渲染持久錯誤區塊 + 重試（原本失敗只剩返回鍵的白頁） -->
    <PortalErrorState
      v-else-if="error"
      message="學生資料載入失敗，請確認網路後重試"
      @retry="load"
    />

    <template v-else-if="detail">
      <!-- Header -->
      <div class="header pt-card-elevated">
        <div class="title-row">
          <h2>{{ (studentInfo as Record<string, unknown>)?.name }}</h2>
          <span class="age">{{ ageLabel }}</span>
          <el-tag v-if="(studentInfo as Record<string, unknown>)?.lifecycle_status" size="small">
            {{ lifecycleLabel((studentInfo as Record<string, unknown>)?.lifecycle_status as string) }}
          </el-tag>
        </div>
        <p class="meta">
          班級：{{ classroomInfo?.name || '—' }}
          ｜ 生日：{{ (studentInfo as Record<string, unknown>)?.birthday || '—' }}
          ｜ 主要家長：{{ primaryGuardian?.name || '—' }}（{{ primaryGuardian?.phone_masked || '—' }}）
        </p>
        <div v-if="(healthInfo?.allergies as Record<string, unknown>[] | undefined)?.length" class="warn-row">
          ⚠ 過敏：
          <span v-for="a in (healthInfo?.allergies as Record<string, unknown>[])" :key="a.id as number" class="chip danger">
            {{ a.allergen }}（{{ a.severity }}）
          </span>
        </div>
        <div class="actions">
          <el-button @click="goObservation">新增觀察</el-button>
          <el-button :icon="Odometer" @click="openMeasurementSheet">記量測</el-button>
          <el-button :icon="Star" @click="openMilestoneSheet">記里程碑</el-button>
        </div>
      </div>

      <!-- Tabs -->
      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="健康" name="health">
          <div class="pt-card panel">
            <h4>過敏</h4>
            <p v-if="!(healthInfo?.allergies as Record<string, unknown>[] | undefined)?.length" class="empty">無紀錄</p>
            <ul v-else class="list">
              <li v-for="a in (healthInfo?.allergies as Record<string, unknown>[])" :key="a.id as number">
                <strong>{{ a.allergen }}</strong>（{{ a.severity }}）
                <span v-if="a.reaction" class="note">— {{ a.reaction }}</span>
                <p v-if="a.first_aid_note" class="aid">{{ a.first_aid_note }}</p>
              </li>
            </ul>

            <h4>用藥單（近 7 天）</h4>
            <p v-if="!(healthInfo?.recent_medication_orders as Record<string, unknown>[] | undefined)?.length" class="empty">無紀錄</p>
            <ul v-else class="list">
              <li v-for="o in (healthInfo?.recent_medication_orders as Record<string, unknown>[])" :key="o.id as number">
                <strong>{{ o.order_date }}</strong> · {{ o.medication_name }} · {{ o.dose }}
                ｜ 時段：{{ ((o.time_slots as string[] | undefined) || []).join('、') }}
                <span class="source-tag">{{ o.source === 'parent' ? '家長' : '老師' }}</span>
              </li>
            </ul>

            <h4>特殊需求</h4>
            <p>{{ (studentInfo as Record<string, unknown>)?.special_needs || '無' }}</p>
          </div>
        </el-tab-pane>

        <el-tab-pane label="出席" name="attendance">
          <div class="pt-card panel">
            <h4>近 30 天統計</h4>
            <div class="stat-row">
              <span class="stat"><b>{{ (attendance30d?.summary as Record<string, unknown>)?.present }}</b> 出席</span>
              <span class="stat"><b>{{ (attendance30d?.summary as Record<string, unknown>)?.absent }}</b> 缺席</span>
              <span class="stat"><b>{{ (attendance30d?.summary as Record<string, unknown>)?.late }}</b> 遲到</span>
              <span class="stat"><b>{{ (attendance30d?.summary as Record<string, unknown>)?.leave }}</b> 請假</span>
            </div>
            <h4>每日明細</h4>
            <p v-if="!(attendance30d?.by_day as Record<string, unknown>[] | undefined)?.length" class="empty">無紀錄</p>
            <ul v-else class="list compact">
              <li v-for="d in (attendance30d?.by_day as Record<string, unknown>[])" :key="d.date as string">
                <span class="date">{{ d.date }}</span>
                <span :class="['status-tag', d.status]">{{ d.status }}</span>
                <span v-if="d.remark" class="note">— {{ d.remark }}</span>
              </li>
            </ul>
          </div>
        </el-tab-pane>

        <el-tab-pane label="觀察" name="observations">
          <div class="pt-card panel">
            <p v-if="!observations?.length" class="empty">
              近 30 天無觀察紀錄
            </p>
            <ul v-else class="list">
              <li v-for="o in observations" :key="o.id as number">
                <strong>{{ o.observation_date }}</strong>
                <span v-if="o.domain" class="domain-tag">{{ o.domain }}</span>
                <span v-if="o.is_highlight" class="highlight">✨ 成長亮點</span>
                <p>{{ o.narrative }}</p>
              </li>
            </ul>
          </div>
        </el-tab-pane>

        <el-tab-pane label="評量" name="assessments">
          <div class="pt-card panel">
            <p v-if="!assessments?.length" class="empty">無學期評量紀錄</p>
            <ul v-else class="list">
              <li v-for="a in assessments" :key="a.id as number">
                <strong>{{ a.semester }} {{ a.assessment_type }}</strong>
                <span v-if="a.domain" class="domain-tag">{{ a.domain }}</span>
                <span v-if="a.rating">：{{ a.rating }}</span>
                <span class="date">（{{ a.assessment_date }}）</span>
              </li>
            </ul>
          </div>
        </el-tab-pane>

        <el-tab-pane label="事件" name="incidents">
          <div class="pt-card panel">
            <p v-if="!incidents?.length" class="empty">
              近 30 天無事件紀錄
            </p>
            <ul v-else class="list">
              <li v-for="i in incidents" :key="i.id as number">
                <strong>{{ i.incident_date }}</strong>
                <span :class="['severity-tag', i.severity]">{{ i.type }}</span>
                <span v-if="i.severity">（{{ i.severity }}）</span>
                <p>{{ i.description }}</p>
              </li>
            </ul>
          </div>
        </el-tab-pane>

        <el-tab-pane label="聯絡簿" name="contact-book">
          <div class="pt-card panel">
            <p v-if="!contactBookRecent?.length" class="empty">無聯絡簿紀錄</p>
            <ul v-else class="list">
              <li v-for="c in contactBookRecent" :key="c.id as number">
                <strong>{{ c.log_date }}</strong>
                <span v-if="c.published_at" class="published-tag">已發布</span>
                <span v-else class="draft-tag">草稿</span>
                <span v-if="c.mood" class="mood">心情：{{ c.mood }}</span>
                <p v-if="c.teacher_note">{{ c.teacher_note }}</p>
              </li>
            </ul>
          </div>
        </el-tab-pane>

        <el-tab-pane label="家長" name="guardians">
          <div class="pt-card panel">
            <ul class="list">
              <li v-for="g in detail.guardians" :key="g.id">
                <strong>{{ g.name }}</strong>
                <span v-if="g.relation">（{{ g.relation }}）</span>
                <span v-if="g.is_primary" class="badge primary">主要</span>
                <span v-if="g.is_emergency" class="badge danger">緊急</span>
                <span v-if="g.can_pickup" class="badge ok">可接送</span>
                <p class="meta">電話：{{ g.phone_masked || '—' }} ｜ Email：{{ g.email || '—' }}</p>
                <p v-if="g.user_id" class="meta">user_id: {{ g.user_id }}</p>
              </li>
            </ul>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
  <PortalMeasurementSheet
    v-model="sheets.measurement"
    :student-id="studentId"
    :student-name="(studentInfo?.name as string | undefined) || ''"
  />
  <PortalMilestoneSheet
    v-model="sheets.milestone"
    :student-id="studentId"
    :student-name="(studentInfo?.name as string | undefined) || ''"
  />
</template>

<style scoped>
.student-detail { max-width: 1000px; margin: 0 auto; }

.loading { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-3); }
.skeleton-block { height: 120px; border-radius: var(--radius-md); }

.header {
  padding: var(--space-4);
  margin: var(--space-3) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.title-row h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--pt-text-strong);
}
.age { color: var(--pt-text-muted); font-size: var(--text-base); }

.meta {
  margin: 0;
  color: var(--pt-text-muted);
  font-size: var(--text-sm);
}

.warn-row {
  font-size: var(--text-sm);
  color: var(--color-danger);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.chip.danger {
  background: var(--color-danger-lighter);
  color: var(--color-danger);
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
}

.actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }

.detail-tabs { margin-top: var(--space-2); }

.panel {
  padding: var(--space-4);
  margin-top: var(--space-2);
}
.panel h4 {
  margin: var(--space-3) 0 var(--space-2);
  font-size: var(--text-base);
  color: var(--pt-text-strong);
}
.panel h4:first-child { margin-top: 0; }

.list { padding: 0; margin: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.list li {
  padding: var(--space-2) 0;
  border-bottom: var(--pt-hairline);
  font-size: var(--text-sm);
}
.list li:last-child { border-bottom: none; }
.list.compact li { padding: var(--space-1) 0; }
.note { color: var(--pt-text-muted); }
.aid { font-size: var(--text-xs); color: var(--color-warning); margin: 4px 0 0; }
.date { color: var(--pt-text-faint); margin-left: var(--space-2); }

.empty { color: var(--pt-text-muted); padding: var(--space-3) 0; }
.stat-row { display: flex; gap: var(--space-4); margin-bottom: var(--space-3); }
.stat b { font-size: var(--text-xl); color: var(--pt-text-strong); }

.status-tag, .severity-tag, .domain-tag, .source-tag, .badge, .published-tag, .draft-tag, .highlight, .mood {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  margin-left: var(--space-1);
}
.domain-tag { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }
.source-tag { background: var(--pt-surface-mute); color: var(--pt-text-muted); }
.published-tag { background: var(--color-success-lighter); color: var(--color-success); }
.draft-tag { background: var(--pt-surface-mute); color: var(--pt-text-muted); }
.highlight { background: var(--color-warning-lighter); color: var(--color-warning); }
.mood { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }

.status-tag.出席 { background: var(--color-success-lighter); color: var(--color-success); }
.status-tag.缺席 { background: var(--color-danger-lighter); color: var(--color-danger); }
.status-tag.遲到 { background: var(--color-warning-lighter); color: var(--color-warning); }
.status-tag.病假, .status-tag.事假 { background: var(--pt-surface-mute); color: var(--pt-text-muted); }

.severity-tag.嚴重 { background: var(--color-danger-lighter); color: var(--color-danger); }
.severity-tag.中度 { background: var(--color-warning-lighter); color: var(--color-warning); }

.badge.primary { background: var(--color-primary-lighter); color: var(--color-primary); }
.badge.danger { background: var(--color-danger-lighter); color: var(--color-danger); }
.badge.ok { background: var(--color-success-lighter); color: var(--color-success); }
</style>
