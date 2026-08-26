/**
 * 當日名單表格的呈現守衛。
 *
 * 這張表的風險全在「哪些動作在什麼狀態下該出現」：多給一個按鈕，使用者就會吃一個
 * 後端 422；少給一個（尤其 in_progress 的「取消不搭車」），車到現場發現學生在場
 * 時就沒有救援路徑了。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// vuedraggable stub：渲染 item slot、@change 可由測試手動觸發
// （沿用 src/components/settings/roles/__tests__/ApprovalChainEditor.test.ts 的慣例）
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle', 'disabled'],
    emits: ['change'],
    template:
      '<div data-test="draggable" :data-disabled="String(disabled)">'
      + '<template v-for="(el, i) in modelValue" :key="el.student_id">'
      + '<slot name="item" :element="el" :index="i" /></template></div>',
  },
}))

import BusDispatchStopsTable from '@/components/bus/BusDispatchStopsTable.vue'

const GLOBAL_STUBS = {
  'el-tag': { template: '<span class="el-tag"><slot /></span>' },
  'el-alert': {
    template: '<div class="el-alert"><slot name="title" /></div>',
  },
  // 不轉發 $emit('click')：$attrs 已含父層的 onClick，再 emit 一次會變成雙發
  'el-button': { template: '<button v-bind="$attrs"><slot /></button>' },
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
    lat: 22.61, lng: 120.31, status: 'pending', excuse_reason: null,
    source: 'default', pinned: false, eta_planned: null, eta_live: null,
    address: '高雄市三民區某路 1 號', contacts: [{ name: '王媽媽', phone: '0912345678' }],
    departed_at: null,
    ...overrides,
  }
}

function mountTable(props: Record<string, unknown> = {}) {
  return mount(BusDispatchStopsTable, {
    props: {
      stops: [stop()],
      readonly: false,
      tripStatus: 'planned',
      etaStale: false,
      ...props,
    },
    global: { stubs: GLOBAL_STUBS },
  })
}

describe('分區與狀態呈現', () => {
  it('pending 進「待接送」區、其餘進「已處理」區', () => {
    const w = mountTable({
      stops: [
        stop({ stop_id: 10, student_id: 100, seq: 1, status: 'departed', departed_at: '2026-08-26T07:10:00' }),
        stop({ stop_id: 11, student_id: 101, seq: 2 }),
        stop({ stop_id: 12, student_id: 102, seq: 3, status: 'excused', excuse_reason: 'leave' }),
      ],
    })
    expect(w.find('[data-test="settled-100"]').exists()).toBe(true)
    expect(w.find('[data-test="settled-102"]').exists()).toBe(true)
    expect(w.find('[data-test="pending-101"]').exists()).toBe(true)
    expect(w.find('[data-test="settled-101"]').exists()).toBe(false)
  })

  it('待接送區的序號是 pending 內的名次，不是後端 seq（拖拉是在這個序列裡發生的）', () => {
    const w = mountTable({
      stops: [
        stop({ stop_id: 10, student_id: 100, seq: 1, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101, seq: 5 }),
        stop({ stop_id: 12, student_id: 102, seq: 9 }),
      ],
    })
    expect(w.find('[data-test="pending-101"]').text()).toContain('1')
    expect(w.find('[data-test="pending-102"]').text()).toContain('2')
  })

  it('excused 站顯示原因文案（請假／家長取消／後台排除）', () => {
    const w = mountTable({
      stops: [
        stop({ student_id: 101, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 12, student_id: 102, status: 'excused', excuse_reason: 'parent' }),
        stop({ stop_id: 13, student_id: 103, status: 'excused', excuse_reason: 'admin' }),
      ],
    })
    expect(w.find('[data-test="excuse-101"]').text()).toBe('請假')
    expect(w.find('[data-test="excuse-102"]').text()).toBe('家長取消')
    expect(w.find('[data-test="excuse-103"]').text()).toBe('後台排除')
  })

  it('臨時插入的站標「臨時」、釘選的站有釘選圖示', () => {
    const w = mountTable({ stops: [stop({ source: 'added', pinned: true })] })
    expect(w.find('[data-test="added-tag"]').exists()).toBe(true)
    expect(w.find('[data-test="pinned-101"]').exists()).toBe(true)
  })

  it('ETA 取 eta_live 優先、退 eta_planned，兩者皆無顯示 —', () => {
    const w = mountTable({
      stops: [
        stop({ student_id: 101, eta_planned: '2026-08-26T07:10:00', eta_live: '2026-08-26T07:18:00' }),
        stop({ stop_id: 12, student_id: 102, eta_planned: '2026-08-26T07:20:00' }),
        stop({ stop_id: 13, student_id: 103 }),
      ],
    })
    expect(w.find('[data-test="eta-101"]').text()).toBe('07:18')
    expect(w.find('[data-test="eta-102"]').text()).toBe('07:20')
    expect(w.find('[data-test="eta-103"]').text()).toBe('—')
  })

  it('etaStale 時顯示「請按重算」提示，不默默呈現可能失真的 ETA', () => {
    expect(mountTable({ etaStale: false }).find('[data-test="eta-stale"]').exists()).toBe(false)
    const w = mountTable({ etaStale: true })
    expect(w.find('[data-test="eta-stale"]').text()).toContain('ETA 可能已過期')
  })

  it('座標數字不得出現在畫面上（隱私：lat/lng 只供地圖微調起始位置）', () => {
    const html = mountTable().html()
    expect(html).not.toContain('22.61')
    expect(html).not.toContain('120.31')
  })

  it('沒有待接送站點時顯示空狀態而非空白', () => {
    const w = mountTable({ stops: [stop({ status: 'departed' })] })
    expect(w.find('[data-test="pending-empty"]').exists()).toBe(true)
  })
})

describe('唯讀鎖', () => {
  it('readonly 時全部動作消失、拖拉停用', () => {
    const w = mountTable({ readonly: true, stops: [stop({ pinned: true })] })
    expect(w.find('[data-test="pending-list"]').attributes('data-disabled')).toBe('true')
    expect(w.find('[data-test="handle-101"]').exists()).toBe(false)
    expect(w.find('[data-test="excuse-btn-101"]').exists()).toBe(false)
    expect(w.find('[data-test="address-btn-101"]').exists()).toBe(false)
    expect(w.find('[data-test="map-btn-101"]').exists()).toBe(false)
    expect(w.find('[data-test="remove-101"]').exists()).toBe(false)
  })

  it('busy（寫入 in-flight）等同暫時唯讀，避免併發送出', () => {
    const w = mountTable({ busy: true })
    expect(w.find('[data-test="pending-list"]').attributes('data-disabled')).toBe('true')
    expect(w.find('[data-test="excuse-btn-101"]').exists()).toBe(false)
  })
})

describe('in_progress 的動作收斂（後端一律 422 的先不要給）', () => {
  it('進行中不給「移除」與「接送地址」，但保留「標記不搭車」與拖拉', () => {
    const w = mountTable({ tripStatus: 'in_progress' })
    expect(w.find('[data-test="remove-101"]').exists()).toBe(false)
    expect(w.find('[data-test="address-btn-101"]').exists()).toBe(false)
    expect(w.find('[data-test="map-btn-101"]').exists()).toBe(false)
    expect(w.find('[data-test="excuse-btn-101"]').exists()).toBe(true)
    expect(w.find('[data-test="pending-list"]').attributes('data-disabled')).toBe('false')
  })

  it('planned 下這兩個動作照常提供', () => {
    const w = mountTable({ tripStatus: 'planned' })
    expect(w.find('[data-test="remove-101"]').exists()).toBe(true)
    expect(w.find('[data-test="address-btn-101"]').exists()).toBe(true)
  })

  it('已 departed 的站一律不可移除（後端 422）', () => {
    const w = mountTable({ stops: [stop({ status: 'departed' })] })
    expect(w.find('[data-test="remove-101"]').exists()).toBe(false)
  })
})

describe('取消不搭車（excused 救援路徑）', () => {
  it('planned 下只有後台標記的 excused 可取消——請假／家長取消要從來源撤銷', () => {
    const w = mountTable({
      tripStatus: 'planned',
      stops: [
        stop({ student_id: 101, status: 'excused', excuse_reason: 'admin' }),
        stop({ stop_id: 12, student_id: 102, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 13, student_id: 103, status: 'excused', excuse_reason: 'parent' }),
      ],
    })
    expect(w.find('[data-test="unexcuse-101"]').exists()).toBe(true)
    expect(w.find('[data-test="unexcuse-102"]').exists()).toBe(false)
    expect(w.find('[data-test="unexcuse-103"]').exists()).toBe(false)
  })

  it('in_progress 下三種原因都可取消（車到現場發現學生在場的唯一救援路徑）', () => {
    const w = mountTable({
      tripStatus: 'in_progress',
      stops: [
        stop({ student_id: 101, status: 'excused', excuse_reason: 'admin' }),
        stop({ stop_id: 12, student_id: 102, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 13, student_id: 103, status: 'excused', excuse_reason: 'parent' }),
      ],
    })
    expect(w.find('[data-test="unexcuse-101"]').exists()).toBe(true)
    expect(w.find('[data-test="unexcuse-102"]').exists()).toBe(true)
    expect(w.find('[data-test="unexcuse-103"]').exists()).toBe(true)
  })

  it('readonly 時即使是 in_progress 也不給取消（權限不足的鎖優先）', () => {
    const w = mountTable({
      readonly: true,
      tripStatus: 'in_progress',
      stops: [stop({ status: 'excused', excuse_reason: 'parent' })],
    })
    expect(w.find('[data-test="unexcuse-101"]').exists()).toBe(false)
  })
})

describe('emit', () => {
  it('動作 emit 的是 student_id（後端所有當日編輯都以 student_id 定址）', async () => {
    const w = mountTable({ stops: [stop({ student_id: 555 })] })
    await w.find('[data-test="excuse-btn-555"]').trigger('click')
    await w.find('[data-test="address-btn-555"]').trigger('click')
    await w.find('[data-test="map-btn-555"]').trigger('click')
    await w.find('[data-test="remove-555"]').trigger('click')

    expect(w.emitted('mark-excused')).toEqual([[555]])
    expect(w.emitted('change-address')).toEqual([[555]])
    expect(w.emitted('tune-map')).toEqual([[555]])
    expect(w.emitted('remove')).toEqual([[555]])
  })

  it('取消不搭車 emit unmark-excused', async () => {
    const w = mountTable({
      tripStatus: 'in_progress',
      stops: [stop({ student_id: 777, status: 'excused', excuse_reason: 'parent' })],
    })
    await w.find('[data-test="unexcuse-777"]').trigger('click')
    expect(w.emitted('unmark-excused')).toEqual([[777]])
  })

  it('拖拉 emit reorder(from, to)，索引取自 pending 序列', async () => {
    const w = mountTable({
      stops: [
        stop({ stop_id: 10, student_id: 100, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101 }),
        stop({ stop_id: 12, student_id: 102 }),
      ],
    })
    w.findComponent({ name: 'draggable' }).vm.$emit('change', { moved: { oldIndex: 1, newIndex: 0 } })
    await w.vm.$nextTick()
    expect(w.emitted('reorder')).toEqual([[1, 0]])
  })

  it('非 moved 的 change（added／removed）不 emit reorder', async () => {
    const w = mountTable()
    w.findComponent({ name: 'draggable' }).vm.$emit('change', { added: { newIndex: 0 } })
    await w.vm.$nextTick()
    expect(w.emitted('reorder')).toBeUndefined()
  })
})
