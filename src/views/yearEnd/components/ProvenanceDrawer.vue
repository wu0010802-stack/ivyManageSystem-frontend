<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElDrawer, ElTag, ElSkeleton, ElEmpty, ElButton } from 'element-plus'
import { getProvenance } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import type { DerivedValue } from '@/types/provenance'

// ─────────────────────────────────────────
// Props / Emits
// ─────────────────────────────────────────

export interface ProvenanceKey {
  key: string
  label: string
}

const props = defineProps<{
  modelValue: boolean
  cycleId: number
  employeeId: number
  provenanceKeys: ProvenanceKey[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

// ─────────────────────────────────────────
// v-model 計算屬性
// ─────────────────────────────────────────

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

// ─────────────────────────────────────────
// 資料狀態（每個 key 獨立）
// ─────────────────────────────────────────

interface SectionState {
  key: string
  label: string
  loading: boolean
  data: DerivedValue | null
  error: string | null
}

const sections = ref<SectionState[]>([])

function initSections() {
  sections.value = props.provenanceKeys.map((pk) => ({
    key: pk.key,
    label: pk.label,
    loading: true,
    data: null,
    error: null,
  }))
}

async function fetchAll() {
  initSections()
  const results = await Promise.allSettled(
    props.provenanceKeys.map((pk) =>
      getProvenance(pk.key, props.cycleId, props.employeeId),
    ),
  )
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      sections.value[idx].data = result.value.data
      sections.value[idx].error = null
    } else {
      sections.value[idx].error = apiError(result.reason, '載入失敗')
    }
    sections.value[idx].loading = false
  })
}

watch(
  [() => visible.value, () => props.employeeId, () => props.cycleId],
  ([v]) => {
    if (v) fetchAll()
  },
  { immediate: true },
)
// 註: immediate + `if (v)` 守衛 → 關閉狀態(modelValue=false)的 immediate 觸發被擋，不會多抓

// ─────────────────────────────────────────
// deep_link 跳轉
// ─────────────────────────────────────────

const router = useRouter()

function goDeepLink(link: string) {
  router.push(link)
}

// ─────────────────────────────────────────
// 格式化金額
// ─────────────────────────────────────────

function formatAmount(amount: string): string {
  const n = Number(amount)
  return isNaN(n) ? amount : n.toLocaleString()
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="扣項來源明細"
    direction="rtl"
    size="480px"
  >
    <div
      v-for="section in sections"
      :key="section.key"
      class="provenance-section"
    >
      <div class="section-header">
        <span class="section-label">{{ section.label }}</span>
        <el-tag v-if="section.data?.is_override" size="small" type="warning">
          手動覆寫
        </el-tag>
      </div>

      <!-- 載入中 -->
      <el-skeleton v-if="section.loading" :rows="3" animated />

      <!-- 錯誤 -->
      <div v-else-if="section.error" class="section-error">
        {{ section.error }}
      </div>

      <!-- 無資料 -->
      <el-empty
        v-else-if="!section.data || section.data.source_records.length === 0"
        description="無紀錄"
        :image-size="40"
      />

      <!-- 資料 -->
      <div v-else class="section-body">
        <div class="formula-summary">{{ section.data.formula_summary }}</div>

        <ul class="record-list">
          <li
            v-for="(rec, idx) in section.data.source_records"
            :key="idx"
            class="record-item"
          >
            <span class="rec-date">{{ rec.date }}</span>
            <span class="rec-label">{{ rec.label }}</span>
            <span class="rec-amount">－{{ formatAmount(rec.amount) }}</span>
          </li>
        </ul>

        <div v-if="section.data.deep_link" class="deep-link">
          <el-button
            type="primary"
            link
            size="small"
            @click="goDeepLink(section.data!.deep_link!)"
          >
            在來源模組查看 →
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.provenance-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f0f0f0;
}
.provenance-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.section-label {
  font-weight: 600;
  font-size: 14px;
}

.section-error {
  color: #f56c6c;
  font-size: 13px;
  padding: 8px 0;
}

.formula-summary {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.record-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.record-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 13px;
}
.record-item:last-child {
  border-bottom: none;
}
.rec-date {
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
}
.rec-label {
  flex: 1;
  color: #303133;
}
.rec-amount {
  font-weight: 600;
  color: #f56c6c;
  white-space: nowrap;
}

.deep-link {
  margin-top: 10px;
}
</style>
