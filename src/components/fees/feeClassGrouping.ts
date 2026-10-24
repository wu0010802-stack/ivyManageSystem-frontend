/**
 * 班級分組：月表的班級導覽列（FeeClassRail）與表格分組共用的純函式。
 *
 * ## 分組鍵一律是月表自己的 `classroom_name`
 *
 * 改版前的班級下拉拿 `classrooms.name` 當鍵去比對月表的 `classroom_name`，
 * staging 上前者是「向日葵」、後者是「向日葵班」，字串對不上 → 未收人數靜默
 * 歸零，下拉顯示「已收齊」但表格裡整班未繳。因此這裡反過來：**班名由月表資料
 * 決定**（列得出來的一定有帳可看），班級清單只用來回查年段；查不到年段的班歸
 * 「未分年段」排在最後，而不是從清單消失。
 *
 * 年段順序固定為大→中→小→幼幼（園所點名／收費的慣用序，大班在最上面）；
 * 不在表列內的年段依首次出現順序接在後面。
 *
 * ## 年段內的班序＝班級代號
 *
 * 園所自己的班序是代號（`大1`／`中2`／`小1`…），不是資料出現順序。月表的班級
 * 順序若沿用當月費用單的出現序，畫面上就會出現「玫瑰(小2) 排在芙蓉(小1) 前面」
 * 這種對不上園所慣用序的排法。因此年段內一律依 `classrooms.class_code` 排；
 * 沒填代號的班沉到該年段最後，彼此維持原出現順序（不猜它該排哪）。
 */

export interface ClassroomLite {
  name?: string | null
  grade_name?: string | null
  /** 班級代號（`大1`／`中2`…）；年段內的排序依據 */
  class_code?: string | null
}

/** 分組只看得到這幾個欄位，月表與逐筆的列型別都相容 */
export interface GroupableStudent {
  classroom_name?: string | null
  status?: string | null
}

export interface ClassGroup {
  /** 月表回傳的班名；空字串＝該生未分班 */
  name: string
  /** 顯示用班名（未分班顯示「未分班」） */
  label: string
  gradeLabel: string
  /** 班級代號（`小2`）；班級清單查不到或沒填時為空字串 */
  classCode: string
  total: number
  unpaidCount: number
  allPaid: boolean
}

export interface GradeGroup {
  key: string
  label: string
  classes: ClassGroup[]
  total: number
  unpaidCount: number
}

export const UNGRADED_LABEL = '未分年段'
export const UNASSIGNED_CLASS_LABEL = '未分班'

/** 園所年段由大到小；比對用去尾「班」後的字串，容忍「幼幼」／「幼幼班」兩種寫法 */
const GRADE_ORDER = ['大', '中', '小', '幼幼']

const stripSuffix = (s: string) => s.replace(/班$/, '')

/**
 * 年段 token（`大`／`中`／`小`／`幼幼`）→ 序號，查不到排在所有已知年段之後。
 * 代號前綴只寫一個「幼」字（`幼1`）也要對得上「幼幼」，故完全相符不中時
 * 再放寬成前綴互相包含。
 */
function gradeTokenRank(token: string): number {
  if (!token) return GRADE_ORDER.length
  const exact = GRADE_ORDER.indexOf(token)
  if (exact !== -1) return exact
  const loose = GRADE_ORDER.findIndex((g) => g.startsWith(token) || token.startsWith(g))
  return loose === -1 ? GRADE_ORDER.length : loose
}

function gradeRank(label: string): number {
  return gradeTokenRank(stripSuffix(label))
}

/**
 * 代號比較：`大1`／`中2`／`小10`。先比年段前綴（園所序大→中→小→幼幼，
 * 同一年段內恆相同、只有未分年段桶才會混），再比號碼**數值**——`小10` 要排在
 * `小9` 後面而不是 `小1` 後面。
 */
function compareClassCode(a: string, b: string): number {
  const prefixA = a.replace(/\d+$/, '')
  const prefixB = b.replace(/\d+$/, '')
  if (prefixA !== prefixB) {
    const rankA = gradeTokenRank(prefixA)
    const rankB = gradeTokenRank(prefixB)
    if (rankA !== rankB) return rankA - rankB
    return prefixA.localeCompare(prefixB, 'zh-Hant')
  }
  return a.localeCompare(b, 'zh-Hant', { numeric: true })
}

/**
 * 班名 → 班級清單中的該班。先試完全相符，再試去掉「班」字尾後相符（月表與
 * 班級清單對同一個班常有一邊帶「班」的差異）。查不到回 undefined，不猜。
 */
