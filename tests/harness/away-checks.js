// Browser integration checks for the real plugin's away-unlock collection.
// Run with api=fixture&unseen=0, then await run(window.__trophy).
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const collection = () => document.querySelector('.tr-away-dialog,.tr-away-inline')
const button = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const until = async fn => {
  for (let i = 0; i < 60; i++) {
    if (fn()) return true
    await sleep(50)
  }
  return false
}
const close = async () => {
  const dialog = document.querySelector('.tr-dialog,.tr-away-dialog,.tr-away-inline')
  const x = dialog?.querySelector('.hb-dialog-x,button[aria-label="Close"],.tr-away-close')
  x?.click()
  await until(() => !document.querySelector('.tr-dialog,.tr-away-dialog,.tr-away-inline'))
}
const replay = async t => {
  t.navigate('/settings')
  t.settingsPage('settings', 'data')
  await until(() => button(document, 'Replay'))
  button(document, 'Replay').click()
  await until(collection)
}
export async function run(t) {
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })
  t.failPaths.add('/signal')
  await sleep(2900)
  const state = t.state()
  const candidates = state.catalog.filter(c => !c.secret && c.thresholds.length === 5 && state.progress[c.id].tier >= 0).slice(0, 5)
  for (const c of candidates) await t.outsideUnlock(c.id, state.progress[c.id].tier)
  await t.refetchState()
  await until(() => t.popup()?.textContent.includes('5 trophies unlocked'))
  t.popup()?.click()
  await until(collection)
  add('five away unlocks open their card collection from the notification', !!collection())
  if (!collection()) return out
  const ids = () => [...collection().querySelectorAll('[data-away-id]')].map(e => e.dataset.awayId)
  add('collection contains exactly the actual five unlocked trophies', ids().length === 5 && candidates.every(c => ids().includes(c.id)), ids())
  add('seen acknowledgement names only the displayed batch', t.restLog.some(r => r.path === '/seen' && r.body?.ids?.length === 5 && candidates.every(c => r.body.ids.includes(c.id))))
  await until(() => !!collection().querySelector('.tr-tc-front img')?.naturalWidth)
  add('collection uses the existing rendered trophy card', !!collection().querySelector('.tr-tc-front img')?.naturalWidth)
  await until(() => !collection().querySelector('.tr-tc[data-flipped]'))
  const first = collection().querySelector('[data-away-id]')
  first.querySelector('.tr-tc').click()
  await sleep(80)
  add('each collected card can flip independently', first.querySelector('.tr-tc').hasAttribute('data-flipped') && !collection().querySelectorAll('.tr-tc')[1].hasAttribute('data-flipped'))
  button(first, 'Full view').click()
  await until(() => document.querySelector('.tr-dlg-full'))
  add('full view reuses the existing large card viewer', !!document.querySelector('.tr-dlg-full .tr-tc'))
  button(document, 'Back to collection')?.click()
  await until(collection)
  add('returning from full view retains the entire collection', !!collection() && ids().length === 5)
  add('returning from full view preserves the individual flip state', !!collection()?.querySelector('[data-away-id] .tr-tc[data-flipped]'))
  const restore = t.dupAnchor('titleBar.center')
  await sleep(100)
  add('duplicate mount does not duplicate the collection window', document.querySelectorAll('.tr-away-dialog,.tr-away-inline').length === 1)
  restore()
  await close()
  await replay(t)
  add('settings replay retains all five cards after seen acknowledgement', !!collection() && ids().length === 5 && candidates.every(c => ids().includes(c.id)), ids())
  const profile = t.host.state.profile.get()
  t.host.state.profile.set('away-test-other-profile')
  await until(() => !collection())
  add('switching profile closes the old profile collection', !collection())
  await replay(t)
  add('another profile has an honest empty collection instead of copied history', !!collection() && ids().length === 0 && /no saved away collection|no away|no trophies/i.test(collection().textContent))
  await close()
  t.host.state.profile.set(profile)
  await replay(t)
  add('returning to the original profile preserves its batch', !!collection() && ids().length === 5)
  await close()
  return out
}
export async function verifyPersistedReplay(t) {
  const out = []
  await sleep(2900)
  await replay(t)
  const count = collection()?.querySelectorAll('[data-away-id]').length || 0
  out.push({ name: 'last away collection survives a real renderer reload', ok: count === 5, detail: count })
  await close()
  return out
}

export async function verifyEdges(t) {
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })
  t.failPaths.add('/signal')
  await close()
  const before = new Set(t.toasts().map(x => x.id))
  t.failPaths.add('/state')
  await replay(t)
  add('failed replay reports an error instead of showing an invented collection', !collection() && t.toasts().some(x => !before.has(x.id) && /could not load your away trophies/i.test(x.message)))
  t.failPaths.delete('/state')
  const profile = t.host.state.profile.get()
  const baseRest = t.ctx.rest
  t.ctx.rest = async (path, options) => {
    if (path === '/state') await sleep(180)
    return baseRest(path, options)
  }
  button(document, 'Replay').click()
  t.host.state.profile.set('away-test-request-in-flight')
  await sleep(450)
  add('a late replay response cannot reopen a different profile collection', !collection())
  t.ctx.rest = baseRest
  t.host.state.profile.set(profile)
  const key = `away-collection:${profile || 'default'}`
  const saved = t.ctx.storage.get(key)
  t.ctx.storage.set(key, { version: 1, entries: [{ id: 'not-in-the-catalog', tier: 4 }, { id: t.state().catalog[0].id, tier: 7 }, { id: t.state().catalog[0].id, tier: '2' }] })
  await replay(t)
  add('unknown and malformed stored trophies are excluded safely', !!collection() && !collection().querySelector('[data-away-id]'))
  const beforeRecent = JSON.stringify(t.ctx.storage.get(key))
  button(collection(), 'View recent trophies')?.click()
  await until(() => collection()?.querySelector('h4')?.textContent === 'Recent trophies')
  const recentIds = [...collection().querySelectorAll('[data-away-id]')].map(x => x.dataset.awayId)
  add('an empty away collection can open real recent trophy cards', recentIds.length === 3 && recentIds.every(id => t.state().progress[id]?.tier >= 0))
  add('recent trophies are labeled honestly, not as new away unlocks', collection()?.querySelector('h4')?.textContent === 'Recent trophies' && !collection().textContent.includes('While you were away'))
  add('viewing recent trophies does not overwrite the saved away batch', JSON.stringify(t.ctx.storage.get(key)) === beforeRecent)
  await close()
  t.ctx.storage.set(key, saved)
  await replay(t)
  add('a valid stored collection is still readable after an invalid snapshot', collection()?.querySelectorAll('[data-away-id]').length === 5)
  await close()
  button(document, 'Reset').click()
  await until(() => document.querySelector('[role=dialog]'))
  button(document.querySelector('[role=dialog]'), 'Reset').click()
  await until(() => !document.querySelector('[role=dialog]'))
  await replay(t)
  add('reset clears the retained collection rather than replaying old unlocks', !!collection() && !collection().querySelector('[data-away-id]') && !t.ctx.storage.get(key))
  await close()
  return out
}
