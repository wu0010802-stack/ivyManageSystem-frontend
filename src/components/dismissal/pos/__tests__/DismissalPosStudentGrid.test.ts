import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosStudentGrid from '../DismissalPosStudentGrid.vue'

const CLASSROOMS = [
  { id: 1, name: '陽光班' },
  { id: 2, name: '星星班' },
]

const STUDENTS = [
  { id: 101, name: '王小明', classroom_id: 1 },
  { id: 102, name: '李小美', classroom_id: 1 },
  { id: 103, name: '陳大文', classroom_id: 1 },
  { id: 201, name: '林小華', classroom_id: 2 },
]

describe('DismissalPosStudentGrid', () => {
  it('只渲染 selectedClassroomId 對應班級的在籍學生（重用 buildRoster 分班）', () => {
    const w = mount(DismissalPosStudentGrid, {
      props: { selectedClassroomId: 1, students: STUDENTS, classrooms: CLASSROOMS, calls: [] },
    })
    const cards = w.findAll('.pos-student-card')
    expect(cards).toHaveLength(3)
    expect(w.text()).not.toContain('林小華')
  })

  it('切換 selectedClassroomId 後渲染的學生清單即時更新', async () => {
    const w = mount(DismissalPosStudentGrid, {
      props: { selectedClassroomId: 1, students: STUDENTS, classrooms: CLASSROOMS, calls: [] },
    })
    expect(w.findAll('.pos-student-card')).toHaveLength(3)

    await w.setProps({ selectedClassroomId: 2 })

    const cards = w.findAll('.pos-student-card')
    expect(cards).toHaveLength(1)
    expect(w.text()).toContain('林小華')
  })

  it('selectedClassroomId 為 null 時不渲染任何卡片，顯示空狀態', () => {
    const w = mount(DismissalPosStudentGrid, {
      props: { selectedClassroomId: null, students: STUDENTS, classrooms: CLASSROOMS, calls: [] },
    })
    expect(w.findAll('.pos-student-card')).toHaveLength(0)
    expect(w.find('.pos-student-grid__empty').exists()).toBe(true)
  })

  it('排序結果符合 T-002 sortWeight：unpicked 在前，guardian_picked（completed call）殿後', () => {
    const w = mount(DismissalPosStudentGrid, {
      props: {
        selectedClassroomId: 1,
        students: STUDENTS,
        classrooms: CLASSROOMS,
        calls: [{ student_id: 102, status: 'completed' }],
      },
    })
    const names = w.findAll('.pos-student-card__name').map(n => n.text())
    // 102 李小美有 completed call → guardian_picked，排最後；101/103 仍是 unpicked，排前面
    expect(names.indexOf('李小美')).toBe(names.length - 1)
    expect(names).toContain('王小明')
    expect(names).toContain('陳大文')
  })

  it('pending call 不影響排序（仍算 unpicked，排在前面）', () => {
    const w = mount(DismissalPosStudentGrid, {
      props: {
        selectedClassroomId: 1,
        students: STUDENTS,
        classrooms: CLASSROOMS,
        calls: [{ student_id: 102, status: 'pending' }],
      },
    })
    const names = w.findAll('.pos-student-card__name').map(n => n.text())
    expect(names.indexOf('李小美')).toBeLessThan(3)
  })

  it('點擊 unpicked 卡片會轉發 quick-dispatch 事件', async () => {
    const w = mount(DismissalPosStudentGrid, {
      props: { selectedClassroomId: 1, students: STUDENTS, classrooms: CLASSROOMS, calls: [] },
    })
    await w.findAll('.pos-student-card')[0].trigger('click')
    expect(w.emitted('quick-dispatch')).toBeTruthy()
    const [emittedStudent] = (w.emitted('quick-dispatch') as unknown[][])[0]
    expect((emittedStudent as { id: number }).id).toBe(101)
  })

  it('選中班級沒有在籍學生時顯示空狀態', () => {
    const w = mount(DismissalPosStudentGrid, {
      props: { selectedClassroomId: 999, students: STUDENTS, classrooms: CLASSROOMS, calls: [] },
    })
    expect(w.findAll('.pos-student-card')).toHaveLength(0)
    expect(w.find('.pos-student-grid__empty').exists()).toBe(true)
  })
})
