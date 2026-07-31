<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Printer, Search, Download } from '@element-plus/icons-vue'
import { getEnrollmentOptions, getEnrollmentRoster, getEnrollmentRosterPdf } from '@/api/studentEnrollment'
import { openPdfInNewTab } from '@/utils/printPdfWindow'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { useIsMobile } from '@/composables/useIsMobile'
import EnrollmentRosterTable from './EnrollmentRosterTable.vue'
import type { Roster } from './rosterTypes'
import { filterRoster } from './rosterFilter'

interface TermOption { school_year: number; semester: number; label: string }

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const router = useRouter()
const termStore = useAcademicTermStore()
const { isMobile } = useIsMobile()

const rosterLoading = ref(false)
const roster = ref<Roster | null>(null)
const termOptions = ref<TermOption[]>([])

const gradeFilter = ref<string[]>([])
const searchInput = ref('')
const searchKeyword = ref('')
let _searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchInput, (v) => {
  if (_searchTimer) clearTimeout(_searchTimer)
  _searchTimer = setTimeout(() => { searchKeyword.value = v }, 300)
})

const selectedTerm = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val: string) => {
    const [sy, sem] = val.split('-').map(Number)
    termStore.setTerm(sy, sem)
  },
})

const termParams = () => ({
  school_year: termStore.school_year,
  semester: termStore.semester,
})

const fetchOptions = async () => {
  try {
    const res = await getEnrollmentOptions()
    termOptions.value = res.data as TermOption[]
  } catch (e) {
    ElMessage.error(apiError(e, '載入學年選項失敗'))
  }
}

const fetchRoster = async () => {
  rosterLoading.value = true
  try {
    const res = await getEnrollmentRoster(termParams())
    roster.value = res.data as unknown as Roster
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍記錄表失敗'))
  } finally {
    rosterLoading.value = false
  }
}

watch(selectedTerm, () => {
  fetchRoster()
})

// el-dialog 的 @open 每次開啟都會觸發（與 destroy-on-close 無關），確保每次開啟
// 統計表都是最新資料，不需仰賴元件是否重新掛載。
const onOpen = () => {
  void fetchOptions()
  void fetchRoster()
}

const gradeOptions = computed(() => [...new Set((roster.value?.classes ?? []).map(c => c.grade_name))])
const displayRoster = computed((): Roster | null =>
  roster.value ? filterRoster(roster.value, gradeFilter.value, []) : null
)
const displayTagCounts = computed(() => {
  const counts = { 新生: 0, 不足齡: 0, 特教生: 0, 原住民: 0 }
  for (const c of displayRoster.value?.classes ?? [])
    for (const s of c.students)
      if (s.status_tag && s.status_tag in counts) counts[s.status_tag as keyof typeof counts]++
  return counts
})

const exportXlsx = async () => {
  await downloadFile('/student-enrollment/roster.xlsx', '在籍紀錄.xlsx', termParams())
}

const printRoster = async () => {
  await openPdfInNewTab({
    fetchBlob: async () => (await getEnrollmentRosterPdf(termParams())).data,
    loadingText: '在籍花名冊載入中…',
    onError: (err) => ElMessage.error(apiError(err, '載入花名冊 PDF 失敗')),
  })
}

const onSelectStudent = ({ id, name }: { id: number; name: string }) => {
  emit('update:visible', false)
  router.push({ path: '/students', query: { tab: 'roster', student_id: String(id), q: name } })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="統計表"
    :width="isMobile ? '100%' : '92%'"
    :top="isMobile ? '0' : '2vh'"
    :fullscreen="isMobile"
    class="enrollment-roster-dialog"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @open="onOpen"
  >
    <div class="dialog-toolbar">
      <el-input
        v-model="searchInput"
        placeholder="搜尋學生姓名"
        clearable
        :prefix-icon="Search"
        class="field-match-width"
      />
      <el-select
        v-model="gradeFilter"
        multiple
        collapse-tags
        placeholder="年級"
        clearable
        class="field-match-width"
      >
        <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
      </el-select>
      <el-select v-model="selectedTerm" placeholder="選擇學年學期" style="width: 200px">
        <el-option
          v-for="opt in termOptions"
          :key="`${opt.school_year}-${opt.semester}`"
          :label="opt.label"
          :value="`${opt.school_year}-${opt.semester}`"
        />
      </el-select>
      <el-button :icon="Download" @click="exportXlsx">匯出 Excel</el-button>
      <el-button :icon="Printer" @click="printRoster">列印</el-button>
    </div>

    <div v-loading="rosterLoading" class="dialog-body">
      <template v-if="roster">
        <div class="roster-subtoolbar">
          <div class="tag-chips">
            <span class="chip chip-new">● 新生 {{ displayTagCounts.新生 }}</span>
            <span class="chip chip-underage">● 不足齡 {{ displayTagCounts.不足齡 }}</span>
            <span class="chip chip-special">● 特教 {{ displayTagCounts.特教生 }}</span>
            <span class="chip chip-indigenous">● 原民 {{ displayTagCounts.原住民 }}</span>
          </div>
        </div>
        <EnrollmentRosterTable
          v-if="displayRoster"
          :roster="displayRoster"
          :highlight-keyword="searchKeyword"
          @select-student="onSelectStudent"
        />
      </template>
      <el-empty
        v-else-if="!rosterLoading"
        description="尚未載入在籍記錄表"
        :image-size="80"
      />
    </div>
  </el-dialog>
</template>

<style scoped>
.enrollment-roster-dialog {
  display: flex;
  flex-direction: column;
  height: 96vh;
}

.enrollment-roster-dialog.is-fullscreen {
  height: 100vh;
}

.enrollment-roster-dialog :deep(.el-dialog__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.dialog-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: nowrap;
  overflow-x: auto;
  margin-bottom: var(--space-3, 12px);
}

.field-match-width {
  width: 220px;
  flex-shrink: 0;
}

.roster-subtoolbar {
  margin-bottom: var(--space-3, 12px);
}

.tag-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid currentColor;
  white-space: nowrap;
}

.chip-new        { color: var(--color-success); }
.chip-underage   { color: var(--color-warning); }
.chip-special    { color: #7c3aed; }
.chip-indigenous { color: var(--color-info); }
</style>
