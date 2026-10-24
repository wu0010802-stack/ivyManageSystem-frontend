import { createHash } from 'node:crypto'

/**
 * 補齊已預快取 JS 的靜態依賴，避免舊入口仍在 SW、必要 chunk 已隨部署移除。
 * 以 Rollup 實際 imports 與 Vite CSS metadata 為準，不追 dynamicImports 或品牌資產。
 */
export function createPrecacheStaticDependencies() {
  let output = {}
  return {
    plugin: {
      name: 'ivy-precache-static-dependencies',
      apply: 'build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        output = bundle
      },
    },
    manifestTransform(entries) {
      const manifest = [...entries]
      const included = new Set(entries.map((entry) => entry.url))
      const visited = new Set()
      const queue = entries.filter((entry) => entry.url.endsWith('.js') && output[entry.url]).map((entry) => entry.url)
      while (queue.length) {
        const filename = queue.shift()
        if (visited.has(filename)) continue
        visited.add(filename)
        const item = output[filename]
        if (item.type !== 'chunk') continue
        const dependencies = [...item.imports, ...(item.viteMetadata?.importedCss ?? [])]
        for (const dependency of dependencies) {
          const asset = output[dependency]
          if (!asset) throw new Error(`預快取靜態依賴缺少產物：${filename} → ${dependency}`)
          if (!included.has(dependency)) {
            const content = asset.type === 'chunk' ? asset.code : asset.source
            manifest.push({
              url: dependency,
              revision: createHash('sha256').update(content).digest('hex'),
              size: Buffer.byteLength(content),
            })
            included.add(dependency)
          }
          if (asset.type === 'chunk') queue.push(dependency)
        }
      }
      return { manifest, warnings: [] }
    },
  }
}
