<template>
  <div class="ivy-competition">
    <div v-if="loading" class="ivy-loading">載入競爭分析中…</div>
    <div v-else-if="!campuses.length" class="ivy-loading">尚無常春藤校區資料</div>
    <template v-else>
      <div
        v-for="campus in campuses"
        :key="campus.school_name"
        class="campus-block"
      >
        <div class="campus-header">
          <div class="campus-name">{{ shortName(campus.school_name) }}</div>
          <div class="campus-meta">
            <span>{{ campus.district }}</span>
            <span v-if="campus.approved_capacity">核定 {{ campus.approved_capacity }} 人</span>
            <span v-if="campus.monthly_fee">月費 ${{ campus.monthly_fee.toLocaleString() }}</span>
          </div>
        </div>

        <div class="rings-row">
          <div
            v-for="(ring, label) in campus.rings"
            :key="label"
            class="ring-card"
          >
            <div class="ring-label">{{ label }} 以內</div>
            <div class="ring-total">
              <span class="ring-total-val">{{ ring.total }}</span>
              <span class="ring-total-unit">間</span>
              <span class="ring-capacity">容量 {{ ring.total_capacity.toLocaleString() }}</span>
            </div>

            <div class="type-list">
              <div
                v-for="t in ring.types"
                :key="t.type"
                class="type-row"
              >
                <span class="type-dot" :style="{ background: typeColor(t.type) }" />
                <span class="type-name">{{ t.type }}</span>
                <span class="type-count">{{ t.count }}</span>
                <span class="type-detail">
                  <template v-if="t.avg_fee">~${{ t.avg_fee.toLocaleString() }}</template>
                  <template v-else>—</template>
                </span>
                <span v-if="t.penalty_count" class="type-penalty">{{ t.penalty_count }} 裁罰</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getCampusCompetition } from '@/api/recruitment'

const loading = ref(true)
const campuses = ref([])

const TYPE_COLORS = {
  '常春藤': '#0f7b52',
  '公立': '#eab308',
  '非營利': '#7c3aed',
  '準公共': '#d97706',
  '私立': '#2563eb',
}

const typeColor = (type) => TYPE_COLORS[type] || '#64748b'

const shortName = (name) =>
  name.replace('高雄市私立', '').replace('幼兒園', '')

onMounted(async () => {
  try {
    const res = await getCampusCompetition()
    campuses.value = res.data?.campuses || []
  } catch {
    // 靜默
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ivy-competition {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ivy-loading {
  text-align: center;
  padding: 20px;
  font-size: 0.82rem;
  color: #94A3B8;
}

.campus-block {
  border: 1px solid #E2E8F0;
  border-left: 4px solid #0f7b52;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
}

.campus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.campus-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f7b52;
}

.campus-meta {
  display: flex;
  gap: 8px;
  font-size: 0.72rem;
  color: #64748B;
}

.rings-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 600px) {
  .rings-row { grid-template-columns: 1fr; }
}

.ring-card {
  border: 1px solid #F1F5F9;
  border-radius: 8px;
  padding: 10px;
  background: #FAFBFC;
}

.ring-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.ring-total {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
}

.ring-total-val {
  font-size: 1.3rem;
  font-weight: 700;
  color: #1E293B;
  font-family: 'Fira Code', ui-monospace, monospace;
}

.ring-total-unit {
  font-size: 0.75rem;
  color: #64748B;
}

.ring-capacity {
  margin-left: auto;
  font-size: 0.72rem;
  color: #94A3B8;
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.type-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}

.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.type-name {
  color: #475569;
  font-weight: 600;
  min-width: 42px;
}

.type-count {
  font-weight: 700;
  color: #1E293B;
  font-family: 'Fira Code', ui-monospace, monospace;
  min-width: 24px;
  text-align: right;
}

.type-detail {
  color: #94A3B8;
  font-size: 0.68rem;
  min-width: 60px;
}

.type-penalty {
  font-size: 0.65rem;
  color: #DC2626;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  padding: 0 4px;
  border-radius: 4px;
  margin-left: auto;
}
</style>
