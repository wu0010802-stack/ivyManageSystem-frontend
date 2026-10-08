import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import LightsBoard from '../LightsBoard.vue'

const stubs = {
  'el-tag': { props: ['type'], template: '<span class="tag" :data-type="type"><slot /></span>' },
  'el-card': { template: '<div><slot /></div>' },
}

const NINE_LIGHTS = [
  { key: 'login_channel', level: 'red', reason: 'LINE 登入 channel ID 未設', metric: null },
  { key: 'tenant_entry', level: 'green', reason: '正常', metric: null },
  { key: 'line_push', level: 'yellow', reason: '重試中 12 筆', metric: '12' },
  { key: 'storage', level: 'green', reason: '正常', metric: null },
  { key: 'db_rls', level: 'green', reason: '正常', metric: null },
  { key: 'schedulers', level: 'gray', reason: '未啟用', metric: null },
  { key: 'api_errors', level: 'gray', reason: '未收集', metric: null },
  { key: 'silence', level: 'gray', reason: '未收集', metric: null },
  { key: 'client_events', level: 'gray', reason: '未收集', metric: null },
]

describe('LightsBoard', () => {
  it('九個 key 各渲染一張卡', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS }, global: { stubs } })
    // ⚠ 不能用 `[data-testid^="light-"]`：metric 區塊的 data-testid="light-metric"
    // 字面值本身也符合這個前綴，會把「有 metric 的那張卡」多算一次
    // （9 張卡 + 1 個 metric 節點 = 10，實測跑出來就是如此）。改用卡片自己的
    // class 選（`.light-card`），只數卡片本身，不受巢狀 metric 節點干擾。
    expect(w.findAll('.light-card')).toHaveLength(9)
  })

  it('四種燈色對應正確的 tag type', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS }, global: { stubs } })

    const typeOf = (key: string) =>
      w.find(`[data-testid="light-${key}"] .tag`).attributes('data-type')

    expect(typeOf('login_channel')).toBe('danger')
    expect(typeOf('tenant_entry')).toBe('success')
    expect(typeOf('line_push')).toBe('warning')
    expect(typeOf('schedulers')).toBe('info')
  })

  it('顯示中文名稱，不得把 key 直接露給使用者', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS }, global: { stubs } })

    for (const light of NINE_LIGHTS) {
      const card = w.find(`[data-testid="light-${light.key}"]`)
      expect(card.text()).not.toContain(light.key)
    }
    expect(w.text()).toContain('家長登入通道')
  })

  it('每張卡都顯示 reason 一句', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS }, global: { stubs } })
    expect(w.find('[data-testid="light-login_channel"]').text()).toContain('channel ID 未設')
  })

  it('metric 為 null 時不渲染數字區塊', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS }, global: { stubs } })

    expect(w.find('[data-testid="light-line_push"] [data-testid="light-metric"]').exists()).toBe(true)
    expect(w.find('[data-testid="light-storage"] [data-testid="light-metric"]').exists()).toBe(false)
  })

  it('後端多回或少回燈號時仍照收，不硬編九個', () => {
    const w = mount(LightsBoard, { props: { lights: NINE_LIGHTS.slice(0, 3) }, global: { stubs } })
    expect(w.findAll('.light-card')).toHaveLength(3)
  })
})
