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

  it('年段依幼幼→小→中→大排序，班級在年段內依首次出現順序', () => {
    const students = [
      stu('甲', '蒲公英', 'unpaid'),
      stu('乙', '玫瑰', 'unpaid'),
      stu('丙', '牡丹', 'unpaid'),
      stu('丁', '百合', 'unpaid'),
      stu('戊', '向日葵', 'unpaid'),
    ]
    const groups = buildClassGroups(students, CLASSROOMS)
    expect(groups.map((g) => g.label)).toEqual(['幼幼班', '小班', '中班', '大班'])
    expect(groups[0].classes.map((c) => c.name)).toEqual(['牡丹', '向日葵'])
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
    expect(groups.map((g) => g.label)).toEqual(['幼幼班', '小班', '中班', '大班'])
    expect(groups[0].classes.map((c) => c.name)).toEqual(['向日葵', '牡丹'])
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
