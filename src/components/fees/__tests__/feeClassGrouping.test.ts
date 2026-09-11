/**
 * 班級分組（月表班級導覽列與表格分組共用的純函式）。
 *
 * 核心約定：**分組鍵一律是月表自己的 `classroom_name`**，班級清單（classrooms）
 * 只用來回查年段。改版前的下拉用 classrooms.name 當鍵去比對月表的 classroom_name，
 * staging 上「向日葵」對不上「向日葵班」→ 未收人數靜默歸零，下拉顯示「已收齊」
 * 但表格整班未繳。這裡的測試把該情境固定住。
 */
import { describe, it, expect } from 'vitest'
import {
  buildClassGroups,
  buildClassGroupsFromClassrooms,
  resolveClassCode,
  resolveGradeName,
  UNGRADED_LABEL,
} from '@/components/fees/feeClassGrouping'

const stu = (
  name: string,
  classroom: string | null,
  status: 'unpaid' | 'partial' | 'paid',
) => ({ student_id: name.length + classroom!.length, student_name: name, classroom_name: classroom, status })

const CLASSROOMS = [
  { name: '向日葵', grade_name: '幼幼班' },
  { name: '牡丹', grade_name: '幼幼班' },
  { name: '玫瑰', grade_name: '小班' },
  { name: '百合', grade_name: '中班' },
  { name: '蒲公英', grade_name: '大班' },
  // 跨學期同名班（去重後不應產生第二個年段來源）
  { name: '向日葵', grade_name: '幼幼班' },
]

describe('resolveGradeName（班名 → 年段）', () => {
  it('班名完全相符時取該班年段', () => {
    expect(resolveGradeName('牡丹', CLASSROOMS)).toBe('幼幼班')
  })

  it('月表班名帶「班」字尾、班級清單沒有時仍對得上（staging 實況）', () => {
    expect(resolveGradeName('向日葵班', CLASSROOMS)).toBe('幼幼班')
  })

  it('反向（清單帶「班」、月表沒有）也對得上', () => {
    expect(resolveGradeName('小星星', [{ name: '小星星班', grade_name: '小班' }])).toBe('小班')
  })

  it('查無對應班級回空字串，不猜', () => {
    expect(resolveGradeName('不存在的班', CLASSROOMS)).toBe('')
    expect(resolveGradeName('', CLASSROOMS)).toBe('')
  })
})

describe('buildClassGroups（依年段分組班級）', () => {
  it('分組鍵用月表的 classroom_name，未收人數不會因班名不同而歸零', () => {
    const students = [
      stu('甲', '向日葵班', 'unpaid'),
      stu('乙', '向日葵班', 'partial'),
      stu('丙', '向日葵班', 'paid'),
    ]
    const groups = buildClassGroups(students, CLASSROOMS)
    const cls = groups.flatMap((g) => g.classes).find((c) => c.name === '向日葵班')
    expect(cls).toBeDefined()
    expect(cls!.total).toBe(3)
    expect(cls!.unpaidCount).toBe(2)
    expect(cls!.allPaid).toBe(false)
    // 年段仍由清單回查得到
    expect(groups[0].label).toBe('幼幼班')
  })

  it('年段依大→中→小→幼幼排序，班級在年段內依首次出現順序', () => {
    const students = [
      stu('甲', '蒲公英', 'unpaid'),
      stu('乙', '玫瑰', 'unpaid'),
      stu('丙', '牡丹', 'unpaid'),
      stu('丁', '百合', 'unpaid'),
      stu('戊', '向日葵', 'unpaid'),
    ]
    const groups = buildClassGroups(students, CLASSROOMS)
    expect(groups.map((g) => g.label)).toEqual(['大班', '中班', '小班', '幼幼班'])
    expect(groups.at(-1)!.classes.map((c) => c.name)).toEqual(['牡丹', '向日葵'])
  })

  it('只列月表出現的班；班級清單有但當月無費用單的班不出現', () => {
    const students = [stu('甲', '牡丹', 'unpaid')]
    const groups = buildClassGroups(students, CLASSROOMS)
    expect(groups.flatMap((g) => g.classes).map((c) => c.name)).toEqual(['牡丹'])
  })

  it('查無年段的班歸「未分年段」並排在最後，而不是從清單消失', () => {
    const students = [
      stu('甲', '牡丹', 'unpaid'),
      stu('乙', '查無此班', 'unpaid'),
      stu('丙', '蒲公英', 'paid'),
    ]
    const groups = buildClassGroups(students, CLASSROOMS)
    expect(groups.at(-1)!.label).toBe(UNGRADED_LABEL)
    expect(groups.at(-1)!.classes.map((c) => c.name)).toEqual(['查無此班'])
  })

  it('classroom_name 為空的學生歸「未分班」而不是被丟掉', () => {
    const students = [
      { student_id: 1, student_name: '甲', classroom_name: null, status: 'unpaid' as const },
      stu('乙', '牡丹', 'unpaid'),
    ]
    const groups = buildClassGroups(students, CLASSROOMS)
    const all = groups.flatMap((g) => g.classes)
    expect(all.reduce((a, c) => a + c.total, 0)).toBe(2)
    expect(all.some((c) => c.name === '')).toBe(true)
  })

  it('年段層彙總＝該年段各班相加', () => {
    const students = [
      stu('甲', '牡丹', 'unpaid'),
      stu('乙', '向日葵', 'paid'),
      stu('丙', '向日葵', 'partial'),
    ]
    const [g] = buildClassGroups(students, CLASSROOMS)
    expect(g.total).toBe(3)
    expect(g.unpaidCount).toBe(2)
  })

  it('全班繳清時 allPaid 為真（供自動收合判斷）', () => {
    const students = [stu('甲', '玫瑰', 'paid'), stu('乙', '玫瑰', 'paid')]
    const cls = buildClassGroups(students, CLASSROOMS).flatMap((g) => g.classes)[0]
    expect(cls.allPaid).toBe(true)
    expect(cls.unpaidCount).toBe(0)
  })

  it('無學生時回空陣列', () => {
    expect(buildClassGroups([], CLASSROOMS)).toEqual([])
  })
})

