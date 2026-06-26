import { describe, it, expect } from 'vitest'
import postcss from 'postcss'
import customMedia from 'postcss-custom-media'
import globalData from '@csstools/postcss-global-data'

describe('PostCSS custom-media 接線', () => {
  it('--to-sm 解析為 max-width: 767.98px', async () => {
    const out = await postcss([
      globalData({ files: ['src/assets/breakpoints.media.css'] }),
      customMedia(),
    ]).process('@media (--to-sm){a{color:red}}', { from: undefined })
    expect(out.css).toContain('max-width: 767.98px')
    expect(out.css).not.toContain('--to-sm')
  })

  it('--bp-md 解析為 min-width: 1024px', async () => {
    const out = await postcss([
      globalData({ files: ['src/assets/breakpoints.media.css'] }),
      customMedia(),
    ]).process('@media (--bp-md){a{color:red}}', { from: undefined })
    expect(out.css).toContain('min-width: 1024px')
  })
})
