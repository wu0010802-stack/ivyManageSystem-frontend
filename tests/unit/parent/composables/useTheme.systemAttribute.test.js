import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('useTheme — system mode 顯式設 data-theme', () => {
  let originalMatchMedia

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('preference=system + OS prefers dark → data-theme=dark', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('preference=system + OS prefers light → data-theme=light', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('preference=dark 顯式覆寫 OS', async () => {
    localStorage.setItem('parent-theme', 'dark')
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    vi.resetModules()
    const { initTheme } = await import('@/parent/composables/useTheme')
    initTheme()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
