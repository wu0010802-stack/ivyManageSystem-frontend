<script setup lang="ts">
// BonusConfigPanel「職稱等級對應」tab（2026-07-12 體檢 F2 拆分，階段 2-D：
// 職稱→節慶獎金等級對應 job_titles.bonus_grade）：清單自己 fetch / save，
// 但獎金基數改由父層 bonusConfig 傳入（說明欄要顯示實際金額，見下）。
// 掛載時機同 StandardSalaryTab，由父層 el-tabs（非 lazy）+ 外層
// v-if="canReadSalarySettings" 決定。
import { ref, onMounted } from 'vue'
import { getTitles, updateTitle } from '@/api/config'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'

// 說明欄只需要節慶獎金基數這幾格；金額原本硬編碼 2000/1200/1500，但基數其實是
// 隔壁「節慶獎金」tab 可改的 DB 設定，且 A/B 級自 festab01（2026-08-28）起可
// 分開設定——寫死必然漂移，改成直接顯示同一份 reactive 物件的實際值。
interface JobTitleGradeBonusConfig {
  head_teacher_a: number
  head_teacher_b: number
  head_teacher_c: number
  assistant_teacher_a: number
  assistant_teacher_b: number
  assistant_teacher_c: number
  art_teacher_festival: number
}

const props = defineProps<{ bonusConfig: JobTitleGradeBonusConfig }>()

interface JobTitleRow {
  id: number
  name: string
  bonus_grade: string | null
}

const jobTitles = ref<JobTitleRow[]>([])
const loadingTitles = ref(false)
// 改動前的等級快照。el-select 的 v-model 在 @change 觸發前就已改寫 row，
// 要判斷「這次是不是把既有等級清掉」以及取消時要還原成什麼，都得靠它。
const gradesBeforeEdit = new Map<number, string | null>()

// DB 存量有小寫等級（年終測試資料即為 'b'）：後端 engine 兩種大小寫都吃，
// 但前端 el-option 只有大寫值，不正規化的話該列會顯示成「（不設定）」——
// 等於對著已設定的職稱謊報未設定。
const normalizeGrade = (raw: unknown): string | null => {
  const g = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  return g === 'A' || g === 'B' || g === 'C' ? g : null
}

const fetchJobTitles = async () => {
  loadingTitles.value = true
  try {
    const res = await getTitles()
    jobTitles.value = (res.data as JobTitleRow[]).map((t) => ({
      ...t,
      bonus_grade: normalizeGrade(t.bonus_grade),
    }))
    gradesBeforeEdit.clear()
    for (const t of jobTitles.value) gradesBeforeEdit.set(t.id, t.bonus_grade)
  } catch (e) {
    ElMessage.error(friendlyError('職稱載入失敗', e))
  } finally {
    loadingTitles.value = false
  }
}

// 清空等級不是「這個職稱不參與」而已：後端 grade_map 少掉這個職稱後，
// get_festival_bonus_base 找不到等級會 fallback 成 C 級（班導 2000 → 1500），
// 而且員工個別指定的 bonus_grade 覆蓋要反查代表職稱（A→幼兒園教師、
// B→教保員、C→職員），代表職稱一旦沒等級，那些覆蓋也會靜默失效。
const CLEAR_CONFIRM_MESSAGE =
  '清空後，這個職稱的帶班老師節慶獎金會退回 C 級基數計算，員工個別指定的等級覆蓋也會一併失效。確定要清空嗎？'

const updateTitleGrade = async (row: JobTitleRow) => {
  const next = normalizeGrade(row.bonus_grade)
  const previous = gradesBeforeEdit.get(row.id) ?? null
  if (next === previous) return
  row.bonus_grade = next

  if (previous && !next) {
    try {
      await ElMessageBox.confirm(CLEAR_CONFIRM_MESSAGE, `清空「${row.name}」的節慶獎金等級`, {
        type: 'warning',
        confirmButtonText: '確定清空',
        cancelButtonText: '取消',
      })
    } catch {
      row.bonus_grade = previous
      return
    }
  }

  try {
    const res = await updateTitle(row.id, { name: row.name, bonus_grade: next })
    // 後端回傳這次被標記 needs_recalc 的未封存薪資筆數——改等級會連動重算，
    // 使用者有權知道自己剛剛動到幾筆薪資。
    const marked = Number(
      (res?.data as { salary_records_marked_stale?: number } | undefined)
        ?.salary_records_marked_stale ?? 0,
    )
    ElMessage.success(
      marked > 0
        ? `${row.name} 等級已更新，已標記 ${marked} 筆未封存薪資待重算`
        : `${row.name} 等級已更新`,
    )
  } catch (e) {
    ElMessage.error(friendlyError(`更新職稱 ${row.name} 失敗`, e))
  }
  // 成功、失敗都重抓：舊版只在失敗時還原，成功路徑一旦被後端靜默忽略
  // （清空等級曾經就是這樣）畫面會停在一個 DB 裡不存在的狀態。
  await fetchJobTitles()
}

const gradeBase = (grade: string): { head: number; assistant: number } => {
  const c = props.bonusConfig
  if (grade === 'A') return { head: c.head_teacher_a, assistant: c.assistant_teacher_a }
  if (grade === 'B') return { head: c.head_teacher_b, assistant: c.assistant_teacher_b }
  return { head: c.head_teacher_c, assistant: c.assistant_teacher_c }
}

const gradeHint = (grade: string | null): string => {
  if (!grade) return '不適用（走主管 / office_staff 路徑）'
  const { head, assistant } = gradeBase(grade)
  return `${grade} 級：班導 ${head} / 副班導 ${assistant}`
}

onMounted(() => {
  fetchJobTitles()
})
</script>

<template>
  <div v-loading="loadingTitles">
    <div class="section-title">職稱 → 節慶獎金等級</div>
    <p class="desc-text">
      設定每個職稱對應的節慶獎金等級（A/B/C），影響班導/副班導獎金基數選擇。
      非帶班職稱（園長、司機、廚工等）留空即可，走主管 / office_staff 路徑不受此影響。
      美語老師不分等級，一律以「節慶獎金」tab 的美語老師基數
      {{ props.bonusConfig.art_teacher_festival }} 計算。
      下方金額同樣取自「節慶獎金」tab 的現行設定，改那裡即會連動。
    </p>
    <el-table :data="jobTitles" border>
      <el-table-column prop="name" label="職稱" width="200" />
      <el-table-column label="等級">
        <template #default="scope">
          <el-select
            v-model="scope.row.bonus_grade"
            placeholder="（不設定）"
            clearable
            size="small"
            style="width: 200px;"
            @change="updateTitleGrade(scope.row)"
          >
            <el-option label="A 級（有教師證）" value="A" />
            <el-option label="B 級（教保員／助理教保員）" value="B" />
            <el-option label="C 級（非教保員）" value="C" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="說明" min-width="240">
        <template #default="scope">
          <span style="color: var(--el-text-color-secondary); font-size: 12px;">
            {{ gradeHint(scope.row.bonus_grade) }}
          </span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: var(--neutral-300);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 15px;
}
</style>
