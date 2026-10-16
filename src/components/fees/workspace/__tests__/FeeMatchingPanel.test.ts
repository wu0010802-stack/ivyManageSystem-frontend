/**
 * 入帳媒合面板（2026-09-02 IA 合併：原對帳工作區的代收明細／存摺明細兩個
 * 同層檢視收成同一頁的來源切換）。
 *
 * SPEC-016 語意不變：代收明細為對帳主來源（預設），存摺明細為勾稽層。
 * 兩個子元件以 embedded 模式掛載，匯入與存摺勾稽由收款工作區的工具列轉呼叫。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const collectionMocks = vi.hoisted(() => ({
  fetchPayments: vi.fn(),
  openCoverage: vi.fn(),
  openImport: vi.fn(),
}))
vi.mock('@/components/fees/CollectionReconTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'CollectionReconTab',
    props: { embedded: { type: Boolean, default: false } },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose(collectionMocks)
      return {}
    },
    template: '<div data-testid="collection-tab" :data-embedded="embedded ? \'1\' : \'0\'" />',
  },
}))

const passbookMocks = vi.hoisted(() => ({
  fetchTxns: vi.fn(),
  openImport: vi.fn(),
}))
vi.mock('@/components/fees/BankReconTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'BankReconTab',
    props: { embedded: { type: Boolean, default: false } },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose(passbookMocks)
      return {}
    },
    template: '<div data-testid="passbook-tab" :data-embedded="embedded ? \'1\' : \'0\'" />',
  },
}))

import FeeMatchingPanel from '../FeeMatchingPanel.vue'

function mountPanel(source?: string) {
  return mount(FeeMatchingPanel, { props: source ? { source } : {} })
}

beforeEach(() => vi.clearAllMocks())

describe('FeeMatchingPanel', () => {
  it('預設顯示代收明細（對帳主來源），且以 embedded 模式掛載', async () => {
    const wrapper = mountPanel()
    const tab = wrapper.find('[data-testid="collection-tab"]')
    expect(tab.exists()).toBe(true)
    expect(tab.attributes('data-embedded')).toBe('1')
    expect(wrapper.find('[data-testid="passbook-tab"]').exists()).toBe(false)
  })

  it('source=passbook 顯示存摺明細（同樣 embedded）', async () => {
    const wrapper = mountPanel('passbook')
    const tab = wrapper.find('[data-testid="passbook-tab"]')
    expect(tab.exists()).toBe(true)
    expect(tab.attributes('data-embedded')).toBe('1')
    expect(wrapper.find('[data-testid="collection-tab"]').exists()).toBe(false)
  })

  it('openImport 轉呼叫目前來源的匯入面板', async () => {
    const collection = mountPanel()
    ;(collection.vm as unknown as { openImport: () => void }).openImport()
    expect(collectionMocks.openImport).toHaveBeenCalledTimes(1)
    expect(passbookMocks.openImport).not.toHaveBeenCalled()

    const passbook = mountPanel('passbook')
    ;(passbook.vm as unknown as { openImport: () => void }).openImport()
    expect(passbookMocks.openImport).toHaveBeenCalledTimes(1)
  })

  it('openCoverage 只作用於代收來源（存摺勾稽是代收側的收尾動作）', async () => {
    const passbook = mountPanel('passbook')
    ;(passbook.vm as unknown as { openCoverage: () => void }).openCoverage()
    expect(collectionMocks.openCoverage).not.toHaveBeenCalled()

    const collection = mountPanel()
    ;(collection.vm as unknown as { openCoverage: () => void }).openCoverage()
    expect(collectionMocks.openCoverage).toHaveBeenCalledTimes(1)
  })

  it('refresh 轉呼叫目前來源的清單重載', async () => {
    const collection = mountPanel()
    ;(collection.vm as unknown as { refresh: () => void }).refresh()
    expect(collectionMocks.fetchPayments).toHaveBeenCalledTimes(1)
    expect(passbookMocks.fetchTxns).not.toHaveBeenCalled()

    const passbook = mountPanel('passbook')
    ;(passbook.vm as unknown as { refresh: () => void }).refresh()
    expect(passbookMocks.fetchTxns).toHaveBeenCalledTimes(1)
  })
})
