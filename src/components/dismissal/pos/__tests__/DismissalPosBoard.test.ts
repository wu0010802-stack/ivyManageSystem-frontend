import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({
  getDismissalPosStatus: vi.fn(),
  markPosBus: vi.fn(),
  markPosLeave: vi.fn(),
  unmarkPosBus: vi.fn(),
  unmarkPosLeave: vi.fn(),
}))
vi.mock('@/api/dismissalCalls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/dismissalCalls')>()),
  ...api,
}))
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

  it('傳入的 calls 驅動中欄狀態徽章；completed 記錄保留在右欄佇列，但以 done（已放學）卡呈現、不畫成「等待確認」', () => {
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
    // 中欄：guardian_picked（completed call）→ 卡片降階（淡灰）但仍可再次點擊通知
    const studentCard = w.find('.pos-student-card.is-resolved')
    expect(studentCard.exists()).toBe(true)
    expect(studentCard.classes()).toContain('is-redispatchable')
    // 右欄：completed 保留為 done 卡供回顧，不顯示成「等待確認」的進行中佇列卡
    const queueCards = w.findAll('.pos-queue-card')
    expect(queueCards).toHaveLength(1)
    expect(queueCards[0].classes()).toContain('pos-queue-card--done')
    expect(queueCards[0].find('.pos-queue-card__waiting-flag').exists()).toBe(false)
  })

  it('中欄「家長已接送」的淡灰卡片點擊後仍可再次發起通知（staging 卡進入右欄）', async () => {
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
    await w.find('.pos-student-card.is-resolved').trigger('click')

    // 再次通知進入 5 秒倒數：右欄同一學生只顯示 staging 卡（舊的 done 卡讓位）
    const queueCards = w.findAll('.pos-queue-card')
    expect(queueCards).toHaveLength(1)
    expect(queueCards[0].find('.pos-countdown-bar__track').exists()).toBe(true)
  })

  it('傳入 pending 的 call 會同時出現在右欄佇列（與 completed 案例對照，證明依狀態分流而非整份 calls）', () => {
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

  describe('請假／娃娃車（posbus01）', () => {
    beforeEach(() => {
      Object.values(api).forEach(fn => fn.mockReset())
      api.getDismissalPosStatus.mockResolvedValue({
        data: {
          leaves: [{ student_id: 102, leave_type: '病假', marked_by_pos: false }],
          bus_departed: [{ student_id: 101, route_name: '放學一號車', departed_at: '2026-09-28T16:30:00' }],
        },
      })
      api.markPosBus.mockResolvedValue({ data: {} })
      api.markPosLeave.mockResolvedValue({ data: {} })
    })

    it('掛載後帶入今日請假與已上放學車徽章', async () => {
      const w = mountBoard()
      await flushPromises()
      const cards = w.findAll('.pos-student-card')
      const text = (name: string) => cards.find(c => c.text().includes(name))!.text()
      expect(text('王小明')).toContain('娃娃車已接送')
      expect(text('陳小華')).toContain('請假（病假）')
    })

    it('卡片補登娃娃車 → 呼叫 API、重抓名單並通知父層重抓接送通知', async () => {
      api.getDismissalPosStatus.mockResolvedValue({ data: { leaves: [], bus_departed: [] } })
      const w = mountBoard()
      await flushPromises()
      expect(api.getDismissalPosStatus).toHaveBeenCalledTimes(1)

      const card = w.findAllComponents({ name: 'DismissalPosStudentCard' })[0]
      card.vm.$emit('mark-bus', { id: 101, name: '王小明' })
      await flushPromises()

      expect(api.markPosBus).toHaveBeenCalledWith({ student_id: 101 })
      expect(api.getDismissalPosStatus).toHaveBeenCalledTimes(2)
      // 補登後的重抓必須繞過 apiDedupe，否則會領到在途輪詢的補登前快照
      expect(api.getDismissalPosStatus).toHaveBeenLastCalledWith({ force: true })
      expect(w.emitted('refresh-calls')).toHaveLength(1)
    })

    it('補登請假帶假別，不需重抓接送通知', async () => {
      const w = mountBoard()
      await flushPromises()
      const card = w.findAllComponents({ name: 'DismissalPosStudentCard' })[0]
      card.vm.$emit('mark-leave', { id: 101, name: '王小明' }, '事假')
      await flushPromises()

      expect(api.markPosLeave).toHaveBeenCalledWith({ student_id: 101, leave_type: '事假' })
      expect(w.emitted('refresh-calls')).toBeUndefined()
    })

    it('請求進行中同一學生不重複送出', async () => {
      let resolve!: (v: unknown) => void
      api.markPosBus.mockReturnValue(new Promise(r => { resolve = r }))
      const w = mountBoard()
      await flushPromises()
      const card = w.findAllComponents({ name: 'DismissalPosStudentCard' })[0]
      card.vm.$emit('mark-bus', { id: 101, name: '王小明' })
      card.vm.$emit('mark-bus', { id: 101, name: '王小明' })
      await flushPromises()
      expect(api.markPosBus).toHaveBeenCalledTimes(1)
      resolve({ data: {} })
      await flushPromises()
    })

    it('名單載入失敗時卡片維持原狀態、不噴錯', async () => {
      api.getDismissalPosStatus.mockRejectedValue(new Error('network'))
      const w = mountBoard()
      await flushPromises()
      expect(w.findAll('.pos-student-card__status')).toHaveLength(0)
    })
  })
})
