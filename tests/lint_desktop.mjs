// Grep-level check of desktop/plugin.js against the Hermes catalog rules for Desktop plugins.
// Run: node tests/lint_desktop.mjs   (exit code 1 on any finding)
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = resolve(root, 'desktop/plugin.js')
const src = readFileSync(file, 'utf8')
const lines = src.split('\n')

const ALLOWED_IMPORTS = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
const findings = []
const add = (line, msg) => findings.push(`desktop/plugin.js:${line}: ${msg}`)

// Strip comments and string/template contents is overkill here; we only skip full-line comments.
lines.forEach((raw, i) => {
  const n = i + 1
  const line = raw.trim()
  if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return

  const imp = /^import\s[^'"]*from\s+['"]([^'"]+)['"]/.exec(line) || /^import\s+['"]([^'"]+)['"]/.exec(line)
  if (imp && !ALLOWED_IMPORTS.has(imp[1])) add(n, `import of "${imp[1]}" is not allowed`)

  const banned = [
    [/\bimport\s*\(/, 'dynamic import()'],
    [/\beval\s*\(/, 'eval'],
    [/new\s+Function\b/, 'new Function'],
    [/\bdocument\.(querySelector|querySelectorAll|getElementById|getElementsBy\w+)\b/, 'document query (app markup is off limits)'],
    [/\bwindow\.hermesDesktop\b|\bhermesDesktop\b/, 'raw window.hermesDesktop bridge'],
    [/\bMutationObserver\b/, 'MutationObserver'],
    [/\.prototype\b/, 'prototype access'],
    [/Object\.defineProperty\s*\(/, 'Object.defineProperty'],
    [/Object\.setPrototypeOf\b|__proto__/, 'prototype patching'],
    [/createElement\(\s*['"](script|style|link)['"]/, 'script/style/link element injection'],
    [/document\.(head|body)\.(append|appendChild|insertBefore|prepend)/, 'DOM injection into head/body'],
    [/data-(slot|tour|sidebar|testid)\b/, 'app markup selector'],
    [/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/, 'raw HTML injection'],
    [/\b(localStorage|sessionStorage|indexedDB)\b/, 'raw browser storage (use ctx.storage)'],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/, 'network call (use ctx.rest)'],
    [/\bsetInterval\s*\(/, 'bare setInterval (use ctx.setInterval)'],
    [/\bwindow\.(addEventListener|setInterval)\b/, 'untracked window listener/timer'],
    // The Hermes install scanner reads "!" followed by a backtick snippet as an inline shell exec.
    [/!`[^`\s][^`\n]*`/, 'bang + backtick snippet (the scanner reads it as inline_shell_exec)']
  ]
  for (const [re, label] of banned) if (re.test(raw)) add(n, label)

  if (/—/.test(raw)) add(n, 'em dash in source')
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(raw)) add(n, 'emoji in source')
  if (/Co-Authored-By|Generated with|Claude/i.test(raw)) add(n, 'attribution text')
})

// The single default export and register(ctx).
if (!/export default\s*\{/.test(src)) findings.push('desktop/plugin.js: missing default export')
if (!/register\(ctx\)/.test(src)) findings.push('desktop/plugin.js: missing register(ctx)')
if ((src.match(/\bexport\b/g) || []).length !== 1) findings.push('desktop/plugin.js: exactly one export (the default plugin object) expected')

if (findings.length) {
  console.error(`lint_desktop: ${findings.length} finding(s)`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`lint_desktop: ok (${lines.length} lines, imports limited to ${[...ALLOWED_IMPORTS].join(', ')})`)
