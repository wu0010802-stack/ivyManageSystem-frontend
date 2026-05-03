<script setup>
import { computed, ref, watch } from 'vue'
import { ElDrawer, ElTabs, ElTabPane, ElTag, ElEmpty, ElMessage } from 'element-plus'
import { View, Hide } from '@element-plus/icons-vue'
import { usePortalStudent } from '@/composables/usePortalStudent'
import { apiError } from '@/utils/error'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  studentId: { type: [Number, null], default: null },
})
const emit = defineEmits(['update:modelValue'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const {
  detail,
  loading,
  isRevealing,
  loadDetail,
  revealPhone,
  getRevealedPhone,
  reset,
} = usePortalStudent()

const activeTab = ref('basic')

watch(
  () => [props.modelValue, props.studentId],
  async ([isOpen, sid]) => {
    if (isOpen && sid) {
      activeTab.value = 'basic'
      try {
        await loadDetail(sid)
      } catch (e) {
        ElMessage.error(apiError(e, '載入學生資料失敗'))
        open.value = false
      }
    } else if (!isOpen) {
      // 抽屜關閉 → 清空（含已揭露電話）
      reset()
    }
  },
  { immediate: true },
)

const student = computed(() => detail.value?.student ?? {})
const classroom = computed(() => detail.value?.classroom ?? null)
const guardians = computed(() => detail.value?.guardians ?? [])
const health = computed(() => detail.value?.health ?? { allergies: [], recent_medication_orders: [] })
const attendanceMonth = computed(() => detail.value?.attendance_this_month ?? {})
const attendance30d = computed(() => detail.value?.attendance_30d?.summary ?? {})
const transferHistory = computed(() => detail.value?.transfer_history ?? [])

const ageLabel = computed(() => {
  const b = student.value.birthday
  if (!b) return ''
  const birth = new Date(b)
  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  let months = today.getMonth() - birth.getMonth()
  if (months < 0) {
    years--
    months += 12
  }
  if (today.getDate() < birth.getDate()) {
    months--
    if (months < 0) {
      years--
      months += 12
    }
  }
  return `${years}歲${months}個月`
})

function genderLabel(g) {
  if (g === 'M' || g === '男') return '男'
  if (g === 'F' || g === '女') return '女'
  return g || ''
}

function lifecycleLabel(s) {
  const map = { active: '在學', graduated: '畢業', withdrawn: '離校', transferred: '轉學' }
  return map[s] || s || '—'
}

function severityLabel(s) {
  return { mild: '輕', moderate: '中', severe: '重' }[s] || s
}

async function onRevealPhone(target, guardianId = null) {
  try {
    await revealPhone({ studentId: props.studentId, target, guardianId })
  } catch (e) {
    ElMessage.error(apiError(e, '揭露失敗'))
  }
}

function displayedPhone({ masked, target, guardianId = null }) {
  return getRevealedPhone(target, guardianId) || masked || '—'
}
function isRevealed(target, guardianId = null) {
  return Boolean(getRevealedPhone(target, guardianId))
}
</script>

<template>
  <el-drawer
    v-model="open"
    :size="'min(720px, 100%)'"
    :with-header="false"
    :destroy-on-close="false"
  >
    <div v-loading="loading" class="psd">
      <header class="psd-header">
        <div class="psd-title">
          <span class="psd-name">{{ student.name || '—' }}</span>
          <el-tag v-if="student.gender" size="small" type="info">{{ genderLabel(student.gender) }}</el-tag>
          <el-tag v-if="student.lifecycle_status" size="small" type="success">{{ lifecycleLabel(student.lifecycle_status) }}</el-tag>
        </div>
        <div class="psd-meta">
          <span>學號 {{ student.student_id || '—' }}</span>
          <span v-if="ageLabel">・{{ ageLabel }}</span>
          <span v-if="classroom">・{{ classroom.name }}</span>
          <span v-if="classroom?.viewer_role" class="muted">（{{ classroom.viewer_role }}）</span>
        </div>
        <div class="psd-stats">
          <div class="stat">
            <div class="stat-value">{{ attendanceMonth.rate ?? '—' }}<span v-if="attendanceMonth.rate != null">%</span></div>
            <div class="stat-label">本月出席率</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ attendance30d.absent ?? 0 }}</div>
            <div class="stat-label">30 天缺席</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ health.allergies.length || 0 }}</div>
            <div class="stat-label">過敏項</div>
          </div>
        </div>
      </header>

      <el-tabs v-model="activeTab" class="psd-tabs">
        <el-tab-pane label="基本" name="basic">
          <ul class="psd-list">
            <li><span class="k">生日</span><span>{{ student.birthday || '—' }}</span></li>
            <li><span class="k">入學日</span><span>{{ student.enrollment_date || '—' }}</span></li>
            <li>
              <span class="k">家長</span>
              <span class="phone-row">
                <span>{{ student.parent_name || '—' }}</span>
                <template v-if="student.parent_phone_masked">
                  ・
                  <span :class="{ revealed: isRevealed('parent') }">
                    {{ displayedPhone({ masked: student.parent_phone_masked, target: 'parent' }) }}
                  </span>
                  <button
                    v-if="!isRevealed('parent')"
                    class="reveal-btn"
                    :disabled="isRevealing"
                    @click="onRevealPhone('parent')"
                  >
                    <el-icon><View /></el-icon>顯示
                  </button>
                  <span v-else class="revealed-tag">
                    <el-icon><Hide /></el-icon>已揭露
                  </span>
                </template>
              </span>
            </li>
            <li v-if="student.notes">
              <span class="k">備註</span>
              <span class="notes">{{ student.notes }}</span>
            </li>
          </ul>
        </el-tab-pane>

        <el-tab-pane label="健康" name="health">
          <div v-if="!health.allergies.length && !health.recent_medication_orders.length && !student.special_needs" class="empty">
            <el-empty description="無健康警告" :image-size="80" />
          </div>
          <template v-else>
            <div v-if="student.special_needs" class="psd-section">
              <div class="psd-section-title">特殊需求</div>
              <p>{{ student.special_needs }}</p>
            </div>
            <div v-if="health.allergies.length" class="psd-section">
              <div class="psd-section-title">過敏</div>
              <ul class="bullet">
                <li v-for="a in health.allergies" :key="a.id">
                  <strong>{{ a.allergen }}</strong>
                  <el-tag v-if="a.severity" size="small" effect="plain">
                    {{ severityLabel(a.severity) }}
                  </el-tag>
                  <span v-if="a.reaction" class="muted">— {{ a.reaction }}</span>
                </li>
              </ul>
            </div>
            <div v-if="health.recent_medication_orders.length" class="psd-section">
              <div class="psd-section-title">近 7 天用藥單</div>
              <ul class="bullet">
                <li v-for="o in health.recent_medication_orders" :key="o.id">
                  <strong>{{ o.medication_name }}</strong>
                  <span class="muted">{{ o.dose }} ・ {{ o.order_date }}</span>
                </li>
              </ul>
            </div>
          </template>
        </el-tab-pane>

        <el-tab-pane label="監護人" name="guardians">
          <div v-if="!guardians.length" class="empty">
            <el-empty description="尚無監護人資料" :image-size="80" />
          </div>
          <ul class="psd-cards">
            <li v-for="g in guardians" :key="g.id" class="psd-card">
              <div class="psd-card-head">
                <strong>{{ g.name }}</strong>
                <span class="muted">{{ g.relation || '—' }}</span>
                <el-tag v-if="g.is_primary" size="small" type="success">主聯絡</el-tag>
                <el-tag v-if="g.is_emergency" size="small" type="danger">緊急</el-tag>
                <el-tag v-if="g.can_pickup" size="small" type="info">可接送</el-tag>
              </div>
              <div class="psd-card-row">
                <span class="phone-row">
                  <span :class="{ revealed: isRevealed('guardian', g.id) }">
                    {{ displayedPhone({ masked: g.phone_masked, target: 'guardian', guardianId: g.id }) }}
                  </span>
                  <button
                    v-if="g.phone_masked && !isRevealed('guardian', g.id)"
                    class="reveal-btn"
                    :disabled="isRevealing"
                    @click="onRevealPhone('guardian', g.id)"
                  >
                    <el-icon><View /></el-icon>顯示
                  </button>
                  <span v-else-if="g.phone_masked" class="revealed-tag">
                    <el-icon><Hide /></el-icon>已揭露
                  </span>
                </span>
              </div>
              <div v-if="g.email" class="muted small">{{ g.email }}</div>
            </li>

            <li v-if="student.emergency_contact_name" class="psd-card emergency">
              <div class="psd-card-head">
                <strong>{{ student.emergency_contact_name }}</strong>
                <span class="muted">{{ student.emergency_contact_relation || '緊急聯絡人' }}</span>
                <el-tag size="small" type="danger">緊急</el-tag>
              </div>
              <div class="psd-card-row">
                <span class="phone-row">
                  <span :class="{ revealed: isRevealed('emergency') }">
                    {{ displayedPhone({ masked: student.emergency_contact_phone_masked, target: 'emergency' }) }}
                  </span>
                  <button
                    v-if="student.emergency_contact_phone_masked && !isRevealed('emergency')"
                    class="reveal-btn"
                    :disabled="isRevealing"
                    @click="onRevealPhone('emergency')"
                  >
                    <el-icon><View /></el-icon>顯示
                  </button>
                  <span v-else-if="student.emergency_contact_phone_masked" class="revealed-tag">
                    <el-icon><Hide /></el-icon>已揭露
                  </span>
                </span>
              </div>
            </li>
          </ul>
        </el-tab-pane>

        <el-tab-pane label="出席" name="attendance">
          <ul class="psd-list">
            <li><span class="k">本月出席率</span><span>{{ attendanceMonth.rate ?? '—' }}<span v-if="attendanceMonth.rate != null">%</span></span></li>
            <li><span class="k">最近缺席日</span><span>{{ attendanceMonth.last_absent_date || '—' }}</span></li>
            <li><span class="k">30 天出席</span><span>{{ attendance30d.present ?? 0 }} 天</span></li>
            <li><span class="k">30 天缺席</span><span>{{ attendance30d.absent ?? 0 }} 天</span></li>
            <li><span class="k">30 天請假</span><span>{{ attendance30d.leave ?? 0 }} 天</span></li>
            <li><span class="k">30 天遲到</span><span>{{ attendance30d.late ?? 0 }} 次</span></li>
          </ul>
        </el-tab-pane>

        <el-tab-pane label="轉班" name="transfers">
          <div v-if="!transferHistory.length" class="empty">
            <el-empty description="本生未在您管轄班級內有轉班紀錄" :image-size="80" />
          </div>
          <ul class="psd-timeline">
            <li v-for="t in transferHistory" :key="t.transferred_at">
              <span class="dot" />
              <div>
                <strong>{{ (t.transferred_at || '').slice(0, 10) }}</strong>
                <div class="muted small">
                  {{ t.from_classroom_name || '初次分班' }} → {{ t.to_classroom_name || '—' }}
                </div>
              </div>
            </li>
          </ul>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-drawer>
