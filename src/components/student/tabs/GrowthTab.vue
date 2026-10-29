<script setup lang="ts">
/**
 * 學生檔案「成長」頁籤（後台 IA 重整 S6，2026-10-29）。
 *
 * 原本是三層巢狀：一級「健康／成長檔案」→「健康類／成長類」分組 → 各 4 個卡片子頁籤。現在攤平成一層：
 * 七個區塊依序排成可展開的區段（成長歷程、里程碑、時間軸、照片牆、成長報告、量測曲線、作品集），
 * 不再有隱藏在子頁籤裡的內容。區塊內容元件不動（各自的寫入權限判斷照舊）。
 *
 * - 權限：整個頁籤＝PORTFOLIO_READ（原本七個區塊全是這個碼：成長歷程／量測／作品集在 HealthGrowthTab
 *   的 canPortfolio 下，里程碑等四個在「成長類」分組下，該分組同樣只對 PORTFOLIO_READ 開放）。
 *   頁籤本身已依此顯示；這裡再擋一次，直接掛載本元件也不會越權。
 * - 區塊首次展開才掛載內容（保留原本子頁籤 lazy 的語意，不會一進頁籤就打七支 API），掛載後保留狀態。
 * - 深連結 `?sub=<區塊>`（含更早期的 milestones／timeline／photo_gallery／growth_report 舊書籤）：
 *   由父層轉成 sectionRequest，這裡展開該區塊並捲動到它。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { hasPermission } from '@/utils/auth'
import PortfolioTab from '@/components/portfolio/PortfolioTab.vue'
import MeasurementsSection from '@/components/portfolio/MeasurementsSection.vue'
import WorkSamplesSection from '@/components/portfolio/WorkSamplesSection.vue'
import MilestonesTab from './MilestonesTab.vue'
import TimelineTab from './TimelineTab.vue'
import PhotoGalleryTab from './PhotoGalleryTab.vue'
import GrowthReportTab from './GrowthReportTab.vue'
import { GROWTH_SECTIONS, sectionBelongsTo, type SectionRequest } from '../studentProfileTabs'

const props = withDefaults(defineProps<{
  studentId: number
  sectionRequest?: SectionRequest | null
}>(), {
  sectionRequest: null,
})

const SECTION_LABELS: Record<(typeof GROWTH_SECTIONS)[number], string> = {
  portfolio: '成長歷程',
  milestones: '里程碑',
  timeline: '時間軸',
  photo_gallery: '照片牆',
  growth_report: '成長報告',
  measurements: '量測曲線',
  work_samples: '作品集',
}

const canPortfolio = computed(() => hasPermission('PORTFOLIO_READ'))

const root = ref<HTMLElement | null>(null)
// 預設展開第一個；深連結帶區塊時改展開那一個
const opened = ref<string[]>([
  sectionBelongsTo('growth', props.sectionRequest?.section ?? '') ? props.sectionRequest!.section : 'portfolio',
])
// 曾經展開過的區塊才掛載內容，之後保留（收合只是隱藏）
const everOpened = ref<Set<string>>(new Set(opened.value))
watch(opened, (names) => names.forEach((n) => everOpened.value.add(n)), { deep: true })

async function scrollTo(section: string) {
  await nextTick()
  root.value?.querySelector(`[data-section="${section}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
}

watch(
  () => props.sectionRequest,
  (req) => {
    if (!req || !sectionBelongsTo('growth', req.section)) return
    if (!opened.value.includes(req.section)) opened.value = [...opened.value, req.section]
    void scrollTo(req.section)
  },
)
</script>

<template>
  <div ref="root" class="growth-tab">
    <el-empty v-if="!canPortfolio" description="您沒有檢視成長歷程的權限" />
    <el-collapse v-else v-model="opened" class="growth-sections">
      <el-collapse-item
        v-for="name in GROWTH_SECTIONS"
        :key="name"
        :title="SECTION_LABELS[name]"
        :name="name"
        :data-section="name"
      >
        <template v-if="everOpened.has(name)">
          <PortfolioTab v-if="name === 'portfolio'" :student-id="studentId" />
          <MilestonesTab v-else-if="name === 'milestones'" :student-id="studentId" />
          <TimelineTab v-else-if="name === 'timeline'" :student-id="studentId" />
          <PhotoGalleryTab v-else-if="name === 'photo_gallery'" :student-id="studentId" />
          <GrowthReportTab v-else-if="name === 'growth_report'" :student-id="studentId" />
          <MeasurementsSection v-else-if="name === 'measurements'" :student-id="studentId" />
          <WorkSamplesSection v-else-if="name === 'work_samples'" :student-id="studentId" />
        </template>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.growth-sections :deep(.el-collapse-item__header) {
  font-weight: 600;
}
</style>
