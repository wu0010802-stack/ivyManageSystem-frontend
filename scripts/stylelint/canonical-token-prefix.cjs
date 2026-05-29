/**
 * stylelint plugin: ivy/canonical-token-prefix
 *
 * 偵測 declaration value 中 var(--{prefix}-...) 使用的 prefix 是否屬於：
 *   - raw (--color)：OK
 *   - elementPlusOverrideOnly (--el)：覆寫情境合法
 *   - designDimensions (--space/--text/...)：OK
 *   - deprecated (--ivy/--brand/--pt/--m3/--neutral)：警告
 *
 * Refs: docs/TOKENS.md
 */

const stylelint = require('stylelint');

const ruleName = 'ivy/canonical-token-prefix';

const messages = stylelint.utils.ruleMessages(ruleName, {
  deprecated: (prefix, varname) =>
    `Token prefix '--${prefix}-' is deprecated. Use 'var(--color-*)' or design-dimension prefix instead (found in 'var(${varname})'). See docs/TOKENS.md.`,
});

const meta = {
  url: 'https://github.com/wu0010802-stack/ivyManageSystem-frontend/blob/main/docs/TOKENS.md',
};

const VAR_REGEX = /var\(\s*(--([a-z0-9]+)-[\w-]+)/gi;

const plugin = stylelint.createPlugin(ruleName, (primary, secondaryOptions) => {
  return (root, result) => {
    if (!primary) return;

    const opts = secondaryOptions || {};
    const deprecated = new Set(opts.deprecated || ['ivy', 'brand', 'pt', 'm3', 'neutral']);

    root.walkDecls((decl) => {
      const value = decl.value || '';
      VAR_REGEX.lastIndex = 0;
      let match;
      while ((match = VAR_REGEX.exec(value)) !== null) {
        const varname = match[1];   // 例 '--brand-primary'
        const prefix = match[2];    // 例 'brand'

        if (deprecated.has(prefix)) {
          stylelint.utils.report({
            message: messages.deprecated(prefix, varname),
            node: decl,
            result,
            ruleName,
            severity: opts.severity || 'warning',
          });
        }
      }
    });
  };
});

plugin.ruleName = ruleName;
plugin.messages = messages;
plugin.meta = meta;

module.exports = plugin;
