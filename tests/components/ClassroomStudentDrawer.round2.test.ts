import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'

// 班級管理頁第二輪改版（名冊抽屜）：白底標頭、移除刪除、未填 pill、未選學生的班級摘要。
vi.mock('@/composables/useClassroomProspects', () => ({
  useClassroomProspects: () => ({
    reservedCount: ref(0),
    prospects: ref([]),
    loading: ref(false),
    reload: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const baseClassroom = {
  id: 3,
  name: '天堂鳥',
  class_code: '大1',
  grade_name: '大班',
  grade_id: 7,
  school_year: 115,
  semester: 1,
  semester_label: '115學年度 上學期',
  is_active: true,
  capacity: 30,
  current_count: 4,
  head_teacher_name: '陳怡君',
  assistant_teacher_name: '林雅婷',
  english_teacher_name: '張書豪',
  art_teacher_name: null,
  students: [
    { id: 11, name: '男孩甲', gender: '男', is_active: true },
    { id: 12, name: '女孩乙', gender: '女', is_active: true },
    { id: 13, name: '未填丙', gender: '', is_active: true },
    { id: 14, name: '未填丁', gender: null, is_active: true },
  ],
}

function mountDrawer(classroom: Record<string, unknown> | null = baseClassroom) {
  return mount(ClassroomStudentDrawer, {
    props: { visible: true, classroom, loading: false },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        'el-drawer': { template: '<div><slot /></div>' },
        StudentDetailPanel: true,
      },
    },
  })
}

describe('ClassroomStudentDrawer 第二輪改版', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('名冊不提供刪除', () => {
    it('每列只有編輯鈕，沒有任何 aria-label 以「刪除」開頭的按鈕', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const labels = wrapper
        .findAll('[aria-label]')
        .map((el) => el.attributes('aria-label') ?? '')
      expect(labels.filter((l) => l.startsWith('刪除'))).toEqual([])
      // 編輯鈕仍在（避免「整排按鈕都沒渲染」造成的假綠）
      expect(labels).toContain('編輯 男孩甲 的資料')
    })
  })

  describe('白底標頭', () => {
    it('顯示班名、班級代號、啟用狀態文字與「學期 · 年級」', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const header = wrapper.find('.drawer-header')
      expect(header.exists()).toBe(true)
      expect(header.find('h2').text()).toBe('天堂鳥')
      expect(header.find('.code-chip').text()).toBe('大1')
      expect(header.text()).toContain('啟用中')
      expect(header.text()).toContain('115學年度 上學期 · 大班')
    })

    it('class_code 為空時不顯示代號小框；停用班顯示「已停用」；缺年級顯示「未設定年級」', async () => {
      const wrapper = mountDrawer({
        ...baseClassroom,
        class_code: null,
        is_active: false,
        grade_name: '',
      })
      await flushPromises()

      const header = wrapper.find('.drawer-header')
      expect(header.find('.code-chip').exists()).toBe(false)
      expect(header.text()).toContain('已停用')
      expect(header.text()).not.toContain('啟用中')
      expect(header.text()).toContain('未設定年級')
    })

    it('關閉鈕 aria-label="關閉名冊"，點擊 emit update:visible false', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const closeBtn = wrapper.find('[aria-label="關閉名冊"]')
      expect(closeBtn.exists()).toBe(true)
      await closeBtn.trigger('click')

      expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false])
    })

    it('「開完整檔案」只在選了學生後出現', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const hasOpenFull = () =>
        wrapper.findAll('.banner-btn').some((b) => b.text() === '開完整檔案')
      expect(hasOpenFull()).toBe(false)

      await wrapper.find('.roster-item').trigger('click')
      expect(hasOpenFull()).toBe(true)
    })
  })

  describe('性別篩選只剩統計 pill（移除重複的 radio group）', () => {
    it('名冊左欄沒有性別 el-radio-group', async () => {
      const wrapper = mountDrawer()
      await flushPromises()
      expect(wrapper.find('.el-radio-group').exists()).toBe(false)
    })

    it('「未填」pill 計數＝在學生中性別非男非女者，點擊後名冊只剩這些學生', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const pill = wrapper.find('.stat-pill--unknown')
      expect(pill.exists()).toBe(true)
      expect(pill.text()).toContain('未填')
      expect(pill.text()).toContain('2')
      expect(pill.attributes('aria-pressed')).toBe('false')

      await pill.trigger('click')
      await flushPromises()

      const rosterText = wrapper.find('.roster-list').text()
      expect(rosterText).toContain('未填丙')
      expect(rosterText).toContain('未填丁')
      expect(rosterText).not.toContain('男孩甲')
      expect(rosterText).not.toContain('女孩乙')
      expect(wrapper.find('.stat-pill--unknown').attributes('aria-pressed')).toBe('true')
    })

    it('「未填」pill 同值再點一次取消篩選', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      await wrapper.find('.stat-pill--unknown').trigger('click')
      await wrapper.find('.stat-pill--unknown').trigger('click')
      await flushPromises()

      const rosterText = wrapper.find('.roster-list').text()
      expect(rosterText).toContain('男孩甲')
      expect(rosterText).toContain('女孩乙')
      expect(rosterText).toContain('未填丙')
      expect(wrapper.find('.stat-pill--unknown').attributes('aria-pressed')).toBe('false')
    })

    it('男／女 pill 計數不含未填學生，且未填學生不會混進男生篩選', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      expect(wrapper.find('.stat-pill--info').text()).toContain('1')
      expect(wrapper.find('.stat-pill--danger').text()).toContain('1')

      await wrapper.find('.stat-pill--info').trigger('click')
      await flushPromises()
      const rosterText = wrapper.find('.roster-list').text()
      expect(rosterText).toContain('男孩甲')
      expect(rosterText).not.toContain('未填丙')
    })

    it('在學 pill 保持「在學 N」文字形狀', async () => {
      const wrapper = mountDrawer()
      await flushPromises()
      expect(wrapper.find('.stat-pill--primary').text()).toBe('在學 4')
    })
  })

  describe('容量條：正常不上色（中性灰），只有接近額滿／已滿才上色', () => {
    const withActive = (count: number, capacity: number) => ({
      ...baseClassroom,
      capacity,
      students: Array.from({ length: count }, (_, i) => ({
        id: 100 + i,
        name: `學生${i}`,
        gender: '男',
        is_active: true,
      })),
    })
    const progressOf = (wrapper: ReturnType<typeof mountDrawer>) =>
      wrapper.findComponent({ name: 'ElProgress' })

    it('容量正常（4 / 30）：不設 status、以中性 token 給色，不再是綠色 success', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const progress = progressOf(wrapper)
      expect(progress.exists()).toBe(true)
      expect(progress.props('status')).toBe('')
      expect(progress.props('color')).toBe('var(--el-text-color-placeholder)')
    })

    it('接近額滿（9 / 10）維持 warning，不覆寫顏色', async () => {
      const wrapper = mountDrawer(withActive(9, 10))
      await flushPromises()

      const progress = progressOf(wrapper)
      expect(progress.props('status')).toBe('warning')
      expect(progress.props('color')).toBe('')
    })

    it('已滿（10 / 10）維持 exception，不覆寫顏色', async () => {
      const wrapper = mountDrawer(withActive(10, 10))
      await flushPromises()

      const progress = progressOf(wrapper)
      expect(progress.props('status')).toBe('exception')
      expect(progress.props('color')).toBe('')
    })
  })

  describe('未選學生時右側顯示班級摘要', () => {
    it('顯示師資姓名與離班說明文字，不再是「從左側選擇學生」空狀態', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      const pane = wrapper.find('.detail-pane')
      const text = pane.text()
      expect(text).toContain('點選左側學生查看完整資料；以下為本班摘要。')
      expect(text).toContain('師資')
      expect(text).toContain('陳怡君')
      expect(text).toContain('林雅婷')
      expect(text).toContain('張書豪')
      // 文案必須與介面字面一致（StudentSummaryHeader 的「⋯→編輯基本資料」「變更狀態」），
      // 不可再寫介面上不存在的「轉班」鈕。
      expect(text).toContain(
        '學生要離開本班：選取學生後，按學生資料右上的「⋯」→「編輯基本資料」改班級，或按「變更狀態」辦理退學、畢業。名冊上不提供刪除，所有離班都會留下異動紀錄。',
      )
      expect(text).not.toContain('「轉班」')
      // 休學仍保留 is_active 與 classroom_id（BE services/student_lifecycle.py），學生照算在籍，
      // 不是離開本班的方法，文案不可列為選項
      expect(text).not.toContain('休學')
      expect(text).not.toContain('從左側選擇學生以查看詳情')
    })

    it('未指派的老師顯示「未指派」；美語老師缺 english 時退回 art_teacher_name', async () => {
      const wrapper = mountDrawer({
        ...baseClassroom,
        head_teacher_name: null,
        assistant_teacher_name: undefined,
        english_teacher_name: null,
        art_teacher_name: '舊欄位美語',
      })
      await flushPromises()

      const rows = wrapper.findAll('.teacher-list dt').map((dt) => ({
        label: dt.text(),
        value: dt.element.nextElementSibling?.textContent?.trim(),
      }))
      expect(rows).toEqual([
        { label: '班導', value: '未指派' },
        { label: '副班導', value: '未指派' },
        { label: '美語老師', value: '舊欄位美語' },
      ])
    })

    it('選了學生後摘要被詳情面板取代', async () => {
      const wrapper = mountDrawer()
      await flushPromises()

      await wrapper.find('.roster-item').trigger('click')
      await flushPromises()

      expect(wrapper.find('.detail-pane').text()).not.toContain('名冊上不提供刪除')
      expect(wrapper.findComponent({ name: 'StudentDetailPanel' }).exists()).toBe(true)
    })
  })
})
