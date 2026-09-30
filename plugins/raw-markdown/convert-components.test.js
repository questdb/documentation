const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const matter = require('gray-matter')
const { removeImports } = require('./convert-components')

test('removes MDX imports but keeps TypeScript imports in fenced examples', () => {
  const markdown = [
    'import Widget from "@site/src/components/Widget"',
    'import {',
    '  Tabs,',
    '  TabItem,',
    '} from "@theme/Tabs"',
    '',
    '```typescript',
    'import {',
    '  connectQwpNodeClient,',
    '  QwpEgressQueryError,',
    '} from "@questdb/nodejs-client";',
    '```',
    '',
    '~~~ts',
    'import { client } from "@questdb/nodejs-client";',
    '~~~',
  ].join('\n')

  const result = removeImports(markdown)
  assert.doesNotMatch(result, /@site\/src\/components\/Widget|@theme\/Tabs/)
  assert.match(result, /```typescript\nimport \{\n  connectQwpNodeClient,\n  QwpEgressQueryError,\n\} from "@questdb\/nodejs-client";\n```/)
  assert.match(result, /~~~ts\nimport \{ client \} from "@questdb\/nodejs-client";\n~~~/)
})

test('preserves imports from the Node.js Quick start while removing its MDX import', () => {
  const file = path.join(__dirname, '../../documentation/connect/clients/nodejs.md')
  const { content } = matter(fs.readFileSync(file, 'utf8'))
  const result = removeImports(content)

  assert.doesNotMatch(result, /^import SfDedupWarning from /m)
  assert.match(result, /```typescript\nimport \{\n  connectQwpNodeClient,\n  QwpEgressQueryError,\n\} from "@questdb\/nodejs-client";/)
})
