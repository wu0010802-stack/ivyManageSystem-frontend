<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMyStudents } from '@/api/portal'
import { listObservations, createObservation } from '@/api/portalObservations'
import { usePortalFromHub } from '@/composables/usePortalFromHub'

const route = useRoute()
const { fromHub, backToHub } = usePortalFromHub()

// 7 領域對齊台灣課綱（後端 StudentObservation.domain）
const DOMAINS = [
  { value: '身體動作與健康', short: '動作' },
  { value: '語文', short: '語文' },
  { value: '認知', short: '認知' },
  { value: '社會', short: '社會' },
  { value: '情緒', short: '情緒' },
  { value: '美感', short: '美感' },
  { value: '綜合', short: '綜合' },
]

const classrooms = ref([])
const allStudents = ref([])
const studentId = ref(null)
const lockedStudent = ref(false) // 從學生個案頁進入時鎖定

const today = new Date().toISOString().slice(0, 10)
const formDate = ref(today)
const formDomain = ref(null)
const formNarrative = ref('')
const formIsHighlight = ref(false)
const formRating = ref(null)

const recent = ref([])
const loadingRecent = ref(false)
const submitting = ref(false)

async function loadStudents() {
  try {
    const { data } = await getMyStudents()
    classrooms.value = data?.classrooms || []
    allStudents.value = (data?.classrooms || []).flatMap((c) =>
      (c.students || []).map((s) => ({
        id: s.id,
        name: s.name,
        classroom_name: c.classroom_name,
      })),
    )
  } catch (e) {
    ElMessage.error('讀取學生失敗')
  }
}

async function loadRecent() {
  if (!studentId.value) {
    recent.value = []
    return
  }
  loadingRecent.value = true
  try {
    const from = new Date()
    from.setDate(from.getDate() - 7)
    const fromStr = from.toISOString().slice(0, 10)
    const { data } = await listObservations(studentId.value, {
      from: fromStr,
      to: today,
    })
    recent.value = data?.items || data || []
  } catch (e) {
    recent.value = []
  } finally {
    loadingRecent.value = false
  }
}

onMounted(async () => {
  await loadStudents()
  // 若從學生個案頁帶入 student_id，鎖定
  const sid = route.query.student_id
  if (sid) {
    studentId.value = Number(sid)
    lockedStudent.value = true
  }
  await loadRecent()
})

watch(studentId, loadRecent)

const selectedStudent = computed(() => allStudents.value.find((s) => s.id === studentId.value))

async function submit() {
  if (!studentId.value || !formDomain.value || !formNarrative.value.trim()) {
    ElMessage.warning('請填寫學生、領域與觀察內容')
    return
  }
  submitting.value = true
  try {
    await createObservation(studentId.value, {
      observation_date: formDate.value,
      domain: formDomain.value,
      narrative: formNarrative.value.trim(),
      is_highlight: formIsHighlight.value,
      rating: formRating.value,
    })
    ElMessage.success('已記錄')
    formNarrative.value = ''
    formIsHighlight.value = false
    formRating.value = null
    await loadRecent()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '送出失敗')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="obs-view">
    <div v-if="fromHub" class="from-hub-bar">
      <el-button type="primary" link @click="backToHub">
        ← 返回今日工作台
      </el-button>
    </div>
    <header class="page-header">
      <h2>課堂觀察 / 成長紀錄</h2>
    </header>

    <!-- 快速記錄表單 -->
    <div class="pt-card form-card">
      <h3>記錄新觀察</h3>
      <el-form label-width="80px" :inline="false">
        <el-form-item label="學生">
          <el-select
            v-model="studentId"
            filterable
            placeholder="選擇學生"
            :disabled="lockedStudent"
            style="width: 320px"
          >
            <el-option
              v-for="s in allStudents"
              :key="s.id"
              :label="`${s.name}（${s.classroom_name}）`"
              :value="s.id"
            />
          </el-select>
          <span v-if="lockedStudent" class="lock-hint">已鎖定</span>
        </el-form-item>

        <el-form-item label="日期">
          <el-date-picker v-model="formDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>

        <el-form-item label="領域">
          <div class="domain-chips">
            <button
              v-for="d in DOMAINS"
              :key="d.value"
              type="button"
              class="chip-btn"
              :class="{ active: formDomain === d.value }"
              @click="formDomain = d.value"
            >
              {{ d.short }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="評分">
          <el-rate v-model="formRating" :max="5" allow-half clearable />
          <span class="hint">（選填）</span>
        </el-form-item>

        <el-form-item label="觀察內容">
          <el-input
            v-model="formNarrative"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="今日這位學生的觀察…（最多 2000 字）"
          />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="formIsHighlight">標記為成長亮點 ✨</el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">送出</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Timeline -->
    <div v-if="studentId" class="pt-card timeline-card">
      <h3>{{ selectedStudent?.name }} — 近 7 天觀察</h3>
      <p v-if="loadingRecent" class="empty">讀取中…</p>
      <p v-else-if="!recent.length" class="empty">尚無紀錄</p>
      <ul v-else class="timeline">
        <li v-for="o in recent" :key="o.id">
          <strong>{{ o.observation_date }}</strong>
          <span v-if="o.domain" class="domain-tag">{{ o.domain }}</span>
          <span v-if="o.is_highlight" class="hl">✨</span>
          <p>{{ o.narrative }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.obs-view { max-width: 800px; margin: 0 auto; }
.from-hub-bar {
  margin: 0 0 12px;
  padding: 4px 0;
}
.page-header { margin-bottom: var(--space-3); }
.page-header h2 { margin: 0; color: var(--pt-text-strong); }

.form-card, .timeline-card {
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.form-card h3, .timeline-card h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  color: var(--pt-text-strong);
}

.domain-chips {
  display: flex; gap: var(--space-2); flex-wrap: wrap;
}
.chip-btn {
  padding: 4px var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--pt-border);
  background: var(--pt-surface-card);
  cursor: pointer;
  font-size: var(--text-sm);
}
.chip-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.hint, .lock-hint {
  margin-left: var(--space-2);
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
}

.timeline { padding: 0; margin: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
.timeline li {
  padding: var(--space-2) 0;
  border-bottom: var(--pt-hairline);
}
.timeline li:last-child { border-bottom: none; }
.domain-tag {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  background: var(--pt-tint-event);
  color: var(--pt-tint-event-fg);
}
.hl {
  margin-left: var(--space-1);
  color: var(--color-warning);
}
.empty {
  text-align: center;
  color: var(--pt-text-muted);
  padding: var(--space-4) 0;
}
</style>