describe('buildClassGroupsFromClassrooms（逐筆檢視：只有班級清單，沒有整月資料）', () => {
  it('直接以班級清單分年段，跨學期同名班去重', () => {
    const groups = buildClassGroupsFromClassrooms(CLASSROOMS)
    expect(groups.map((g) => g.label)).toEqual(['大班', '中班', '小班', '幼幼班'])
    expect(groups.at(-1)!.classes.map((c) => c.name)).toEqual(['向日葵', '牡丹'])
  })

  it('不帶人數（伺服器分頁算不出整月未收），計數一律為 0', () => {
    const cls = buildClassGroupsFromClassrooms(CLASSROOMS).flatMap((g) => g.classes)
    expect(cls.every((c) => c.total === 0 && c.unpaidCount === 0)).toBe(true)
  })

  it('沒有年段的班歸未分年段，空班名略過', () => {
    const groups = buildClassGroupsFromClassrooms([
      { name: '無年段班', grade_name: null },
      { name: '', grade_name: '小班' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe(UNGRADED_LABEL)
    expect(groups[0].classes.map((c) => c.name)).toEqual(['無年段班'])
  })
})

/**
 * 班級代號排序：園所的班序是代號（大1/中2/小1…）而不是資料出現順序。
 * staging 實況：「玫瑰(小2)」排在「芙蓉(小1)」前面、「茉莉(中3)」排在
 * 「薔薇(中2)」前面——因為月表的班級順序來自當月費用單的出現序。
 */
const CODED_CLASSROOMS = [
  { name: '天堂鳥', grade_name: '大班', class_code: '大1' },
  { name: '櫻花', grade_name: '大班', class_code: '大2' },
  { name: '蒲公英', grade_name: '大班', class_code: '大3' },
  { name: '百合', grade_name: '中班', class_code: '中1' },
  { name: '薔薇', grade_name: '中班', class_code: '中2' },
  { name: '茉莉', grade_name: '中班', class_code: '中3' },
  { name: '芙蓉', grade_name: '小班', class_code: '小1' },
  { name: '玫瑰', grade_name: '小班', class_code: '小2' },
]

describe('resolveClassCode（班名 → 班級代號）', () => {
  it('班名完全相符時取該班代號', () => {
    expect(resolveClassCode('玫瑰', CODED_CLASSROOMS)).toBe('小2')
  })

  it('月表班名帶「班」字尾時仍對得上（與年段回查同一套鬆散比對）', () => {
    expect(resolveClassCode('玫瑰班', CODED_CLASSROOMS)).toBe('小2')
  })

  it('查無班級或該班沒填代號時回空字串，不猜', () => {
    expect(resolveClassCode('查無此班', CODED_CLASSROOMS)).toBe('')
    expect(resolveClassCode('向日葵', CLASSROOMS)).toBe('')
    expect(resolveClassCode('', CODED_CLASSROOMS)).toBe('')
  })
})

describe('班級代號排序', () => {
  it('年段內依代號排序，不受月表出現順序影響', () => {
    const students = [
      stu('甲', '玫瑰', 'unpaid'), // 小2 先出現
      stu('乙', '芙蓉', 'unpaid'), // 小1 後出現
      stu('丙', '茉莉', 'unpaid'), // 中3 先出現
      stu('丁', '薔薇', 'unpaid'), // 中2
      stu('戊', '百合', 'unpaid'), // 中1
    ]
    const groups = buildClassGroups(students, CODED_CLASSROOMS)
    expect(groups.map((g) => g.label)).toEqual(['中班', '小班'])
    expect(groups[0].classes.map((c) => c.name)).toEqual(['百合', '薔薇', '茉莉'])
    expect(groups[1].classes.map((c) => c.name)).toEqual(['芙蓉', '玫瑰'])
  })

  it('月表班名帶「班」字尾也照代號排（staging 實況）', () => {
    const students = [stu('甲', '玫瑰班', 'unpaid'), stu('乙', '芙蓉班', 'unpaid')]
    const groups = buildClassGroups(students, CODED_CLASSROOMS)
    expect(groups[0].classes.map((c) => c.name)).toEqual(['芙蓉班', '玫瑰班'])
  })

  it('代號的數字以數值比大小，10 排在 9 後面而不是 1 後面', () => {
    const classrooms = [
      { name: 'A', grade_name: '小班', class_code: '小1' },
      { name: 'B', grade_name: '小班', class_code: '小9' },
      { name: 'C', grade_name: '小班', class_code: '小10' },
    ]
    const students = [stu('甲', 'C', 'unpaid'), stu('乙', 'B', 'unpaid'), stu('丙', 'A', 'unpaid')]
    const [g] = buildClassGroups(students, classrooms)
    expect(g.classes.map((c) => c.name)).toEqual(['A', 'B', 'C'])
  })

  it('沒填代號的班沉到該年段最後，彼此維持原出現順序', () => {
    const classrooms = [
      ...CODED_CLASSROOMS,
      { name: '待編班', grade_name: '小班', class_code: null },
      { name: '新設班', grade_name: '小班' },
    ]
    const students = [
      stu('甲', '待編班', 'unpaid'),
      stu('乙', '玫瑰', 'unpaid'),
      stu('丙', '新設班', 'unpaid'),
      stu('丁', '芙蓉', 'unpaid'),
    ]
    const [g] = buildClassGroups(students, classrooms)
    expect(g.classes.map((c) => c.name)).toEqual(['芙蓉', '玫瑰', '待編班', '新設班'])
  })

  it('班級代號帶進 ClassGroup，供消費端顯示或再排序', () => {
    const [g] = buildClassGroups([stu('甲', '玫瑰班', 'unpaid')], CODED_CLASSROOMS)
    expect(g.classes[0].classCode).toBe('小2')
  })

  it('逐筆檢視（只有班級清單）同樣依代號排，不受清單順序影響', () => {
    const shuffled = [CODED_CLASSROOMS[7], CODED_CLASSROOMS[6], CODED_CLASSROOMS[5], CODED_CLASSROOMS[3]]
    const groups = buildClassGroupsFromClassrooms(shuffled)
    expect(groups.map((g) => g.label)).toEqual(['中班', '小班'])
    expect(groups[0].classes.map((c) => c.name)).toEqual(['百合', '茉莉'])
    expect(groups[1].classes.map((c) => c.name)).toEqual(['芙蓉', '玫瑰'])
  })

  it('未分年段桶內混不同年段的代號時，仍依大→中→小→幼幼再依號碼排', () => {
    const classrooms = [
      { name: 'X', class_code: '小1' },
      { name: 'Y', class_code: '大2' },
      { name: 'Z', class_code: '幼1' },
      { name: 'W', class_code: '大1' },
    ]
    const groups = buildClassGroupsFromClassrooms(classrooms)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe(UNGRADED_LABEL)
    expect(groups[0].classes.map((c) => c.name)).toEqual(['W', 'Y', 'X', 'Z'])
  })
})
