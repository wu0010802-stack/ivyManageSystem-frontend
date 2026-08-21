import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosBoard from '../DismissalPosBoard.vue'
import type { RosterStudentInput, ClassroomInput } from '@/composables/useDismissalRoster'
import type { DismissalCallView } from '@/composables/useDismissalUrgency'

const CLASSROOMS: ClassroomInput[] = [
  { id: 1, name: '陽光班' },
  { id: 2, name: '星星班' },
]

const STUDENTS: RosterStudentInput[] = [
  { id: 101, name: '王小明', classroom_id: 1 },
  { id: 102, name: '陳小華', classroom_id: 1 },
  { id: 201, name: '林小美', classroom_id: 2 },
]

function mountBoard(calls: DismissalCallView[] = []) {
  return mount(DismissalPosBoard, {
    props: { classrooms: CLASSROOMS, students: STUDENTS, calls },
  })
}

describe('DismissalPosBoard', () => {
  it('掛載後 classrooms 非空時，selectedId 自動等於第一筆班級 id（左欄第一項為選中態、中欄渲染第一班學生）', () => {
    const w = mountBoard()
    const railItems = w.findAll('.pos-classroom-rail__item')
    expect(railItems[0].classes()).toContain('is-active')
    expect(railItems[1].classes()).not.toContain('is-active')
    // 中欄應渲染陽光班（classroom_id=1）的兩位學生，不含星星班的林小美
    const names = w.findAll('.pos-student-card__name').map(n => n.text())
    expect(names).toEqual(['王小明', '陳小華'])
  })

  it('點擊中欄任一 unpicked 卡片後，右欄立即出現對應 staging 佇列卡（含倒數條）', async () => {
    const w = mountBoard()
    const card = w.find('.pos-student-card')
    await card.trigger('click')

    const queueCards = w.findAll('.pos-queue-card')
    expect(queueCards).toHaveLength(1)
    expect(queueCards[0].find('.pos-queue-card__name').text()).toBe('王小明')
    expect(queueCards[0].find('.pos-countdown-bar__track').exists()).toBe(true)
  })

  it('quick-dispatch 補上目前選中班級的 classroomId/classroomName（不是單純透傳 {id,name}）', async () => {
    const w = mountBoard()
    const card = w.find('.pos-student-card')
    await card.trigger('click')

    const queueCard = w.find('.pos-queue-card')
    expect(queueCard.find('.pos-queue-card__room').text()).toBe('陽光班')
  })

  it('切換左欄班級不影響右欄佇列清單內容（D6）', async () => {
    const w = mountBoard()
    // 先在陽光班加入一位到佇列
    await w.find('.pos-student-card').trigger('click')
    expect(w.findAll('.pos-queue-card')).toHaveLength(1)

    // 切到星星班
    const railItems = w.findAll('.pos-classroom-rail__item')
    await railItems[1].trigger('click')

    // 中欄應該換成星星班學生
    const names = w.findAll('.pos-student-card__name').map(n => n.text())
    expect(names).toEqual(['林小美'])
    // 右欄佇列內容不變（仍是陽光班那位王小明，不因切班而清空或改變）
    const queueCards = w.findAll('.pos-queue-card')
    expect(queueCards).toHaveLength(1)
    expect(queueCards[0].find('.pos-queue-card__name').text()).toBe('王小明')
  })

  it('classrooms 為空陣列時不噴錯，selectedId 維持 null（中欄顯示空狀態）', () => {
    const w = mount(DismissalPosBoard, {
      props: { classrooms: [], students: [], calls: [] },
    })
    expect(w.find('.pos-classroom-rail__item').exists()).toBe(false)
    expect(w.find('.pos-student-grid__empty').exists()).toBe(true)
  })

  it('傳入的 calls 驅動中欄狀態徽章，但 completed 記錄不會出現在右欄佇列（D5：右欄只顯示還在流程中的 pending/acknowledged，由 useDismissalPosQueue 依 ACTIVE_STATUSES 過濾，不靠呼叫端先篩過）', () => {
    const calls: DismissalCallView[] = [
      {
        id: 1,
        student_id: 101,
        student_name: '王小明',
        classroom_name: '陽光班',
        status: 'completed',
      },
    ]
    const w = mountBoard(calls)
    // 中欄：guardian_picked（completed call）→ 卡片降階、不可再點擊
    expect(w.find('.pos-student-card.is-resolved').exists()).toBe(true)
    // 右欄：completed 已經放學完成，不該再顯示成「等待確認」的進行中佇列卡
    expect(w.findAll('.pos-queue-card')).toHaveLength(0)
  })

  it('傳入 pending 的 call 會同時出現在右欄佇列（與上一則 completed 案例對照，證明過濾的是狀態而非整份 calls）', () => {
    const calls: DismissalCallView[] = [
      {
        id: 2,
        student_id: 101,
        student_name: '王小明',
        classroom_name: '陽光班',
        status: 'pending',
      },
    ]
    const w = mountBoard(calls)
    const queueCards = w.findAll('.pos-queue-card')
    expect(queueCards).toHaveLength(1)
    expect(queueCards[0].find('.pos-queue-card__name').text()).toBe('王小明')
  })
})
