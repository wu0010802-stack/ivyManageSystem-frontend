import { describe, it, expect } from 'vitest'
import {
  activeCallStudentIds,
  matchStudent,
  buildRoster,
  classroomOptionsForStudents,
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

    it('classroom_id 為 null 的學生歸入「未分班」並殿後', () => {
      const withOrphan: RosterStudentInput[] = [
        ...students,
        { id: 4, name: '林小安', classroom_id: null },
      ]
      const roster = buildRoster(withOrphan, classrooms, [], '')
      const last = roster[roster.length - 1]
      expect(last.classroomName).toBe('未分班')
      expect(last.kind).toBe('unassigned')
      expect(last.students.map(s => s.id)).toEqual([4])
      expect(last.classroomId).toBeNull()
    })

    // 根因迴歸（2026-07-30）：/classrooms 預設只回當期學期的班級，暑假期間學生已編入
    // 下個學年的班 → 班級查不到就被誤標「未分班」，畫面上 196 位在籍學生全成孤兒。
    // 「查不到班級」≠「沒有班級」，必須分開，且不可擋掉發起通知。
    it('有 classroom_id 但班級不在清單中 → 歸「其他班級」，不得混入「未分班」', () => {
      const withOffTerm: RosterStudentInput[] = [
        ...students,
        { id: 5, name: '黃小百', classroom_id: 999 }, // 清單裡查不到的班級
      ]
      const roster = buildRoster(withOffTerm, classrooms, [], '')
      const group = roster.find(g => g.kind === 'unknown')
      expect(group).toBeDefined()
      expect(group?.classroomName).toBe('其他班級')
      expect(group?.students.map(s => s.id)).toEqual([5])
      expect(roster.some(g => g.kind === 'unassigned')).toBe(false)
    })

    it('查不到班級的學生仍保留原始 classroomId，才發得出通知', () => {
      const roster = buildRoster(
        [{ id: 5, name: '黃小百', classroom_id: 999 }],
        classrooms,
        [],
        '',
      )
      expect(roster[0].students[0].classroomId).toBe(999)
    })

    it('已知班級 → 其他班級 → 未分班 依序排列', () => {
      const mixed: RosterStudentInput[] = [
        ...students,
        { id: 4, name: '林小安', classroom_id: null },
        { id: 5, name: '黃小百', classroom_id: 999 },
      ]
      const roster = buildRoster(mixed, classrooms, [], '')
      expect(roster.map(g => g.kind)).toEqual([
        'classroom',
        'classroom',
        'unknown',
        'unassigned',
      ])
    })

    it('已知班級群組標記 kind=classroom', () => {
      const roster = buildRoster(students, classrooms, [], '')
      expect(roster.every(g => g.kind === 'classroom')).toBe(true)
    })

    it('空 students 回空陣列', () => {
      expect(buildRoster([], classrooms, [], '')).toEqual([])
    })

    it('RosterStudent 保留原始 classroomId 供發起 POST 使用', () => {
      const roster = buildRoster(students, classrooms, [], '')
      expect(roster[0].students.find(s => s.id === 1)?.classroomId).toBe(10)
    })
  })

  // 班級清單改抓跨學期（current_only=false）後，篩選下拉不能把歷年空班全倒出來，
  // 且跨學年同名班（如 114-2 與 115-1 都有「向日葵」）必須能分辨。
  describe('classroomOptionsForStudents — 班級篩選選項', () => {
    const classrooms: ClassroomInput[] = [
      { id: 10, name: '小班' },
      { id: 20, name: '中班' },
      { id: 30, name: '大班' },
    ]

    it('只列出有在籍學生的班級', () => {
      const students: RosterStudentInput[] = [
        { id: 1, name: '王小明', classroom_id: 10 },
        { id: 2, name: '陳大文', classroom_id: 30 },
      ]
      const options = classroomOptionsForStudents(students, classrooms)
      expect(options.map(o => o.id)).toEqual([10, 30])
    })

    it('依 classrooms 給定順序輸出，班名不重複時 label 就是班名', () => {
      const students: RosterStudentInput[] = [
        { id: 1, name: '陳大文', classroom_id: 30 },
        { id: 2, name: '王小明', classroom_id: 10 },
      ]
      const options = classroomOptionsForStudents(students, classrooms)
      expect(options.map(o => o.label)).toEqual(['小班', '大班'])
    })

    it('跨學年同名班級的 label 補上學期標籤以便分辨', () => {
      const sameName: ClassroomInput[] = [
        { id: 24, name: '向日葵', semester_label: '114學年度下學期' },
        { id: 22, name: '向日葵', semester_label: '115學年度上學期' },
      ]
      const students: RosterStudentInput[] = [
        { id: 1, name: '王小明', classroom_id: 24 },
        { id: 2, name: '李小美', classroom_id: 22 },
      ]
      const options = classroomOptionsForStudents(students, sameName)
      expect(options.map(o => o.label)).toEqual([
        '向日葵（114學年度下學期）',
        '向日葵（115學年度上學期）',
      ])
    })

    it('同名但缺 semester_label 時退回 school_year/semester 組字', () => {
      const sameName: ClassroomInput[] = [
        { id: 24, name: '向日葵', school_year: 114, semester: 2 },
        { id: 22, name: '向日葵', school_year: 115, semester: 1 },
      ]
      const students: RosterStudentInput[] = [
        { id: 1, name: '王小明', classroom_id: 24 },
        { id: 2, name: '李小美', classroom_id: 22 },
      ]
      const options = classroomOptionsForStudents(students, sameName)
      expect(options.map(o => o.label)).toEqual([
        '向日葵（114-2）',
        '向日葵（115-1）',
      ])
    })

    it('沒有在籍學生時回空陣列', () => {
      expect(classroomOptionsForStudents([], classrooms)).toEqual([])
    })
  })
})
