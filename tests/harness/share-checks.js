// Browser-only export checks. Run against the harness with the curated backend:
//   await (await import('./share-checks.js')).run(window.__trophy)
// The test-only module exposes private helpers without changing the shipped plugin.
export async function run(t) {
  const source = await (await fetch('/desktop/plugin.js')).text()
  const instrumented = source.replace('export default {', 'export const shareTest = { createShareImage, achievementPresentation, wrapShareText, R };\nexport default {')
  const moduleURL = URL.createObjectURL(new Blob([instrumented], { type: 'text/javascript' }))
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })
  let helpers
  try { helpers = (await import(moduleURL)).shareTest } finally { URL.revokeObjectURL(moduleURL) }
  helpers.R.ctx = t.ctx
  const state = t.state()
  const overflow = []
  const text = []
  const original = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...args) {
    const { width: cw, height: ch } = this.canvas
    if ((cw === 1600 && ch === 900) || (cw === 744 && ch === 1040)) {
      const width = this.measureText(value).width
      const left = this.textAlign === 'right' ? x - width : this.textAlign === 'center' ? x - width / 2 : x
      if (left < 0 || left + width > cw || y < 0 || y > ch) overflow.push({ value, x, y, width })
      text.push(String(value))
    }
    return original.call(this, value, x, y, ...args)
  }
  const exports = []
  try {
    for (const c of state.catalog) {
      const pr = state.progress[c.id]
      const tier = pr?.tier >= 0 ? pr.tier : c.thresholds.length ? 0 : 2
      const sample = { ...pr, state: 'unlocked', tier, value: c.thresholds.length ? Math.max(c.thresholds[tier], pr?.value || 0) : 100 }
      const result = await helpers.createShareImage(c, sample)
      const img = await createImageBitmap(result.blob)
      exports.push({ id: c.id, width: img.width, height: img.height, bytes: result.blob.size })
      img.close()
    }
    add('every catalog title exports as a complete landscape PNG', exports.length === state.catalog.length && exports.every(x => x.width === 1600 && x.height === 900 && x.bytes > 1000), exports)
    const c = state.catalog.find(c => c.id === 'subagent_commander') || state.catalog.find(c => c.thresholds.length === 5)
    for (let tier = 0; tier < 5; tier++) {
      const result = await helpers.createShareImage(c, { state: 'unlocked', tier, value: c.thresholds[tier] + 4 })
      add(`tier ${tier} has a distinct named image export`, result.filename.endsWith(`-${['copper', 'silver', 'gold', 'diamond', 'olympian'][tier]}.png`))
    }
    const cardOnly = await helpers.createShareImage(c, { state: 'unlocked', tier: 4, value: c.thresholds[4] + 4 }, 'card')
    add('the card alone exports at twice its layout size', cardOnly.width === 1488 && cardOnly.height === 2080 && cardOnly.filename.endsWith('-olympian-card.png'))
    const model = helpers.achievementPresentation(c, { state: 'unlocked', tier: 0, value: c.thresholds[0] + 4 })
    add('earned milestone remains separate from current total', model.milestone === c.thresholds[0] && model.v === c.thresholds[0] + 4)
    const cv = document.createElement('canvas'), g = cv.getContext('2d')
    g.font = '600 32px sans-serif'
    const longToken = 'VeryLongUnbrokenTrophyIdentifier'.repeat(8)
    const lines = helpers.wrapShareText(g, longToken, 764)
    add('unbroken names wrap without losing characters', lines.join('') === longToken && lines.every(line => g.measureText(line).width <= 764))
    add('no drawn text crosses the PNG boundary', overflow.length === 0, overflow)
    add('exports do not truncate names with ellipses', !text.some(x => x.endsWith('...')))
    let rejected = false
    try { await helpers.createShareImage(c, { state: 'secret', tier: -1, value: 0 }) } catch { rejected = true }
    add('secret trophies cannot be exported', rejected)
  } finally {
    CanvasRenderingContext2D.prototype.fillText = original
    helpers.R.ctx = null
  }
  return out
}