function findClassroom(
  className: string,
  classrooms: readonly ClassroomLite[],
): ClassroomLite | undefined {
  if (!className) return undefined
  const exact = classrooms.find((c) => (c.name ?? '') === className)
  if (exact) return exact
  const stripped = stripSuffix(className)
  return classrooms.find((c) => stripSuffix(c.name ?? '') === stripped)
}

/** 班名 → 年段名。查不到回空字串，不猜。 */
export function resolveGradeName(
  className: string,
  classrooms: readonly ClassroomLite[],
): string {
  return findClassroom(className, classrooms)?.grade_name ?? ''
}

/** 班名 → 班級代號。查不到或該班沒填代號時回空字串，不猜。 */
export function resolveClassCode(
  className: string,
  classrooms: readonly ClassroomLite[],
): string {
  return findClassroom(className, classrooms)?.class_code ?? ''
}

interface ClassAgg {
  total: number
  unpaidCount: number
  order: number
}

/**
 * 依年段分組班級。年段的出現順序以 entries 的首次出現為準，年段之間再依
 * GRADE_ORDER 穩定排序（未分年段永遠最後）；年段內的班依班級代號排序。
 */
function groupByGrade(
  byClass: Map<string, ClassAgg>,
  classrooms: readonly ClassroomLite[],
): GradeGroup[] {
  const grades = new Map<string, GradeGroup & { order: number }>()
  byClass.forEach((agg, name) => {
    const classroom = findClassroom(name, classrooms)
    const gradeLabel = classroom?.grade_name ?? ''
    const key = gradeLabel || UNGRADED_LABEL
    let grade = grades.get(key)
    if (!grade) {
      grade = {
        key,
        label: key,
        classes: [],
        total: 0,
        unpaidCount: 0,
        order: grades.size,
      }
      grades.set(key, grade)
    }
    grade.classes.push({
      name,
      label: name || UNASSIGNED_CLASS_LABEL,
      gradeLabel,
      classCode: classroom?.class_code ?? '',
      total: agg.total,
      unpaidCount: agg.unpaidCount,
      allPaid: agg.unpaidCount === 0,
    })
    grade.total += agg.total
    grade.unpaidCount += agg.unpaidCount
  })

  // 班級在年段內依班級代號；沒填代號的沉到最後、彼此維持首次出現順序
  const classOrder = (name: string) => byClass.get(name)?.order ?? 0
  grades.forEach((g) =>
    g.classes.sort((a, b) => {
      if (a.classCode && b.classCode) {
        const byCode = compareClassCode(a.classCode, b.classCode)
        if (byCode !== 0) return byCode
      } else if (Boolean(a.classCode) !== Boolean(b.classCode)) {
        return a.classCode ? -1 : 1
      }
      return classOrder(a.name) - classOrder(b.name)
    }),
  )

  return [...grades.values()]
    .sort((a, b) => {
      const ua = a.key === UNGRADED_LABEL ? 1 : 0
      const ub = b.key === UNGRADED_LABEL ? 1 : 0
      if (ua !== ub) return ua - ub
      const ra = gradeRank(a.label)
      const rb = gradeRank(b.label)
      if (ra !== rb) return ra - rb
      return a.order - b.order
    })
    .map(({ order: _order, ...g }) => g)
}

/** 月表：以整月 per-student 聚合統計每班人數與未收人數 */
export function buildClassGroups(
  students: readonly GroupableStudent[],
  classrooms: readonly ClassroomLite[],
): GradeGroup[] {
  const byClass = new Map<string, ClassAgg>()
  students.forEach((s) => {
    const name = s.classroom_name ?? ''
    const cur = byClass.get(name) ?? { total: 0, unpaidCount: 0, order: byClass.size }
    cur.total += 1
    if (s.status !== 'paid') cur.unpaidCount += 1
    byClass.set(name, cur)
  })
  return groupByGrade(byClass, classrooms)
}

/**
 * 逐筆檢視：只有跨學期班級清單、沒有整月資料（列表走伺服器分頁），
 * 因此只分年段、不帶人數——消費端請關掉 `show-counts`，別畫出恆為 0 的計數。
 */
export function buildClassGroupsFromClassrooms(
  classrooms: readonly ClassroomLite[],
): GradeGroup[] {
  const byClass = new Map<string, ClassAgg>()
  classrooms.forEach((c) => {
    const name = c.name ?? ''
    if (!name || byClass.has(name)) return
    byClass.set(name, { total: 0, unpaidCount: 0, order: byClass.size })
  })
  return groupByGrade(byClass, classrooms)
}
