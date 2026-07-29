<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { draftGrowthBook, createGrowthBook } from '@/api/growthBooks'
import { apiError } from '@/utils/error'

// 上限常數對齊後端 services/growth_book_service.py（OBS_PER_DOMAIN / WORK_SAMPLE_LIMIT /
// COLLAGE_MAX），超過即 disable 新增勾選（不可等到送出才被 422 擋下）。
const OBS_PER_DOMAIN_LIMIT = 3
const WORK_SAMPLE_LIMIT = 12
const COLLAGE_LIMIT = 24

// 領域白名單對齊後端 models/portfolio.py::OBSERVATION_DOMAINS。不在白名單內的字串
// （髒資料／未知 domain，含 null）比照後端 select_observation_ids 的正規化規則
// 一律併入「綜合」——否則異常 domain 值會被拆成獨立分組，讓「每領域 ≤3」的前端
// 防呆失真：使用者可能因此勾選超過 21 筆（7 域 × 3）觀察，送出後才被後端
// Pydantic max_length 422 擋下。
const FALLBACK_DOMAIN = '綜合'
const OBSERVATION_DOMAIN_WHITELIST: readonly string[] = [
  '身體動作與健康', '語文', '認知', '社會', '情緒', '美感', FALLBACK_DOMAIN,
]

function normalizeDomain(domain: string | null): string {
  return domain && OBSERVATION_DOMAIN_WHITELIST.includes(domain) ? domain : FALLBACK_DOMAIN
}

interface AttachmentThumb {
  id: number
  thumb_url: string | null
}
interface CandidateObservation {
  id: number
  domain: string | null
  narrative: string | null
  observation_date: string
  is_highlight: boolean
  rating: number | null
  attachment_ids: number[]
  attachment_thumbs?: AttachmentThumb[]
}
interface CandidateWorkSample {
  id: number
  title: string
  work_date: string
  domain: string | null
  attachment_ids: number[]
  attachment_thumbs?: AttachmentThumb[]
}
interface CollagePoolItem {
  id: number
  date: string
  thumb_url: string | null
}
interface CandidateMilestone {
  id: number
  title: string
  date: string
}
interface DraftCandidates {
  observations: CandidateObservation[]
  work_samples: CandidateWorkSample[]
  collage_pool: CollagePoolItem[]
  milestones: CandidateMilestone[]
  measurement_count: number
}
interface DraftManifest {
  version: number
  cover_attachment_id: number | null
  observation_ids: number[]
  work_sample_ids: number[]
  collage_attachment_ids: number[]
  milestone_ids: number[]
  include_measurements: boolean
}
interface DraftPeriod {
  start: string
  end: string
  label: string
}

const props = defineProps<{
  modelValue: boolean
  studentId: number
  studentName: string
  academicYear: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  generated: []
}>()

const loading = ref(false)
const generating = ref(false)
const conflictHint = ref<string | null>(null)

const candidates = ref<DraftCandidates>({
  observations: [],
  work_samples: [],
  collage_pool: [],
  milestones: [],
  measurement_count: 0,
})
const period = ref<DraftPeriod | null>(null)

const activeNames = ref([
  'cover', 'observations', 'workSamples', 'collage', 'milestones', 'measurement', 'narrative',
])

const coverAttachmentId = ref<number | null>(null)
const selectedObservationIds = ref<number[]>([])
const selectedWorkSampleIds = ref<number[]>([])
const selectedCollageIds = ref<number[]>([])
const selectedMilestoneIds = ref<number[]>([])
const includeMeasurements = ref(true)
const teacherNarrative = ref('')

function resetSelectionFromManifest(manifest: DraftManifest) {
  coverAttachmentId.value = manifest.cover_attachment_id
  selectedObservationIds.value = [...manifest.observation_ids]
  selectedWorkSampleIds.value = [...manifest.work_sample_ids]
  selectedCollageIds.value = [...manifest.collage_attachment_ids]
  selectedMilestoneIds.value = [...manifest.milestone_ids]
  includeMeasurements.value = manifest.include_measurements
}

