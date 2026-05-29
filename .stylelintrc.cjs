module.exports = {
  customSyntax: 'postcss-html',  // 支援 Vue SFC <style> 區塊
  plugins: ['./scripts/stylelint/canonical-token-prefix.cjs'],
  rules: {
    'ivy/canonical-token-prefix': [
      true,
      {
        severity: 'warning',
        deprecated: ['ivy', 'brand', 'pt', 'm3', 'neutral'],
      },
    ],
  },
  ignoreFiles: [
    'node_modules/**',
    'dist/**',
    '**/*.d.ts',
    'src/api/_generated/**',
  ],
};
