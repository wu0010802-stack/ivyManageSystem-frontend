# Design Tokens — Canonical Reference

> **Status**：階段 1（2026-05-29 起），warn level lint 量化技債；階段 2/3 為 follow-up。

## Source of Truth

- **`--color-*`** = raw palette（HEX / RGB），**唯一允許定義原始顏色**
- 其他色彩相關 prefix 全須以 `var(--color-*)` 形式 alias

## Token Tiers（命名分層）

| Tier | Prefix | 範例 | 允許新增？ |
|---|---|---|---|
| **Raw palette** | `--color-*` | `--color-primary-500: #4a90e2;` | ✅ 唯一來源 |
| **Element-plus override** | `--el-*` | `--el-color-primary: var(--color-primary-500);` | ⚠️ 只允許覆寫 Element-plus 既有 token，禁新增業務 token |
| Brand alias | `--brand-*` | `--brand-primary: var(--color-primary-500);` | ❌ deprecated |
| Component shorthand | `--pt-*`, `--m3-*` | `--pt-surface-mute: var(--color-neutral-50);` | ❌ deprecated |
| Legacy raw | `--ivy-*`, `--neutral-*` | — | ❌ deprecated，全轉 `var(--color-*)` alias |

## Design Dimensions（非色彩 prefix，繼續用）

下列 prefix 是「設計維度」（不是顏色語意），不衝突也不算 deprecated：

`--space-*` / `--text-*` / `--fs-*` / `--radius-*` / `--border-*` / `--dur-*` / `--ease-*` / `--shadow-*` / `--bg-*` / `--surface-*` / `--font-*` / `--transition-*` / `--touch-*`

## 遷移狀態

| 階段 | 動作 | 時程 |
|---|---|---|
| **階段 1（本 PR）** | TOKENS.md + stylelint warn rule + CI 量化 baseline | 立 PR-D 即生效 |
| **階段 2** | Hot files 批次 sed `--brand-*` / `--pt-*` / `--m3-*` / `--ivy-*` / `--neutral-*` → `var(--color-*)`；warn → error | follow-up PR（建議 4 週內） |
| **階段 3** | 全 codebase 清完，TOKENS.md 移除 deprecated 段 | follow-up |

## 已知遷移坑

### 三層 fallback chain

`src/parent/styles/globals.css` 有：

```css
--pt-surface-mute: var(--ivy-leaf-bg, #f5fbe6);
```

把 `--pt-` 鎖到 `--ivy-` rotate，再 fallback hex。**階段 1 不改** — 須先確認 component-level 用法（`var(--pt-surface-mute)` 在多少處）才能安全替換。

### Element-plus `--el-*` override

`--el-color-primary` 由 Element-plus 自帶。**只覆寫不新增**：

```css
:root {
  --el-color-primary: var(--color-primary-500);  /* OK：override */
}
```

不可：

```css
:root {
  --el-my-business-token: red;  /* ❌ 業務 token 不該用 --el- prefix */
}
```

## 違規排除（allow-list）

如有 known-good 例外（例如第三方庫 CSS），可在 stylelint config 中 ignore 該 file 或加 comment `/* stylelint-disable-next-line ivy/canonical-token-prefix */`。

## Refs

- Spec: `~/Desktop/ivy-backend/docs/superpowers/specs/2026-05-28-observability-forensic-and-design-tokens-design.md` Ch4
- Stylelint plugin: `scripts/stylelint/canonical-token-prefix.js`
- Baseline script: `scripts/lint-tokens.mjs`
