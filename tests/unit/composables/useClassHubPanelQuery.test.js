import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const mockRoute = { query: {} }
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}))

import { useClassHubPanelQuery } from '@/composables/useClassHubPanelQuery'

describe('useClassHubPanelQuery', () => {
  beforeEach(() => {
    mockRoute.query = {}
    mockRouter.push.mockClear()
    mockRouter.replace.mockClear()
  })

  describe('panel computed', () => {
    it('query 沒有 panel 時回傳 null', () => {
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBeNull()
    })

    it('query 有 panel=messages 時回傳 messages', () => {
      mockRoute.query = { panel: 'messages' }
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBe('messages')
    })

    it('query 有 panel=announcements 時回傳 announcements', () => {
      mockRoute.query = { panel: 'announcements' }
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBe('announcements')
    })
  })

  describe('threadId computed', () => {
    it('query 沒有 thread 時回傳 null', () => {
      const { threadId } = useClassHubPanelQuery()
      expect(threadId.value).toBeNull()
    })

    it('query 有 thread=42 時回傳 number 42', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { threadId } = useClassHubPanelQuery()
      expect(threadId.value).toBe(42)
    })
  })

  describe('openPanel', () => {
    it('開啟 messages panel 時 push query', () => {
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: undefined },
      })
    })

    it('已在同 panel 且無 thread 時不重複 push（guard）', () => {
      mockRoute.query = { panel: 'messages' }
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('在同 panel 但有 thread 時，openPanel 會清掉 thread', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: undefined },
      })
    })
  })

  describe('closePanel', () => {
    it('panel 與 thread 都不存在時不 replace（guard）', () => {
      const { closePanel } = useClassHubPanelQuery()
      closePanel()
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })

    it('清掉 panel 與 thread query，保留其他 query', () => {
      mockRoute.query = { panel: 'messages', thread: '42', foo: 'bar' }
      const { closePanel } = useClassHubPanelQuery()
      closePanel()
      expect(mockRouter.replace).toHaveBeenCalledWith({ query: { foo: 'bar' } })
    })
  })

  describe('openThread', () => {
    it('push messages panel 加 thread', () => {
      const { openThread } = useClassHubPanelQuery()
      openThread(42)
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: '42' },
      })
    })

    it('已在同 thread 時不重複 push（guard）', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { openThread } = useClassHubPanelQuery()
      openThread(42)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  describe('closeThread', () => {
    it('當前已在 list（panel=messages 無 thread）時不重複 push', () => {
      mockRoute.query = { panel: 'messages' }
      const { closeThread } = useClassHubPanelQuery()
      closeThread()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('從 thread view 返 list 時 push panel=messages 不帶 thread', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { closeThread } = useClassHubPanelQuery()
      closeThread()
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages' },
      })
    })
  })
})
