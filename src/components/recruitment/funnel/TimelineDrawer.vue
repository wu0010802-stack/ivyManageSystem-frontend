<template>
  <el-drawer
    v-model="visible"
    :title="`Visit #${visitId ?? ''} 時間線`"
    direction="rtl"
    size="min(420px, 92vw)"
  >
    <!-- 呈現層與明細的「歷程」共用 RecruitmentTimelineList（2026-09-06）：
         兩處原本各有一份逐字相同的渲染與樣式。本檔只負責 drawer 外框與取資料。 -->
    <RecruitmentTimelineList
      :events="events"
      :loading="loading"
      empty-text="尚無事件記錄"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { ElDrawer } from 'element-plus'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import RecruitmentTimelineList from '@/components/recruitment/RecruitmentTimelineList.vue'

const props = defineProps<{
  modelValue: boolean
  visitId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useRecruitmentFunnelStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const events = computed(() => {
  if (props.visitId == null) return []
  return store.getTimelineByVisitId(props.visitId) ?? []
})

const loading = computed(() => {
  if (props.visitId == null) return false
  return store.loadingTimeline[props.visitId] ?? false
})

watch(
  () => [visible.value, props.visitId] as const,
  ([v, vid]) => {
    if (v && vid != null) {
      store.loadTimeline(vid)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
/* 清單樣式已搬到 RecruitmentTimelineList；本檔只保留 drawer 外框相關 */
</style>
