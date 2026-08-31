// ESLint flat config — 極小集，唯一目的：把 CLAUDE.md「禁 : any / as any」從靠自律
// 變成 CI 工具強制（no-explicit-any）。既有違規以 inline
// `eslint-disable-next-line @typescript-eslint/no-explicit-any` 逐處 grandfather（126 個），
// 搭配 reportUnusedDisableDirectives: 'error' 當棘輪：新違規一律擋；
// 修掉一個 any 後忘刪 disable 會變 unused directive 直接報錯，棘輪只會收緊不會鬆。
//
// 刻意「極小」：不開 typescript-eslint / eslint-plugin-vue 的 recommended 規則集，
// 避免一次冒出數百個無關 noise。只保留兩條與 TS-strict 承諾直接相關的規則。
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

// 允許帶說明的 // @ts-expect-error TODO(ts-strict): <reason>（CLAUDE.md 過渡慣例）；
// 禁裸 @ts-ignore / @ts-nocheck（比 expect-error 危險、不會隨型別修好而報錯）。
const banTsComment = ['error', {
  'ts-expect-error': 'allow-with-description',
  'ts-ignore': true,
  'ts-nocheck': true,
  'ts-check': false,
  minimumDescriptionLength: 3,
}]

// 擋 UTC 取日期反模式：`x.toISOString().slice(...)` / `x.toISOString().split(...)`。
// 台北 UTC+8 下 toISOString() 會偏成 UTC 日期（凌晨 0~8 點偏成昨天；本地午夜的
// Date 任何時刻都偏成前一天）。取 YYYY-MM-DD 一律用 src/utils/format.ts 的
// todayISO / dateToLocalISO。完整 toISOString()（送後端 timestamp）不在此限。
const UTC_DATE_SLICE_MESSAGE =
  'toISOString() 是 UTC，台北會跨日；取 YYYY-MM-DD 請用 todayISO / dateToLocalISO（src/utils/format.ts）'
const noUtcDateSliceRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
      message: UTC_DATE_SLICE_MESSAGE,
    },
    {
      selector:
        "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']",
      message: UTC_DATE_SLICE_MESSAGE,
    },
  ],
}

const noAnyRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/ban-ts-comment': banTsComment,
  ...noUtcDateSliceRules,
}

export default tseslint.config(
  {
    // 棘輪：每個 eslint-disable-next-line 都必須對應到真正的違規。
    // 修掉一個 any 卻忘了刪上方的 disable → 變成 unused directive → CI 報錯逼你清掉。
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    // 不掃：建置產物、coverage 報表產物（istanbul HTML helper 自帶 eslint-disable）、
    // codegen 型別（schema.d.ts 50k 行）、自動產生的宣告檔、vite 暫存檔。
    ignores: [
      'dist/**',
      'dist-debug/**',
      'coverage/**',
      '.claude/worktrees/**',
      'src/api/_generated/**',
      'auto-imports.d.ts',
      'components.d.ts',
      '**/*.timestamp-*.mjs',
      'public/**',
    ],
  },

  // TypeScript 原始檔
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: noAnyRules,
  },

  // Vue SFC：flat/base 掛上 vue-eslint-parser（最小，不含 style 規則），
  // 再把 <script lang="ts"> 委派給 tseslint.parser。
  ...pluginVue.configs['flat/base'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: { ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: noAnyRules,
  },

  // .js / .mjs（測試、腳本、設定）：不掛 any 禁令，但 UTC 日期反模式照擋，
  // 避免從測試碼回潮。
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: noUtcDateSliceRules,
  },

  // 測試 / 設定 / 腳本：放寬 any 禁令（對齊 CLAUDE.md「測試可寬鬆、可 .js」精神）。
  {
    files: [
      '**/__tests__/**',
      '**/*.test.{ts,js,mjs}',
      '**/*.spec.{ts,js,mjs}',
      'tests/**',
      'scripts/**',
      '*.config.{js,ts,mjs}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
)
