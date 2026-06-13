// Flags hardcoded Tailwind color utilities in JSX string literals.
// Use semantic tokens instead (bg-page, text-ink, text-accent, border-line, …).
const FORBIDDEN = /\b(?:bg|text|border)-(?:gray|zinc|neutral|slate|orange|red|green|blue)-\d{2,3}\b/

const plugin = {
  rules: {
    'no-hardcoded-colors': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow hardcoded Tailwind color classes; use semantic theme tokens.' },
        schema: [],
        messages: { hardcoded: 'Hardcoded color class "{{ match }}". Use a semantic token (e.g. bg-page, text-ink, text-accent, border-line).' },
      },
      create(context) {
        function check(node, value) {
          if (typeof value !== 'string') return
          const m = value.match(FORBIDDEN)
          if (m) context.report({ node, messageId: 'hardcoded', data: { match: m[0] } })
        }
        return {
          Literal(node) { check(node, node.value) },
          TemplateElement(node) { check(node, node.value.raw) },
        }
      },
    },
  },
}

export default plugin
