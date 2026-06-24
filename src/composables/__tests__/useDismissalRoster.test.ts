import { describe, it, expect } from 'vitest'
import {
  activeCallStudentIds,
  matchStudent,
  buildRoster,
  type RosterStudentInput,
  type ClassroomInput,
  type RosterCallInput,
} from '../useDismissalRoster'

describe('useDismissalRoster 純函式', () => {
  describe('activeCallStudentIds — 進行中通知的學生集合', () => {
    it('只收 pending / acknowledged 的 student_id', () => {
      const calls: RosterCallInput[] = [
        { student_id: 1, status: 'pending' },
        { student_id: 2, status: 'acknowledged' },
        { student_id: 3, status: 'completed' },
        { student_id: 4, status: 'cancelled' },
      ]
      const ids = activeCallStudentIds(calls)
      expect(ids.has(1)).toBe(true)
      expect(ids.has(2)).toBe(true)
      expect(ids.has(3)).toBe(false)
      expect(ids.has(4)).toBe(false)
    })

    it('student_id 缺失或狀態未知則略過，空輸入回空集合', () => {
      const ids = activeCallStudentIds([
        { status: 'pending' },
        { student_id: 5 },
        { student_id: 6, status: 'unknown' },
      ])
      expect(ids.size).toBe(0)
      expect(activeCallStudentIds([]).size).toBe(0)
    })
  })

  describe('matchStudent — 姓名比對', () => {
    it('空 query 視為全中', () => {
      expect(matchStudent('王小明', '')).toBe(true)
      expect(matchStudent('王小明', '   ')).toBe(true)
    })

    it('子字串比對且不分大小寫、去前後空白', () => {
      expect(matchStudent('王小明', '小明')).toBe(true)
      expect(matchStudent('Amy Wang', 'amy')).toBe(true)
      expect(matchStudent('Amy Wang', '  WANG  ')).toBe(true)
      expect(matchStudent('王小明', '小華')).toBe(false)
    })

    it('空姓名不會 throw', () => {
      expect(matchStudent(null, '小明')).toBe(false)
      expect(matchStudent(undefined, '')).toBe(true)
    })
  })

  describe('buildRoster — 分班點名單', () => {
    const classrooms: ClassroomInput[] = [
      { id: 10, name: '小班' },
      { id: 20, name: '中班' },
    ]
    const students: RosterStudentInput[] = [
      { id: 1, name: '王小明', classroom_id: 10 },
      { id: 2, name: '李小美', classroom_id: 10 },
      { id: 3, name: '陳大文', classroom_id: 20 },
    ]

    it('依 classrooms 給定順序分組，回傳群組含班級名', () => {
      const roster = buildRoster(students, classrooms, [], '')
      expect(roster.map(g => g.classroomName)).toEqual(['小班', '中班'])
      // 班級內依姓名排序（與 localeCompare('zh-Hant') 一致，不寫死人為猜測的字序）
      const expectedSmall = students
        .filter(s => s.classroom_id === 10)
        .map(s => s.name)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      expect(roster[0].students.map(s => s.name)).toEqual(expectedSmall)
      expect(roster[1].students.map(s => s.id)).toEqual([3])
    })

    it('標記 notifying：在進行中通知的學生為 true', () => {
      const calls: RosterCallInput[] = [{ student_id: 1, status: 'pending' }]
      const roster = buildRoster(students, classrooms, calls, '')
      const wang = roster[0].students.find(s => s.id === 1)
      const lee = roster[0].students.find(s => s.id === 2)
      expect(wang?.notifying).toBe(true)
      expect(lee?.notifying).toBe(false)
    })

    it('query 篩選後略過沒有任何相符學生的班級', () => {
      const roster = buildRoster(students, classrooms, [], '小')
      // 小班的王小明/李小美含「小」，中班的陳大文不含 → 中班整組消失
      expect(roster.map(g => g.classroomName)).toEqual(['小班'])
      expect(roster[0].students.map(s => s.id).sort()).toEqual([1, 2])
    })

    it('未分班 / 班級不存在的學生歸入「未分班」並殿後', () => {
      const withOrphan: RosterStudentInput[] = [
        ...students,
        { id: 4, name: '林小安', classroom_id: null },
        { id: 5, name: '黃小百', classroom_id: 999 }, // 不存在的班級
      ]
      const roster = buildRoster(withOrphan, classrooms, [], '')
      expect(roster[roster.length - 1].classroomName).toBe('未分班')
      expect(roster[roster.length - 1].students.map(s => s.id).sort()).toEqual([4, 5])
      expect(roster[roster.length - 1].classroomId).toBeNull()
    })

    it('空 students 回空陣列', () => {
      expect(buildRoster([], classrooms, [], '')).toEqual([])
    })

    it('RosterStudent 保留原始 classroomId 供發起 POST 使用', () => {
      const roster = buildRoster(students, classrooms, [], '')
      expect(roster[0].students.find(s => s.id === 1)?.classroomId).toBe(10)
    })
  })
})
