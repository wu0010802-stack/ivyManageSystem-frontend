import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * 招生入學頁的「入學學年／學期」單一篩選狀態（2026-09-06 招生流程審查）。
 *
 * 原本漏斗看板、訪視明細、名額規劃、統計分析各自維護一份，寫法幾乎一樣卻互不
 * 相通：在看板挑了 115 上學期，切到明細又跳回全部，使用者以為資料不見了。
 *
 * 這裡把它收成一份並寫進 URL query（sy／sem），順帶讓網址可以分享、重整不掉狀態。
 * `semester` 允許 null＝整學年（看板與明細支援；名額規劃需要具體學期，自行退回上學期）。
 */
export type TermSemester = 1 | 2 | null

export interface AdmissionsTermFilter {
  schoolYear: number | null
  semester: TermSemester
}

function parseYear(raw: unknown): number | null {
  const n = Number(raw)
  // 民國學年三位數；超出範圍的 query 一律當沒帶，不讓網址塞爆篩選
  return Number.isInteger(n) && n >= 100 && n <= 200 ? n : null
}

function parseSemester(raw: unknown): TermSemester {
  const n = Number(raw)
  return n === 1 || n === 2 ? (n as 1 | 2) : null
}

export function useAdmissionsTermFilter() {
  const route = useRoute()
  const router = useRouter()

  const schoolYear = ref<number | null>(parseYear(route.query.sy))
  const semester = ref<TermSemester>(parseSemester(route.query.sem))

  /** 寫回 URL：值為 null 時移除該 query，避免留下 `sy=` 這種空字串。 */
  function syncToUrl(): void {
    const query = { ...route.query }
    if (schoolYear.value == null) delete query.sy
    else query.sy = String(schoolYear.value)
    if (semester.value == null) delete query.sem
    else query.sem = String(semester.value)
    void router.replace({ query })
  }

  watch([schoolYear, semester], syncToUrl)

  function setTerm(next: Partial<AdmissionsTermFilter>): void {
    if ('schoolYear' in next) schoolYear.value = next.schoolYear ?? null
    if ('semester' in next) semester.value = next.semester ?? null
  }

  /** 名額規劃這類需要具體學期的面板用；沒選學期時退回上學期。 */
  const semesterOrFirst = computed<1 | 2>(() => semester.value ?? 1)

  return { schoolYear, semester, semesterOrFirst, setTerm }
}
