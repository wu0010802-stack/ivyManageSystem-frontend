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

// ── 學期 ───────────────────────────────────────
// 在籍記錄表是「單張表的瀏覽器」，學期選單只影響這張表：開啟時從全域學期上下文讀一次當
// 初值，之後只改本地、不回寫 store——寫 store 會連動底下班級管理頁換學期並重抓
// （同 ClassroomChangeLogDrawer 的 drawerTerm）。
const localTerm = ref({
  school_year: termStore.school_year,
  semester: termStore.semester,
})

const selectedTerm = computed({
  get: () => `${localTerm.value.school_year}-${localTerm.value.semester}`,
  set: (val: string) => {
    const [school_year, semester] = val.split('-').map(Number)
    localTerm.value = { school_year, semester }
  },
})

const termParams = () => ({
  school_year: localTerm.value.school_year,
  semester: localTerm.value.semester,
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

// el-dialog 的 @open 每次開啟都會觸發（與 destroy-on-close 無關），確保每次開啟
// 記錄表都是最新資料，不需仰賴元件是否重新掛載；學期初值也在此重新讀取（僅讀不寫）。
// 選單改以 @change（僅使用者操作觸發）重抓，避免這裡重設學期時 watcher 造成雙重載入。
const onOpen = () => {
  localTerm.value = {
    school_year: termStore.school_year,
    semester: termStore.semester,
  }
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
    title="在籍記錄表"
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
      <div class="term-field">
        <el-select
          v-model="selectedTerm"
          placeholder="選擇學年學期"
          style="width: 200px"
          @change="fetchRoster"
        >
          <el-option
            v-for="opt in termOptions"
            :key="`${opt.school_year}-${opt.semester}`"
            :label="opt.label"
            :value="`${opt.school_year}-${opt.semester}`"
          />
        </el-select>
        <div class="form-hint">只套用在這張表，不會改變班級管理頁的學期</div>
      </div>
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
  /* 學期欄含說明文字比其他 32px 控制項高；置中會讓其他控制項下沉，改頂端對齊 */
  align-items: flex-start;
  gap: var(--space-3, 12px);
  flex-wrap: nowrap;
  overflow-x: auto;
  margin-bottom: var(--space-3, 12px);
}

/* EP 的相鄰按鈕自帶 margin-left: 12px，與工具列 gap 重複；換行後落單的按鈕也會被縮排 */
.dialog-toolbar .el-button + .el-button {
  margin-left: 0;
}

/* 工具列一列約需 935px（含 12px 間距），內容區窄於此時 flex-end＋nowrap 會把最左的
   搜尋框推出可捲動範圍之外（負方向溢位不可捲），改成可換行；手機再改靠左起排 */
@media (--to-lg) {
  .dialog-toolbar {
    flex-wrap: wrap;
  }
}

@media (--to-sm) {
  .dialog-toolbar {
    justify-content: flex-start;
  }
}

.field-match-width {
  width: 220px;
  flex-shrink: 0;
}

/* 學期選單＋就地說明：寬螢幕單列時欄寬由說明文字撐開（不換行）；換行模式下以
   max-width 限縮到容器寬，說明文字自然折行，不會超出可視範圍 */
.term-field {
  flex-shrink: 0;
  max-width: 100%;
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
