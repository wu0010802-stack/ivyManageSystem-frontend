<script setup lang="ts">
/**
 * 教師端點名名冊（2026-09-14 改版；取代原本的 ActivityRollcallDrawer）。
 *
 * 改版前是右側 drawer 內的四欄 el-table：進度條＋兩顆批次鈕＋四個統計 tag＋搜尋＋
 * 開關＋表頭疊起來 252px 才看得到第一位學生；390px 下表格 370px 塞進 350px，備註欄
 * 被切掉一半要橫捲；儲存鈕在整張表最底部。
 *
 * 現在：統計 tag 改成可點的篩選 chip（「只看未點名」就是點「未點 N」）、依班分組、
 * 備註預設收起、儲存列固定在底部並常駐「未點名不會被記為缺席」。
 *
 * 出缺席控制項是 AttendanceMarkControl（三態）。⚠ 不可換回 el-switch：
 * 它會把 null 改寫成缺席，等於打開畫面就把全班記成缺席（見該元件註解）。
 */
import { computed, ref, watch } from 'vue'
import AttendanceMarkControl from '@/components/activity/AttendanceMarkControl.vue'
import type { AttendanceStudent, AttendanceStudentGroup } from '@/composables/useActivityAttendanceDrawer'

type MarkFilter = 'all' | 'unmarked' | 'present' | 'absent'

const props = withDefaults(
  defineProps<{
    groups: AttendanceStudentGroup[]
    students: AttendanceStudent[]
    presentCount: number
    absentCount: number
    unmarkedCount: number
    saveLoading?: boolean
    dirtyCount?: number
    canWrite?: boolean
  }>(),
  { saveLoading: false, dirtyCount: 0, canWrite: true },
)

const emit = defineEmits<{
  'set-unmarked-present': []
  'set-group-present': [group: AttendanceStudentGroup]
  save: []
}>()

const filter = ref<MarkFilter>('all')
const search = ref('')
/** 手動點開備註的學生（有值者自動視為展開） */
const openedNotes = ref(new Set<unknown>())

const total = computed(() => props.students.length)

// 名冊換人（換場次）時把顯示篩選重置，避免上一場的「只看未點名」殘留。
watch(
  () => props.students,
  () => {
    filter.value = 'all'
    search.value = ''
    openedNotes.value = new Set()
  },
)

function matches(s: AttendanceStudent): boolean {
  if (filter.value === 'unmarked' && s.is_present !== null) return false
  if (filter.value === 'present' && s.is_present !== true) return false
  if (filter.value === 'absent' && s.is_present !== false) return false
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  return String(s.student_name ?? '').toLowerCase().includes(q)
}

/**
 * 顯示用的分組。students 是同一批物件參考（不可複製），篩選只影響看得到什麼，
 * 儲存來源仍是父層完整名冊——被濾掉的列輸入不會漏存。
 */
const visibleGroups = computed(() =>
  props.groups
    .map((g) => ({
      ...g,
      /** 本班未點名人數：不受顯示篩選影響，否則「全班出席」的數字會跟著篩選跳動 */
      unmarked: g.students.filter((s) => s.is_present === null).length,
      visibleStudents: g.students.filter(matches),
    }))
    .filter((g) => g.visibleStudents.length > 0),
)

const chips = computed(() => [
  { key: 'all' as const, label: `全部 ${total.value}`, tone: '' },
  { key: 'unmarked' as const, label: `未點 ${props.unmarkedCount}`, tone: 'warn' },
  { key: 'present' as const, label: `出席 ${props.presentCount}`, tone: 'ok' },
  { key: 'absent' as const, label: `缺席 ${props.absentCount}`, tone: 'danger' },
])

function isNoteOpen(s: AttendanceStudent): boolean {
  if ((s.attendance_notes ?? '').trim() !== '') return true
  return openedNotes.value.has(s.registration_id)
}

function openNote(s: AttendanceStudent) {
  const next = new Set(openedNotes.value)
  next.add(s.registration_id)
  openedNotes.value = next
}

/** 標成缺席時自動把備註欄打開——缺席幾乎都要寫原因。 */
function onMark(s: AttendanceStudent, value: boolean) {
  s.is_present = value
  if (value === false) openNote(s)
}
</script>