async function loadDraft() {
  loading.value = true
  conflictHint.value = null
  try {
    const r = await draftGrowthBook(props.studentId, { academic_year: props.academicYear })
    // 後端 draft 端點未標 response_model，型別退為 unknown，依 CLAUDE.md 慣例以本地
    // interface 明確標註等候補齊後端 schema。
    const data = r.data as unknown as {
      manifest: DraftManifest
      candidates: DraftCandidates
      period: DraftPeriod
    }
    candidates.value = data.candidates
    period.value = data.period
    resetSelectionFromManifest(data.manifest)
    teacherNarrative.value = ''
  } catch (e) {
    ElMessage.error(apiError(e, '載入草稿失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) loadDraft()
  },
  { immediate: true },
)

// el-radio-group 的 v-model 型別是 string | number | boolean | undefined（不含
// null），coverAttachmentId 對外（generate() manifest／defineExpose）維持
// number | null 語意，故用 computed getter/setter 橋接 null <-> undefined，
// 只給模板綁定用。
const coverAttachmentIdForRadio = computed<number | undefined>({
  get: () => coverAttachmentId.value ?? undefined,
  set: (v) => { coverAttachmentId.value = v ?? null },
})

// ---------- 封面：observations／work_samples 的縮圖聯集，去重 ----------
const coverCandidates = computed<AttachmentThumb[]>(() => {
  const seen = new Set<number>()
  const out: AttachmentThumb[] = []
  for (const list of [candidates.value.observations, candidates.value.work_samples]) {
    for (const item of list) {
      for (const t of item.attachment_thumbs ?? []) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        out.push(t)
      }
    }
  }
  return out
})

// ---------- 觀察：依領域分組＋每領域上限 3 ----------
const observationsByDomain = computed<Record<string, CandidateObservation[]>>(() => {
  const out: Record<string, CandidateObservation[]> = {}
  for (const o of candidates.value.observations) {
    const domain = normalizeDomain(o.domain)
    out[domain] = out[domain] || []
    out[domain].push(o)
  }
  return out
})

function domainSelectedCount(obsInDomain: CandidateObservation[]) {
  const ids = new Set(obsInDomain.map((o) => o.id))
  return selectedObservationIds.value.filter((id) => ids.has(id)).length
}

function isObservationCheckboxDisabled(domain: string, obs: CandidateObservation) {
  if (selectedObservationIds.value.includes(obs.id)) return false
  const obsInDomain = observationsByDomain.value[domain] || []
  return domainSelectedCount(obsInDomain) >= OBS_PER_DOMAIN_LIMIT
}

function isWorkSampleCheckboxDisabled(ws: CandidateWorkSample) {
  if (selectedWorkSampleIds.value.includes(ws.id)) return false
  return selectedWorkSampleIds.value.length >= WORK_SAMPLE_LIMIT
}

function isCollageCheckboxDisabled(item: CollagePoolItem) {
  if (selectedCollageIds.value.includes(item.id)) return false
  return selectedCollageIds.value.length >= COLLAGE_LIMIT
}

function narrativeExcerpt(text: string | null) {
  if (!text) return ''
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

// ---------- 生成前防呆：四個 id list 全空且無封面時後端回 422，前端先擋 ----------
const hasAnyMaterial = computed(() =>
  coverAttachmentId.value != null
  || selectedObservationIds.value.length > 0
  || selectedWorkSampleIds.value.length > 0
  || selectedCollageIds.value.length > 0
  || selectedMilestoneIds.value.length > 0,
)

async function generate() {
  if (!hasAnyMaterial.value) {
    ElMessage.warning('至少選擇一項素材')
    return
  }
  generating.value = true
  conflictHint.value = null
  try {
    await createGrowthBook(props.studentId, {
      academic_year: props.academicYear,
      teacher_narrative: teacherNarrative.value.trim() || null,
      manifest: {
        version: 1,
        cover_attachment_id: coverAttachmentId.value,
        observation_ids: selectedObservationIds.value,
        work_sample_ids: selectedWorkSampleIds.value,
        collage_attachment_ids: selectedCollageIds.value,
        milestone_ids: selectedMilestoneIds.value,
        include_measurements: includeMeasurements.value,
      },
    })
    ElMessage.success('已送出生成，完成後可在列表下載')
    emit('generated')
    emit('update:modelValue', false)
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      conflictHint.value = '重新生成前請先於列表刪除舊冊'
    }
    ElMessage.error(apiError(e, '生成失敗'))
  } finally {
    generating.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

defineExpose({
  selectedObservationIds,
  selectedWorkSampleIds,
  selectedCollageIds,
  selectedMilestoneIds,
  coverAttachmentId,
  includeMeasurements,
  teacherNarrative,
  conflictHint,
  hasAnyMaterial,
  generate,
})
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    size="60%"
    :title="`策展：${studentName}`"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-loading="loading" class="curation-drawer">
      <el-alert
        v-if="conflictHint"
        type="warning"
        :title="conflictHint"
        show-icon
        :closable="false"
        class="conflict-hint"
      />
      <p v-if="period" class="period-label">{{ period.label }}（{{ period.start }} ～ {{ period.end }}）</p>

      <el-collapse v-model="activeNames">
        <el-collapse-item title="封面" name="cover">
          <p v-if="coverCandidates.length === 0" class="empty-hint">尚無可選封面照片</p>
          <el-radio-group v-else v-model="coverAttachmentIdForRadio" class="thumb-grid">
            <label
              v-for="c in coverCandidates"
              :key="c.id"
              class="thumb-item"
            >
              <el-radio :value="c.id" class="thumb-radio">
                <img v-if="c.thumb_url" :src="c.thumb_url" class="thumb-img" />
                <span v-else class="thumb-placeholder">無縮圖</span>
              </el-radio>
            </label>
          </el-radio-group>
        </el-collapse-item>

        <el-collapse-item title="觀察精選" name="observations">
          <div
            v-for="(list, domain) in observationsByDomain"
            :key="domain"
            class="domain-group"
          >
            <h4 class="domain-title">{{ domain }}</h4>
            <el-checkbox-group v-model="selectedObservationIds">
              <div v-for="o in list" :key="o.id" class="obs-row">
                <el-checkbox
                  :value="o.id"
                  :disabled="isObservationCheckboxDisabled(domain, o)"
                >
                  <span class="obs-date">{{ o.observation_date }}</span>
                  <span class="obs-narrative">{{ narrativeExcerpt(o.narrative) }}</span>
                  <el-tag v-if="o.is_highlight" size="small" type="danger">亮點</el-tag>
                  <el-tag v-if="o.rating" size="small" type="warning">{{ o.rating }}★</el-tag>
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>
        </el-collapse-item>

        <el-collapse-item title="作品" name="workSamples">
          <p v-if="candidates.work_samples.length === 0" class="empty-hint">此學年無作品可選</p>
          <el-checkbox-group v-else v-model="selectedWorkSampleIds" class="thumb-grid">
            <label
              v-for="w in candidates.work_samples"
              :key="w.id"
              class="thumb-item"
            >
              <el-checkbox :value="w.id" :disabled="isWorkSampleCheckboxDisabled(w)" class="thumb-checkbox">
                <img
                  v-if="(w.attachment_thumbs ?? [])[0]?.thumb_url"
                  :src="(w.attachment_thumbs ?? [])[0].thumb_url as string"
                  class="thumb-img"
                />
                <span v-else class="thumb-placeholder">{{ w.title }}</span>
                <span class="thumb-caption">{{ w.title }}</span>
              </el-checkbox>
            </label>
          </el-checkbox-group>
        </el-collapse-item>

        <el-collapse-item title="歲末拼貼" name="collage">
          <p v-if="candidates.collage_pool.length === 0" class="empty-hint">此學年無可用拼貼照片</p>
          <el-checkbox-group v-else v-model="selectedCollageIds" class="thumb-grid">
            <label
              v-for="c in candidates.collage_pool"
              :key="c.id"
              class="thumb-item"
            >
              <el-checkbox :value="c.id" :disabled="isCollageCheckboxDisabled(c)" class="thumb-checkbox">
                <img v-if="c.thumb_url" :src="c.thumb_url" class="thumb-img" />
                <span v-else class="thumb-placeholder">無縮圖</span>
              </el-checkbox>
            </label>
          </el-checkbox-group>
        </el-collapse-item>

        <el-collapse-item title="里程碑" name="milestones">
          <p v-if="candidates.milestones.length === 0" class="empty-hint">此學年無里程碑</p>
          <el-checkbox-group v-else v-model="selectedMilestoneIds">
            <div v-for="m in candidates.milestones" :key="m.id" class="milestone-row">
              <el-checkbox :value="m.id">
                <span class="obs-date">{{ m.date }}</span>
                <span class="obs-narrative">{{ m.title }}</span>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-collapse-item>

        <el-collapse-item title="成長曲線" name="measurement">
          <el-switch v-model="includeMeasurements" />
          <span class="measurement-hint">
            期間內共 {{ candidates.measurement_count }} 筆量測記錄（未滿 2 筆時 PDF 不會畫曲線）
          </span>
        </el-collapse-item>

        <el-collapse-item title="老師的話" name="narrative">
          <el-input
            v-model="teacherNarrative"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="給家長的一段話（選填）"
          />
        </el-collapse-item>
      </el-collapse>

      <p v-if="!hasAnyMaterial" class="no-material-hint">至少選擇一項素材才能生成</p>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="generating"
        :disabled="!hasAnyMaterial"
        @click="generate"
      >
        生成
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.curation-drawer {
  min-height: 200px;
}
.conflict-hint {
  margin-bottom: 12px;
}
.period-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0 0 12px;
}
.domain-group {
  margin-bottom: 16px;
}
.domain-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.obs-row, .milestone-row {
  margin-bottom: 8px;
}
.obs-date {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-right: 8px;
}
.obs-narrative {
  margin-right: 8px;
}
.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.thumb-item {
  display: block;
}
.thumb-radio, .thumb-checkbox {
  width: 100%;
  height: auto;
  margin-right: 0;
}
.thumb-radio :deep(.el-radio__label),
.thumb-checkbox :deep(.el-checkbox__label) {
  width: 100%;
}
.thumb-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  border-radius: 4px;
}
.thumb-caption {
  display: block;
  font-size: 12px;
  text-align: center;
  margin-top: 2px;
}
.empty-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.measurement-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.no-material-hint {
  color: var(--el-color-danger);
  font-size: 13px;
  margin-top: 8px;
}
</style>