</template>

<style scoped>
.psd {
  padding: 0 var(--space-4) var(--space-6);
  min-height: 100%;
}
.psd-header {
  padding: var(--space-5) 0 var(--space-3);
  border-bottom: 1px solid var(--border-color, #eef0f3);
}
.psd-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.psd-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}
.psd-meta {
  margin-top: 4px;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}
.psd-meta .muted {
  color: var(--text-tertiary, #9ca3af);
}
.psd-stats {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}
.stat {
  background: var(--color-fill-light, #f7f8fa);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary, #16a34a);
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.psd-tabs {
  margin-top: var(--space-3);
}
.psd-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.psd-list > li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color-light, #f0f2f5);
}
.psd-list .k {
  width: 90px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.notes {
  white-space: pre-wrap;
}
.phone-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.phone-row .revealed {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-primary);
}
.reveal-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
}
.reveal-btn:hover {
  background: var(--color-fill-lighter, #fafbfc);
}
.reveal-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.revealed-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-success, #16a34a);
}
.psd-section {
  margin-top: var(--space-4);
}
.psd-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.bullet {
  list-style: disc inside;
  margin: 0;
  padding: 0;
}
.bullet li {
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.psd-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
.psd-card {
  background: var(--color-fill-light, #f7f8fa);
  border-radius: 12px;
  padding: 12px;
}
.psd-card.emergency {
  background: var(--color-danger-soft, #fff1f2);
}
.psd-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.psd-card-row {
  font-size: 14px;
}
.muted {
  color: var(--text-secondary, #6b7280);
}
.small {
  font-size: 12px;
  margin-top: 2px;
}
.psd-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.psd-timeline > li {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  align-items: flex-start;
}
.psd-timeline .dot {
  width: 8px;
  height: 8px;
  margin-top: 8px;
  background: var(--color-primary, #16a34a);
  border-radius: 50%;
  flex-shrink: 0;
}
.empty {
  padding: 20px 0;
}
</style>