<template>
  <div class="rollcall">
    <!-- 統計 chip 兼篩選：原本四個 el-tag 只能看不能點，「只看未點名」另外一顆開關 -->
    <div class="rollcall__bar">
      <div class="rollcall__chips" role="group" aria-label="依點名狀態篩選">
        <button
          v-for="c in chips"
          :key="c.key"
          type="button"
          class="chip"
          :class="[c.tone && `chip--${c.tone}`, { 'is-on': filter === c.key }]"
          :aria-pressed="filter === c.key"
          :data-test="`filter-${c.key}`"
          @click="filter = c.key"
        >
          {{ c.label }}
        </button>
      </div>
      <el-input
        v-model="search"
        class="rollcall__search"
        placeholder="搜尋姓名"
        clearable
        data-test="rollcall-search"
      />
      <el-button
        v-if="canWrite"
        class="rollcall__bulk"
        :disabled="unmarkedCount === 0"
        data-test="mark-unmarked-present"
        @click="emit('set-unmarked-present')"
      >
        未點名者全部出席（{{ unmarkedCount }}）
      </el-button>
    </div>

    <!-- 依班分組：原本每列一個「班級」欄，跨班名冊要自己對 -->
    <section
      v-for="g in visibleGroups"
      :key="String(g.classroom_id ?? 'unassigned')"
      class="group"
      data-test="rollcall-group"
    >
      <header class="group__head">
        <span class="group__name">{{ g.classroom_name }}</span>
        <span class="group__count">
          {{ g.students.length }} 人<template v-if="g.unmarked > 0">・未點 {{ g.unmarked }}</template>
        </span>
        <el-button
          v-if="canWrite && g.unmarked > 0"
          link
          type="primary"
          class="group__bulk"
          data-test="group-present"
          @click="emit('set-group-present', g)"
        >
          全班出席
        </el-button>
        <span v-else-if="g.unmarked === 0" class="group__done">已完成 {{ g.students.length }}／{{ g.students.length }}</span>
      </header>

      <div
        v-for="s in g.visibleStudents"
        :key="String(s.registration_id)"
        class="student"
        :class="{ 'student--unmarked': s.is_present === null }"
        data-test="rollcall-student"
      >
        <div class="student__id">
          <span class="student__name">{{ s.student_name }}</span>
          <span v-if="s.is_present === null" class="student__flag">未點</span>
          <el-button
            v-if="canWrite && !isNoteOpen(s)"
            link
            type="primary"
            class="student__note-toggle"
            :aria-label="`為 ${s.student_name} 加備註`"
            @click="openNote(s)"
          >
            加備註
          </el-button>
        </div>

        <AttendanceMarkControl
          :model-value="s.is_present"
          :disabled="!canWrite"
          :aria-label="String(s.student_name ?? '')"
          @update:model-value="(v) => onMark(s, v)"
        />

        <el-input
          v-if="isNoteOpen(s)"
          v-model="s.attendance_notes"
          class="student__note"
          :disabled="!canWrite"
          placeholder="備註（選填）"
          clearable
        />
      </div>
    </section>

    <p v-if="!visibleGroups.length" class="rollcall__none">沒有符合條件的學生。</p>

    <!-- 儲存列固定在底部：原本要捲過整張名冊才看得到按鈕 -->
    <footer v-if="canWrite" class="rollcall__save">
      <div class="rollcall__save-msg">
        <strong v-if="unmarkedCount > 0">還有 {{ unmarkedCount }} 位未點名</strong>
        <strong v-else>全部 {{ total }} 位都點完了</strong>
        <span>{{ unmarkedCount > 0 ? '儲存後仍維持未點名，不會記為缺席' : '' }}</span>
      </div>
      <span v-if="dirtyCount > 0" class="rollcall__dirty">{{ dirtyCount }} 筆異動</span>
      <el-button
        type="primary"
        :loading="saveLoading"
        data-test="rollcall-save"
        @click="emit('save')"
      >
        儲存點名
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.rollcall {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  /* 讓最後一位學生不會被固定的儲存列蓋住 */
  padding-bottom: 72px;
}

