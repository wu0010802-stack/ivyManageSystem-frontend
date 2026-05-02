<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getChildProfile } from '../api/profile'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const data = ref(null)
const loading = ref(false)

const SEVERITY_LABEL = { mild: '輕度', moderate: '中度', severe: '嚴重' }
const SEVERITY_COLOR = {
  mild: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text)' },
  moderate: { bg: '#fed7aa', color: '#9a3412' },
  severe: { bg: '#fecaca', color: '#991b1b' },
}

async function fetchData() {
  if (!studentId.value) return
  loading.value = true
  try {
    const { data: d } = await getChildProfile(studentId.value)
    data.value = d
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function goMessages() {
  // 把建議文字塞到 sessionStorage，MessagesView 進去後可預填（若未實作 prefill 也只是個無害值）
  try {
    sessionStorage.setItem(
      'parent_message_prefill',
      `想反應 ${data.value?.student?.name || '孩子'} 的資料修改，內容：`,
    )
  } catch {
    /* ignore */
  }
  router.push('/messages')
}

onMounted(fetchData)
</script>

<template>
  <div class="profile-view">
    <template v-if="loading && !data">
      <SkeletonBlock variant="card" :count="2" />
    </template>

    <template v-else-if="data">
      <section class="card">
        <div class="head">
          <div class="name">{{ data.student.name }}</div>
          <div class="sub">
            學號 {{ data.student.student_no || '—' }}
            <span v-if="data.student.gender">・{{ data.student.gender }}</span>
            <span v-if="data.student.birthday">・{{ data.student.birthday }}</span>
          </div>
        </div>
        <div class="row">
          <span class="label">班級</span>
          <span>{{ data.classroom?.name || '未分班' }}</span>
        </div>
        <div v-if="data.teachers.length" class="row">
          <span class="label">老師</span>
          <span class="teachers">
            <span v-for="t in data.teachers" :key="t.role" class="teacher-tag">
              {{ t.label }}：{{ t.name || '—' }}
            </span>
          </span>
        </div>
      </section>

      <section class="card">
        <h3 class="section-title">監護人 / 接送人</h3>
        <div v-if="!data.guardians.length" class="empty">尚未登記</div>
        <div v-for="g in data.guardians" :key="g.id" class="guardian-row">
          <div>
            <span class="guardian-name">{{ g.name }}</span>
            <span v-if="g.relation" class="guardian-rel">（{{ g.relation }}）</span>
          </div>
          <div class="guardian-tags">
            <span v-if="g.is_self" class="tag self">您本人</span>
            <span v-if="g.is_primary" class="tag primary">主要聯絡</span>
            <span v-if="g.can_pickup" class="tag pickup">可接送</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h3 class="section-title">過敏 / 用藥提醒</h3>
        <div v-if="!data.allergies.length" class="empty">尚未登記</div>
        <div
          v-for="a in data.allergies"
          :key="a.id"
          class="allergy-row"
        >
          <div class="allergy-head">
            <span class="allergen">{{ a.allergen }}</span>
            <span
              class="severity"
              :style="{
                background: SEVERITY_COLOR[a.severity]?.bg,
                color: SEVERITY_COLOR[a.severity]?.color,
              }"
            >{{ SEVERITY_LABEL[a.severity] || a.severity }}</span>
          </div>
          <div v-if="a.reaction_symptom" class="allergy-text">症狀：{{ a.reaction_symptom }}</div>
          <div v-if="a.first_aid_note" class="allergy-text">處置：{{ a.first_aid_note }}</div>
        </div>
      </section>

      <!-- 修改申請：走訊息給導師，不直接寫 DB -->
      <section class="card change-card">
        <h3 class="section-title">資料有誤？</h3>
        <p class="change-text">
          孩子個人資料、過敏資訊、接送人資訊如有錯誤或變更，請透過訊息聯絡導師處理；
          不會在此頁直接修改，以確保校方記錄一致。
        </p>
        <button class="primary-btn" type="button" @click="goMessages">
          <ParentIcon name="envelope" size="sm" />
          開啟訊息聯絡導師
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.head {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--pt-border-light);
  padding-bottom: 12px;
}
.name {
  font-size: 20px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--pt-text-placeholder);
}
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--pt-text-strong);
}
.row .label {
  width: 56px;
  color: var(--pt-text-placeholder);
  flex-shrink: 0;
}
.teachers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.teacher-tag {
  font-size: 13px;
  color: var(--pt-text-muted);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pt-text-muted);
  margin: 0 0 10px;
}
.empty {
  color: var(--pt-text-placeholder);
  font-size: 13px;
  padding: 6px 0;
}
.guardian-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute-warm);
}
.guardian-row:first-of-type {
  border-top: none;
}
.guardian-name {
  font-weight: 600;
  color: var(--pt-text-strong);
}
.guardian-rel {
  color: var(--pt-text-placeholder);
  font-size: 13px;
}
.guardian-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--pt-surface-mute);
  color: var(--pt-text-soft);
}
.tag.self {
  background: var(--color-info-soft);
  color: var(--pt-info-text);
}
.tag.primary {
  background: var(--color-success-soft);
  color: var(--pt-success-text);
}
.tag.pickup {
  background: var(--color-warning-soft);
  color: var(--pt-warning-text);
}
.allergy-row {
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute-warm);
}
.allergy-row:first-of-type {
  border-top: none;
}
.allergy-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.allergen {
  font-weight: 600;
  color: var(--pt-text-strong);
}
.severity {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.allergy-text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--pt-text-muted);
}
.change-card {
  background: var(--neutral-0)eb;
  border: 1px solid #fbbf24;
}
.change-text {
  font-size: 13px;
  color: #78350f;
  margin: 0 0 10px;
  line-height: 1.5;
}
.primary-btn {
  width: 100%;
  padding: 10px;
  background: var(--pt-warning-text-mid);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
