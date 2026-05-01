<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getChildProfile } from '../api/profile'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const data = ref(null)
const loading = ref(false)

const SEVERITY_LABEL = { mild: '輕度', moderate: '中度', severe: '嚴重' }
const SEVERITY_COLOR = {
  mild: { bg: '#fef3c7', color: '#92400e' },
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
    <div v-if="loading && !data" class="state">載入中…</div>

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
          📩 開啟訊息聯絡導師
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
.state {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}
.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.head {
  margin-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 12px;
}
.name {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
}
.sub {
  margin-top: 4px;
  font-size: 13px;
  color: #888;
}
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 14px;
  color: #2c3e50;
}
.row .label {
  width: 56px;
  color: #888;
  flex-shrink: 0;
}
.teachers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.teacher-tag {
  font-size: 13px;
  color: #555;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #555;
  margin: 0 0 10px;
}
.empty {
  color: #888;
  font-size: 13px;
  padding: 6px 0;
}
.guardian-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid #f3f4f6;
}
.guardian-row:first-of-type {
  border-top: none;
}
.guardian-name {
  font-weight: 600;
  color: #2c3e50;
}
.guardian-rel {
  color: #888;
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
  background: #f0f2f5;
  color: #666;
}
.tag.self {
  background: #dbeafe;
  color: #1d4ed8;
}
.tag.primary {
  background: #dcfce7;
  color: #166534;
}
.tag.pickup {
  background: #fef3c7;
  color: #92400e;
}
.allergy-row {
  padding: 8px 0;
  border-top: 1px solid #f3f4f6;
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
  color: #2c3e50;
}
.severity {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.allergy-text {
  margin-top: 4px;
  font-size: 13px;
  color: #555;
}
.change-card {
  background: #fffbeb;
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
  background: #d97706;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}
</style>
