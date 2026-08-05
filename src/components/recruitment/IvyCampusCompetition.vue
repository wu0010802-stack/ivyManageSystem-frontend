<template>
  <div class="ivy-competition">
    <div v-if="loading" class="ivy-loading">載入競爭分析中…</div>
    <div v-else-if="!campuses.length" class="ivy-loading">尚無{{ branding.short_name }}校區資料</div>
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
              <span class="ring-capacity">容量 {{ (ring.total_capacity ?? 0).toLocaleString() }}</span>
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

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCampusCompetition } from '@/api/recruitment'
import { OWN_BRAND_FILL } from '@/utils/recruitmentSchoolType'
import { useTenantBranding } from '@/composables/useTenantBranding'

const { branding } = useTenantBranding()

interface SchoolType { type?: string; count?: number; avg_fee?: number | null; penalty_count?: number }
interface Ring { total?: number; total_capacity?: number; types?: SchoolType[] }
interface Campus {
  school_name?: string
  district?: string
  approved_capacity?: number | null
  monthly_fee?: number | null
  rings?: Record<string, Ring>
}

const loading = ref<boolean>(true)
const campuses = ref<Campus[]>([])

// ⚠ 這裡的 key 來源與 recruitmentSchoolType.ts 不同：`t.type` 是**後端**回傳的
// 分類字面（api/recruitment 的競爭分析），不是前端 getSchoolType() 的內部 key。
// 因此自家品牌那格改用 per-tenant 的短名當 key（預設 '常春藤'，單租戶行為不變），
// 其餘四類是政府登錄的固定字面，不 per-tenant。
// TODO(4d/be)：後端「招生 '%常春藤%' 查詢改機制」落地後，這裡應改吃後端回的穩定 key。
const STATIC_TYPE_COLORS: Record<string, string> = {
  '公立': '#eab308',
  '非營利': '#7c3aed',
  '準公共': '#d97706',
  '私立': '#2563eb',
}

const typeColor = (type: unknown) => {
  const key = String(type)
  if (key && key === branding.value.short_name) return OWN_BRAND_FILL
  return STATIC_TYPE_COLORS[key] || '#64748b'
}

// 校名裁字：拿掉縣市前綴與「幼兒園」尾綴，只留可辨識的校區名。
// 前綴改讀 per-tenant 的 org_prefix（原硬編 '高雄市私立'，scan-frontend GAP-12）；
// 缺值時不裁（寧可名字長一點，也不要裁錯別間園所的字）。
const shortName = (name: unknown) => {
  const raw = String(name || '')
  const prefix = branding.value.org_prefix
  return (prefix ? raw.replace(prefix, '') : raw).replace('幼兒園', '')
}

onMounted(async () => {
  try {
    const res = await getCampusCompetition()
    campuses.value = ((res.data as { campuses?: Campus[] })?.campuses || [])
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
  color: var(--text-tertiary);
}

.campus-block {
  border: 1px solid var(--border-color);
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
  color: var(--text-secondary);
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
  border: 1px solid var(--bg-color-soft);
  border-radius: 8px;
  padding: 10px;
  background: #fafbfc;
}

.ring-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--neutral-600);
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
  color: var(--text-primary);
  font-family: 'Fira Code', ui-monospace, monospace;
}

.ring-total-unit {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.ring-capacity {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--text-tertiary);
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
  color: var(--neutral-600);
  font-weight: 600;
  min-width: 42px;
}

.type-count {
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'Fira Code', ui-monospace, monospace;
  min-width: 24px;
  text-align: right;
}

.type-detail {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  min-width: 60px;
}

.type-penalty {
  font-size: 0.65rem;
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-soft);
  padding: 0 4px;
  border-radius: 4px;
  margin-left: auto;
}
</style>