/* ── 篩選列 ───────────────────────────────────────────── */
.rollcall__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background: var(--pt-surface-card, #fff);
}
.rollcall__chips {
  display: flex;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: 999px;
  background: var(--pt-surface-card, #fff);
  color: var(--pt-text-body);
  font: inherit;
  font-size: var(--text-sm, 13px);
  cursor: pointer;
  white-space: nowrap;
}
.chip.is-on {
  background: var(--el-color-primary-light-9, #eef2ff);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 700;
}
.chip--warn.is-on {
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
  color: var(--color-warning-darker);
}
.chip--ok.is-on {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: var(--color-success-darker);
}
.chip--danger.is-on {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger-darker);
}
.chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.rollcall__search {
  flex: 1 1 10rem;
  min-width: 0;
  max-width: 16rem;
}
.rollcall__bulk {
  margin-left: auto;
}

/* ── 班級分組 ─────────────────────────────────────────── */
.group {
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background: var(--pt-surface-card, #fff);
  overflow: hidden;
}
.group__head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--pt-surface-mute, #f1f5f9);
  border-bottom: 1px solid var(--pt-border, #e2e8f0);
  font-size: var(--text-sm, 13px);
}
.group__name {
  font-weight: 700;
  color: var(--pt-text-strong);
}
.group__count {
  color: var(--pt-text-muted);
}
.group__bulk {
  margin-left: auto;
}
.group__done {
  margin-left: auto;
  color: var(--color-success-darker);
  font-weight: 600;
  font-size: var(--text-xs, 12px);
}

.student {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2, 8px) var(--space-4, 16px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border-top: 1px solid var(--pt-border, #e2e8f0);
  min-height: 56px;
}
.group__head + .student {
  border-top: 0;
}
.student--unmarked {
  background: var(--color-warning-soft);
}
.student__id {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  min-width: 0;
}
.student__name {
  font-size: var(--text-base, 14px);
  font-weight: 500;
  color: var(--pt-text-strong);
}
/* 未點名不能只靠底色表意（PRODUCT.md 無障礙基準：純色不可作為唯一狀態指示） */
.student__flag {
  border-radius: 999px;
  padding: 0 8px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--color-warning);
  color: var(--color-warning-darker);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
}
.student__note {
  grid-column: 1 / -1;
}
.rollcall__none {
  margin: 0;
  padding: var(--space-6, 24px);
  text-align: center;
  color: var(--pt-text-muted);
  font-size: var(--text-sm, 13px);
}

/* ── 儲存列 ───────────────────────────────────────────── */
.rollcall__save {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background: var(--pt-surface-card, #fff);
  box-shadow: var(--pt-elev-2);
}
.rollcall__save-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 12rem;
  min-width: 0;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
}
.rollcall__save-msg strong {
  color: var(--pt-text-strong);
}
.rollcall__dirty {
  color: var(--pt-text-muted);
  font-size: var(--text-xs, 12px);
}

@media (max-width: 767.98px) {
  /* 教師端手機有底部導覽列（PortalLayout .bottom-nav，高 60px + 安全區）。
     sticky bottom:0 會貼在捲動容器底部＝被導覽列整條蓋住，儲存鈕點不到，
     所以往上讓開導覽列的高度。 */
  .rollcall__save {
    bottom: calc(60px + env(safe-area-inset-bottom));
    /* 手機不換行：訊息占滿剩餘寬度、按鈕固定在右側。用 flex-wrap 會讓按鈕
       掉到第二行並靠左，看起來像沒對齊的孤兒。 */
    flex-wrap: nowrap;
  }
  .rollcall__save-msg {
    flex: 1 1 auto;
  }
  .rollcall__save :deep(.el-button) {
    flex: none;
  }
  .rollcall {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }
  .rollcall__chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    width: 100%;
  }
  .rollcall__search {
    max-width: none;
  }
  .rollcall__bulk {
    margin-left: 0;
    width: 100%;
  }
  .rollcall__bulk :deep(span) {
    white-space: normal;
  }
  .student {
    min-height: 60px;
  }
  .rollcall__save :deep(.el-button) {
    min-height: var(--touch-target-min, 44px);
    padding-inline: 22px;
  }
}
</style>
