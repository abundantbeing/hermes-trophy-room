// Behavioural checks for desktop/plugin.js, run inside the harness (fixture or the real dev server):
//   open /tests/harness/index.html?bare=1  then  await window.__runChecks()
// Returns [{ name, ok, detail }]. Every check goes through the real plugin code and the visible DOM.
// Trophies are picked from the live catalog, so the same suite runs against both backends.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const byText = (sel, text, root = document) => $$(sel, root).find(b => b.textContent.trim() === text)

async function setting(t, rowButton) {
  t.navigate('/settings')
  await sleep(250)
  t.settingsPage('settings', null)
  await sleep(150)
  const b = byText('.hb-seg button', rowButton)
  if (!b) throw new Error(`no settings button "${rowButton}"`)
  b.click()
  await sleep(80)
}
async function toggle(t, sub, title, wantOn) {
  t.navigate('/settings')
  await sleep(200)
  t.settingsPage('settings', sub)
  await sleep(150)
  const row = $$('.tr-row').find(r => r.textContent.includes(title))
  const sw = row?.querySelector('[role=switch]')
  if (!sw) throw new Error(`no switch "${title}"`)
  if ((sw.getAttribute('aria-checked') === 'true') !== wantOn) sw.click()
  await sleep(80)
}
const popup = () => document.querySelector('.tr-pop .tr-card')
const rectOf = el => {
  // Headless browsers can throttle animation frames: settle every running animation before measuring.
  for (const a of el.getAnimations?.({ subtree: true }) || []) {
    try {
      a.finish()
    } catch {
      /* infinite animations (rays) cannot finish */
    }
  }
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }
}
async function clearPopup(t) {
  for (let i = 0; i < 8 && popup(); i++) {
    popup().click()
    await sleep(600)
  }
  document.querySelector('.tr-away-close')?.click()
  await sleep(100)
  t.navigate('/')
  await sleep(300)
}

export async function run(t) {
  if (t.flags.nopopover || t.flags.nodialog) return runFallbacks(t)
  if (t.flags.artall) return runLazyArt(t)
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail: String(detail) })
  const errors = []
  const onErr = e => errors.push(e.message || String(e))
  window.addEventListener('error', onErr)
  const mode = t.mode

  add('plugin loaded', t.loaded, t.error || '')
  // Signals are logged but rejected, so page visits cannot unlock Sightseer or Tinkerer mid-run and add stray pop-ups.
  t.failPaths.add('/signal')
  const reg = t.registry.items.map(i => i.area)
  for (const a of ['routes', 'sidebarNav', 'statusBar.right', 'statusBar.left', 'titleBar.center', 'palette', 'keybinds']) add(`registered area ${a}`, reg.includes(a))
  add('settings page + 3 sub-pages', t.registry.settings[0]?.children?.length === 3)

  // Let the boot summary (unseen queue) show and clear, so it does not disturb the checks.
  t.navigate('/')
  const unseen0 = (await t.ctx.rest('/state')).unseen.length
  let sawBoot = false
  for (let i = 0; i < 20 && !sawBoot; i++) {
    await sleep(250)
    sawBoot = !!popup() && /trophy unlocked|trophies unlocked/i.test(popup().textContent) && /away/i.test(popup().textContent)
  }
  if (unseen0 > 0) add('boot: away summary card for the unseen queue', sawBoot, popup()?.textContent)
  await clearPopup(t)
  if (unseen0 > 0) add('boot: unseen queue marked seen', (await t.ctx.rest('/state')).unseen.length === 0)

  const st0 = t.state()
  const pr = id => t.state().progress[id]
  const tiered = st0.catalog.filter(c => c.thresholds.length === 5 && pr(c.id).state === 'unlocked')
  const [A, B, C, D, E] = tiered
  const names = [A, B, C].map(c => c.name)

  // ---- looks x places ------------------------------------------------------------------------
  const vw = innerWidth
  const vh = innerHeight
  const looks = ['Podium', 'Tile', 'Card']
  const places = [
    ['Top centre', 'top'],
    ['Top right', 'top'],
    ['Bottom right', 'bottom'],
    ['Bottom left', 'bottom']
  ]
  for (const look of looks) {
    for (const [place, edge] of places) {
      await setting(t, look)
      await setting(t, place)
      t.navigate('/')
      await sleep(250)
      t.fireTier(2, A.id)
      await sleep(900)
      const p = popup()
      if (!p) {
        add(`${look} @ ${place}`, false, 'no pop-up node')
        continue
      }
      const r = rectOf(p)
      const inside = r.x >= 0 && r.y >= 0 && r.r <= vw + 0.5 && r.b <= vh + 0.5
      const placed = edge === 'top' ? r.y < 140 : r.b > vh - 70 && r.b < vh
      const lookOk = p.className.includes(look === 'Podium' ? 'tr-podium' : look === 'Tile' ? 'tr-tile' : 'tr-big')
      let hz = true
      if (place === 'Top centre') hz = Math.abs(r.x + r.w / 2 - vw / 2) < 6
      if (place === 'Top right' || place === 'Bottom right') hz = r.r > vw - 60
      if (place === 'Bottom left') hz = r.x < 300
      add(`${look} @ ${place}`, inside && placed && lookOk && hz, `rect=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)} inside=${inside} placed=${placed} look=${lookOk} horiz=${hz}`)
      if (look === 'Card' && place === 'Top centre') {
        const art = p.querySelector('.art')
        const img = art?.querySelector('img')
        add('large popup shows the complete square artwork', !!img && getComputedStyle(img).objectFit === 'contain' && Math.abs(art.clientWidth - art.clientHeight) <= 1)
      }
      await clearPopup(t)
    }
  }

  // ---- auto look per tier ------------------------------------------------------------------------
  await setting(t, 'Auto')
  await setting(t, 'Top centre')
  const want = ['tr-tile', 'tr-tile', 'tr-podium', 'tr-podium', 'tr-big']
  for (let tier = 0; tier < 5; tier++) {
    t.navigate('/')
    await sleep(250)
    t.fireTier(tier, A.id)
    await sleep(800)
    add(`auto look tier ${tier}`, popup()?.className.includes(want[tier]), popup()?.className)
    await clearPopup(t)
  }

  // ---- queue order --------------------------------------------------------------------------------
  t.navigate('/')
  await sleep(250)
  t.fireTier(0, A.id)
  t.fireTier(1, B.id)
  t.fireTier(2, C.id)
  await sleep(900)
  const seen = []
  for (let i = 0; i < 3; i++) {
    seen.push(popup()?.querySelector('.nm')?.textContent)
    popup()?.click()
    t.navigate('/')
    await sleep(900)
  }
  add('queue shows one at a time, in order', seen.join('|') === names.join('|'), seen.join('|'))
  await clearPopup(t)

  // ---- smallest tier ------------------------------------------------------------------------------
  await setting(t, 'Gold')
  t.navigate('/')
  await sleep(250)
  t.fireTier(0, A.id)
  await sleep(700)
  add('minTier Gold hides Copper', !popup())
  t.fireTier(2, B.id)
  await sleep(800)
  add('minTier Gold shows Gold', !!popup())
  await clearPopup(t)
  await setting(t, 'Copper')

  // ---- quiet while busy ---------------------------------------------------------------------------
  t.navigate('/')
  await sleep(250)
  t.setBusy(true)
  t.fireTier(2, C.id)
  await sleep(800)
  add('held while the turn is busy', !popup())
  t.setBusy(false)
  await sleep(800)
  add('released when the turn ends', !!popup())
  await clearPopup(t)
  await toggle(t, 'notifications', 'Hold pop-ups until the turn ends', false)
  t.navigate('/')
  await sleep(250)
  t.setBusy(true)
  t.fireTier(2, D.id)
  await sleep(800)
  add('quiet off: shows while busy', !!popup())
  t.setBusy(false)
  await clearPopup(t)
  await toggle(t, 'notifications', 'Hold pop-ups until the turn ends', true)

  // ---- OS notification ------------------------------------------------------------------------------
  const artIds = (await t.ctx.rest('/art-index')).ids || []
  const artEntry = st0.catalog.find(c => artIds.includes(c.id)) || E
  t.navigate('/')
  await sleep(250)
  const before = t.osLog.length
  t.setFocus(true)
  t.fireTier(2, artEntry.id)
  await sleep(800)
  add('no OS notification while focused', t.osLog.length === before)
  await clearPopup(t)
  t.setFocus(false)
  t.fireTier(3, artEntry.id)
  await sleep(1000)
  const n = t.osLog[t.osLog.length - 1]
  add('OS notification when away', t.osLog.length === before + 1 && n?.title?.includes(artEntry.name), n?.title)
  if (artIds.includes(artEntry.id)) add('OS notification carries the real-art icon', new RegExp(`${artEntry.id}\\.png$`).test(n?.icon || ''), n?.icon)
  else add('OS notification without real art goes out icon-less (backend has no art yet)', !n?.icon, n?.icon || 'no icon')
  add('OS notification is silent (own sound plays)', n?.silent === true)
  add('OS notification activates the trophy room', n?.activate === '/trophy-room')
  t.setFocus(true)
  await clearPopup(t)
  await toggle(t, 'notifications', 'Desktop notification when I am away', false)
  t.setFocus(false)
  t.navigate('/')
  await sleep(250)
  const b2 = t.osLog.length
  t.fireTier(2, B.id)
  await sleep(800)
  add('OS toggle off: nothing sent', t.osLog.length === b2)
  t.setFocus(true)
  await clearPopup(t)
  await toggle(t, 'notifications', 'Desktop notification when I am away', true)

  // ---- on-the-window effects -------------------------------------------------------------------------------
  t.navigate('/')
  await sleep(250)
  t.fireTier(2, C.id)
  await sleep(500)
  add('window glow: title-bar and status chip flash', !!document.querySelector('.tr-anchor.tr-flash') && !!document.querySelector('.tr-chip.tr-flash'))
  await clearPopup(t)

  // ---- in-app off ----------------------------------------------------------------------------------------
  await toggle(t, 'notifications', 'Pop-up in the app', false)
  t.navigate('/')
  await sleep(250)
  t.fireTier(2, D.id)
  await sleep(800)
  add('in-app off: no pop-up', !popup())
  await toggle(t, 'notifications', 'Pop-up in the app', true)

  // ---- sound ------------------------------------------------------------------------------------------------
  t.navigate('/')
  await sleep(250)
  const s0 = t.audio.osc
  t.fireTier(4, A.id)
  await sleep(800)
  add('olympian sound plays notes', t.audio.osc - s0 >= 8, `oscillators +${t.audio.osc - s0}`)
  await clearPopup(t)
  await toggle(t, 'sound', 'Play the Hermes Synth sting', false)
  t.navigate('/')
  await sleep(250)
  const s1 = t.audio.osc
  t.fireTier(2, B.id)
  await sleep(800)
  add('muted: no notes', t.audio.osc === s1, `oscillators +${t.audio.osc - s1}`)
  await clearPopup(t)
  await toggle(t, 'sound', 'Play the Hermes Synth sting', true)

  // ---- clicking a pop-up opens the trophy ---------------------------------------------------------------
  t.navigate('/')
  await sleep(250)
  t.fireTier(2, C.id)
  await sleep(800)
  popup()?.click()
  await sleep(900)
  const dl = document.querySelector('[role=dialog]')
  add('click opens the trophy room on that trophy', location.hash.startsWith('#/trophy-room') && !!dl && dl.textContent.includes(C.name), location.hash)
  document.querySelector('.hb-dialog-x')?.click()
  await sleep(200)

  // ---- gallery ----------------------------------------------------------------------------------------------
  t.navigate('/trophy-room')
  await sleep(1200)
  const cat = t.state().catalog
  add('gallery lists every entry', $$('.tr-ac').length === cat.length, `${$$('.tr-ac').length}/${cat.length}`)
  const galleryProgress = t.state().progress
  const artMatchesTier = $$('.tr-ac').every(card => {
    const pr = galleryProgress[card.getAttribute('data-trophy')]
    const img = card.querySelector('img.tr-art')
    if (!img) return false
    if (pr?.state === 'secret' || (pr?.tier ?? -1) < 0) return !img.hasAttribute('data-art-tier')
    // graded by filter once shown; Olympian arrives already finished (a blob); a tile off screen is still a blank
    return img.getAttribute('data-art-tier') === String(pr.tier) && (!!img.style.filter || img.src.startsWith('blob:') || img.classList.contains('tr-art-wait'))
  })
  const filters = $$('filter[id^="tr-grade-"]').map(el => el.id)
  add('earned art uses its tier and hidden art stays ungraded', artMatchesTier && filters.length === new Set(filters).size)
  const glintsMatchTier = $$('.tr-ac').every(card => {
    const pr = galleryProgress[card.getAttribute('data-trophy')]
    const glints = card.querySelector('.tr-glints')
    const foil = card.querySelector('.tr-art-foil')
    if (pr?.state === 'unlocked' && pr.tier >= 3) {
      const wantEmbers = pr.tier >= 4 ? 3 : 0
      return glints?.getAttribute('aria-hidden') === 'true' && glints.querySelectorAll('i').length === 4 && glints.querySelectorAll('b').length === wantEmbers && (!!foil || !!card.querySelector('.tr-art-wait')) && !card.querySelector('.tr-art-lustre')
    }
    return !glints && !foil
  })
  add('sparkles and sculpture foil appear only on unlocked Diamond and Olympian trophies', glintsMatchTier)
  const totals = t.state().totals
  const tierStats = $$('.tr-tier-stat')
  add('gallery summary shows progress and each tier count',
    document.querySelector('.tr-h1')?.textContent === `${totals.unlocked} of ${totals.total} unlocked` &&
    document.querySelector('.tr-ring')?.getAttribute('aria-label') === `${Math.round((totals.total ? totals.unlocked / totals.total : 0) * 100)}%` &&
    tierStats.length === 5 && tierStats.every((el, i) => Number(el.querySelector('.tr-tier-count')?.textContent) === (totals.by_tier[i] ?? 0)))
  const artAtTop = $$('.tr-ac').every(card => Math.abs(card.querySelector('.tr-ac-im').getBoundingClientRect().top - card.getBoundingClientRect().top - card.clientTop) < 1)
  add('gallery artwork sits flush at the top of every card', artAtTop)
  let tierFiltersWork = true
  for (let i = 0; i < 5; i++) {
    tierStats[i].click()
    await sleep(120)
    const expected = Object.values(galleryProgress).filter(p => p.state === 'unlocked' && p.tier === i).length
    const cards = $$('.tr-ac')
    tierFiltersWork &&= tierStats[i].getAttribute('aria-pressed') === 'true' && cards.length === expected && cards.every(card => galleryProgress[card.dataset.trophy]?.tier === i && galleryProgress[card.dataset.trophy]?.state === 'unlocked')
    tierStats[i].click()
    await sleep(120)
    tierFiltersWork &&= tierStats[i].getAttribute('aria-pressed') === 'false' && $$('.tr-ac').length === cat.length
  }
  add('tier summary buttons filter unlocked trophies and toggle back to all', tierFiltersWork)
  const originalState = t.state()
  t.queryClient.setQueryData(['trophy-room', 'state'], { ...originalState, totals: { ...totals, unlocked: 0, total: 0 } })
  await sleep(150)
  add('progress wheel handles an empty catalog', document.querySelector('.tr-ring')?.getAttribute('aria-label') === '0%' && !document.querySelector('.tr-ring-progress'))
  t.queryClient.setQueryData(['trophy-room', 'state'], { ...originalState, totals: { ...totals, unlocked: totals.total } })
  await sleep(150)
  add('progress wheel reaches 100 percent', document.querySelector('.tr-ring')?.getAttribute('aria-label') === '100%' && document.querySelector('.tr-ring-progress')?.getAttribute('stroke-dasharray') === '100 100')
  t.queryClient.setQueryData(['trophy-room', 'state'], originalState)
  await sleep(150)
  const refresh = document.querySelector('.tr-tools button[aria-label="Refresh"]')
  add('refresh is borderless beside search, outside the overview', !!refresh?.closest('.tr-search-tools') && !document.querySelector('.tr-head .tr-refresh-btn') && getComputedStyle(refresh).borderWidth === '0px')
  const stateRequests = t.restLog.filter(r => r.method === 'GET' && r.path === '/state').length
  refresh?.click()
  await sleep(250)
  add('icon-only refresh button is labeled and refetches the gallery',
    !refresh?.textContent.trim() && !!refresh?.querySelector('svg[aria-hidden="true"]') && t.restLog.filter(r => r.method === 'GET' && r.path === '/state').length > stateRequests)
  add('refresh completion is announced', document.querySelector('.tr-refresh-status')?.textContent === 'Gallery refreshed')
  byText('.hb-seg button', 'Unlocked')?.click()
  await sleep(250)
  add('Unlocked filter', $$('.tr-ac').length === Object.values(t.state().progress).filter(p => p.state === 'unlocked').length, `${$$('.tr-ac').length}`)
  byText('.hb-seg button', 'New')?.click()
  await sleep(250)
  add('New filter only shows source:new', $$('.tr-ac').length === cat.filter(c => c.source === 'new').length)
  byText('.hb-seg button', 'In progress')?.click()
  await sleep(250)
  add('In progress filter', $$('.tr-ac').length === Object.values(t.state().progress).filter(p => p.state === 'discovered').length)
  byText('.hb-seg button', 'Locked')?.click()
  await sleep(250)
  add('Locked filter (includes secret)', $$('.tr-ac').length === Object.values(t.state().progress).filter(p => p.state === 'locked' || p.state === 'secret').length)
  byText('.hb-seg button', 'All')?.click()
  const tabs = document.querySelector('.tr-tabs')
  const prevCategories = document.querySelector('[aria-label="Scroll categories left"]')
  const nextCategories = document.querySelector('[aria-label="Scroll categories right"]')
  tabs.scrollLeft = 0
  await sleep(150)
  const hasOverflow = tabs.scrollWidth > tabs.clientWidth + 1
  const startsAtEdge = prevCategories?.disabled && (!hasOverflow || !nextCategories?.disabled)
  if (hasOverflow) {
    nextCategories.click()
    await sleep(700)
  }
  add('category arrows reveal overflow and update their edge state', startsAtEdge && (!hasOverflow || (tabs.scrollLeft > 0 && !prevCategories.disabled)))
  const firstCategory = tabs.querySelector('[role=tab]')
  firstCategory.focus()
  firstCategory.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  await sleep(250)
  const lastCategory = tabs.querySelector('[role=tab]:last-child')
  add('category keyboard navigation reaches the last tab', lastCategory?.getAttribute('aria-selected') === 'true' && document.activeElement === lastCategory)
  lastCategory.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  await sleep(250)
  add('category keyboard navigation returns to All', firstCategory.getAttribute('aria-selected') === 'true' && document.activeElement === firstCategory)
  const tab = byText('.tr-tabs button', 'Memory')
  tab?.click()
  await sleep(250)
  add('category tab filters', $$('.tr-ac').length === cat.filter(c => c.category === 'Memory').length)
  byText('.tr-tabs button', 'All')?.click()
  const input = document.querySelector('.hb-search input')
  input.focus()
  const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  const word = A.name.split(' ')[0].toLowerCase()
  setVal.call(input, word)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(300)
  const hits = $$('.tr-ac')
  add(`search "${word}" narrows to matches that include ${A.name}`, hits.length >= 1 && hits.length < cat.length && hits.some(c => c.textContent.includes(A.name)), `${hits.length} hits`)
  setVal.call(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  const secret = $$('.tr-ac').find(c => /Secret trophy/.test(c.textContent))
  const secId = Object.keys(t.state().progress).find(id => t.state().progress[id].state === 'secret')
  add('secret entry shows a silhouette, not its name', !!secret && /Hidden/i.test(secret.textContent) && !secret.textContent.includes(cat.find(c => c.id === secId)?.category || '\u0000'))
  const galleryCards = $$('.tr-ac')
  const galleryAnimations = document.querySelector('.tr-page').getAnimations({ subtree: true })
    .filter(a => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity && a.effect?.target?.closest?.('.tr-head, .tr-grid'))
  const pausedIndex = galleryAnimations.findIndex(a => a.animationName === 'tr-orbit')
  const alreadyPaused = galleryAnimations.splice(pausedIndex >= 0 ? pausedIndex : 0, 1)[0]
  alreadyPaused?.pause()
  secret?.click()
  await sleep(300)
  const sd = document.querySelector('[role=dialog]')
  add('secret detail keeps it hidden', !!sd && /Secret trophy/.test(sd.textContent) && !/≥|>=/.test(sd.textContent))
  add('detail pauses background decoration', galleryAnimations.length > 0 && galleryAnimations.every(a => a.playState === 'paused'))
  add('detail retains gallery card nodes', galleryCards.every((card, i) => card === $$('.tr-ac')[i]))
  add('detail parks gallery canvases', !document.querySelector('.tr-grid .tr-fx-cv'))
  document.querySelector('.hb-dialog-x')?.click()
  await sleep(40)
  add('detail plays a dither close before unmounting', !!document.querySelector('.tr-dialog.tr-exiting'))
  for (let i = 0; i < 20 && document.querySelector('.tr-dialog'); i++) await sleep(50)
  const liveAnimations = document.querySelector('.tr-page').getAnimations({ subtree: true })
  const survivingAnimations = galleryAnimations.filter(a => liveAnimations.includes(a))
  add('closing detail resumes background decoration', survivingAnimations.length > 0 && survivingAnimations.every(a => a.playState === 'running'), JSON.stringify({ dialog: !!document.querySelector('.tr-dialog'), surviving: survivingAnimations.map(a => ({ name: a.animationName, state: a.playState })), captured: galleryAnimations.length }))
  add('closing detail leaves previously paused decoration alone', !alreadyPaused || alreadyPaused.playState === 'paused')
  alreadyPaused?.play()
  $$('.tr-ac').find(c => c.textContent.includes(A.name)).click()
  await sleep(300)
  const dlg = document.querySelector('[role=dialog]')
  add('detail dialog shows the five-tier ladder', !!dlg && dlg.querySelectorAll('.tr-ladder div').length === 5)
  for (let i = 0; i < 200 && !dlg?.querySelector('.tr-tc-front img')?.naturalWidth; i++) await sleep(100)
  const cardImg = dlg?.querySelector('.tr-tc-front img')
  add('detail shows its tier emblem and the whole trophy card', !!dlg?.querySelector('.tr-dlg-tier svg path') && !!dlg?.querySelector('.tr-dlg-plinth') && cardImg?.naturalWidth === 744 && cardImg?.naturalHeight === 1040 && getComputedStyle(cardImg).objectFit === 'contain')
  const tc = dlg?.querySelector('.tr-tc')
  for (let i = 0; i < 40 && tc?.hasAttribute('data-flipped'); i++) await sleep(50)
  dlg?.querySelector('.tr-flip-btn[aria-pressed]')?.click()
  await sleep(60)
  const turned = tc?.hasAttribute('data-flipped') && dlg.querySelector('.tr-flip-btn[aria-pressed]').getAttribute('aria-pressed') === 'true'
  dlg?.querySelector('.tr-flip-btn[aria-pressed]')?.click()
  await sleep(60)
  add('the card turns over and back', !!turned && !tc.hasAttribute('data-flipped'))
  add('detail distinguishes the earned milestone from current progress', dlg?.querySelector('.tr-dlg-milestone strong')?.textContent === A.thresholds[pr(A.id).tier].toLocaleString() && dlg?.querySelector('.tr-dlg-milestone-context')?.textContent.includes(pr(A.id).value.toLocaleString()))
  add('detail highlights the current tier with an explicit status', dlg?.querySelector('.tr-rank-current')?.dataset.tier === String(pr(A.id).tier) && dlg?.querySelector('.tr-rank-current')?.getAttribute('aria-current') === 'step')
  const followingGoal = A.thresholds[pr(A.id).tier + 1]
  add('detail shows the remaining amount or completed milestone status', followingGoal ? dlg?.querySelector('.tr-dlg-next strong')?.textContent === `${Math.max(0, followingGoal - pr(A.id).value).toLocaleString()} to go` : !!dlg?.querySelector('.tr-dlg-complete'))
  byText('[role=dialog] button', 'Share card')?.click()
  for (let i = 0; i < 200 && !document.querySelector('.tr-share-image')?.naturalWidth; i++) await sleep(100)
  const shareImage = document.querySelector('.tr-share-image')
  const previewURL = shareImage?.src
  add('share opens the actual complete PNG preview', shareImage?.naturalWidth === 1600 && shareImage?.naturalHeight === 900 && shareImage.alt.includes(A.name))
  add('share exposes an explicit PNG save action', byText('.tr-share-actions button', 'Save PNG')?.disabled === false)
  if (navigator.clipboard?.write && byText('.tr-share-actions button', 'Copy image')) {
    const write = navigator.clipboard.write
    try {
      navigator.clipboard.write = async () => { throw new Error('clipboard denied for test') }
      byText('.tr-share-actions button', 'Copy image').click()
      await sleep(100)
      add('share reports denied image copy without claiming a text fallback', /Save the PNG instead/.test(document.querySelector('.tr-share-status')?.textContent))
    } finally { navigator.clipboard.write = write }
  }
  byText('[role=dialog] button', 'Back to trophy')?.click()
  await sleep(250)
  add('share returns to the same trophy', !!document.querySelector('.tr-dlg') && document.querySelector('.tr-dlg h4')?.textContent === A.name)
  const revoked = previewURL && await fetch(previewURL).then(() => false, () => true)
  add('share releases the preview blob when leaving', !!revoked)
  const restN = t.restLog.length
  byText('[role=dialog] button', 'Replay unlock')?.click()
  await sleep(900)
  add('replay runs the local pop-up (no backend call)', !!popup() && !t.restLog.slice(restN).some(r => /unlock|signal/.test(r.path) && r.method === 'POST'))
  document.querySelector('.hb-dialog-x')?.click()
  await clearPopup(t)

  // ---- multi_condition (percent progress, requirements list, no ladder) ---------------------------------------------
  const multi = cat.filter(c => !c.thresholds.length)
  const mDone = multi.find(c => pr(c.id).tier >= 0)
  const mOpen = multi.find(c => pr(c.id).tier < 0 && pr(c.id).state !== 'secret')
  t.navigate('/trophy-room')
  await sleep(700)
  if (mDone) {
    const card = $$('.tr-ac').find(c => c.dataset.trophy === mDone.id)
    add('multi_condition unlocked card shows DONE and a full bar', /DONE/.test(card?.textContent) && card.querySelector('.tr-bar i').style.width === '100%', card?.textContent)
    card?.click()
    await sleep(300)
    const md = document.querySelector('[role=dialog]')
    add('multi_condition detail lists requirements, no five-tier ladder', !!md && md.querySelectorAll('.tr-req li').length === mDone.requirements.length && md.querySelectorAll('.tr-ladder div').length === 0, md?.textContent.slice(0, 120))
    add('multi_condition requirement labels shown', mDone.requirements.every(r => md.textContent.includes(r.label)))
    add('completed requirements show a completed achievement, not a missing next tier', md.querySelector('.tr-dlg-milestone strong')?.textContent === '100%' && !md.querySelector('.tr-dlg-next,.tr-dlg-complete'))
    document.querySelector('.hb-dialog-x')?.click()
    await sleep(300)
  } else add('multi_condition unlocked entry present', false, 'none in catalog')
  if (mOpen) {
    const card = $$('.tr-ac').find(c => c.dataset.trophy === mOpen.id)
    add('multi_condition locked card shows percent', /\d+%/.test(card?.textContent) && /100%/.test(card?.textContent), card?.textContent)
  }

  // ---- data page: replay summary, import ------------------------------------------------------------------------
  t.navigate('/settings')
  await sleep(200)
  t.settingsPage('settings', 'data')
  await sleep(400)
  byText('.tr-row button', 'Replay')?.click()
  await sleep(1000)
  const collection = document.querySelector('.tr-away-dialog,.tr-away-inline')
  add('replay opens the retained away-unlock collection', !!collection && collection.querySelectorAll('[data-away-id]').length > 0, collection?.querySelector('h4')?.textContent)
  collection?.querySelector('.tr-away-close')?.click()
  await sleep(300)
  t.navigate('/settings')
  await sleep(200)
  t.settingsPage('settings', 'data')
  await sleep(400)
  const imp = byText('.tr-row button', 'Import')
  const legacy = (await t.ctx.rest('/state')).meta?.legacy_import
  if (imp?.disabled) add('import button is disabled when no dashboard data exists', legacy && legacy.available === false)
  else {
    imp?.click()
    await sleep(700)
    const note = document.querySelector('.tr-note')?.textContent || ''
    const posted = t.restLog.some(r => r.path === '/import-legacy' && r.method === 'POST')
    add('import-legacy: posts and reports a result (imported, or a clean failure message)', posted && /Imported \d+ trophies|Import failed/.test(note), note)
  }

  // ---- unlocks written by another process (cron, hermes chat): no broadcast, found by the state refetch ---------
  const [F, G, H, I, K] = tiered.slice(5, 10)
  await setting(t, 'Top centre')
  t.navigate('/')
  await sleep(300)
  await t.outsideUnlock(F.id, 1)
  await t.refetchState()
  await sleep(1100)
  add('other-process unlock pops up after a state refetch', !!popup() && popup().querySelector('.nm')?.textContent === F.name, popup()?.textContent)
  add('other-process unlock is marked seen once, after its card mounted', t.restLog.filter(r => r.path === '/seen' && r.body?.ids?.includes(F.id)).length === 1)
  await clearPopup(t)
  await t.refetchState()
  await sleep(900)
  add('refetching again does not show it twice', !popup())
  await t.outsideUnlock(G.id, 1)
  await t.outsideUnlock(H.id, 1)
  await t.outsideUnlock(I.id, 1)
  await t.refetchState()
  await sleep(1100)
  add('three other-process unlocks collapse into the away summary', !!popup() && /away/i.test(popup().textContent) && /3 trophies unlocked/.test(popup().textContent), popup()?.textContent)
  await clearPopup(t)

  // ---- profile signal: only on a real change -----------------------------------------------------------------------
  const profSigs = () => t.restLog.filter(r => r.path === '/signal' && r.body?.key === 'profile_seen')
  const curProfile = t.host.state.profile.get()
  add('profile: a relaunch with the same profile is not a switch', profSigs().length === (t.hadLastProfile === curProfile ? 0 : 1), `sent ${profSigs().length}, remembered ${t.hadLastProfile}`)
  const p0 = profSigs().length
  t.host.state.profile.set('work')
  await sleep(200)
  add('profile: a change sends profile_seen once', profSigs().length === p0 + 1 && profSigs()[p0].body.value === 'work')
  t.host.state.profile.set('work')
  await sleep(150)
  add('profile: the same value again sends nothing', profSigs().length === p0 + 1)
  t.host.state.profile.set(curProfile)
  await sleep(200)
  add('profile: switching back sends again', profSigs().length === p0 + 2)

  // ---- plugin count from host.pluginDecisions -------------------------------------------------------------------------
  const pcs = () => t.restLog.filter(r => r.path === '/signal' && r.body?.key === 'plugin_count')
  t.host.pluginDecisions.set({ a: true, b: true, c: false })
  await sleep(200)
  add('plugin_count: sends the number of enabled plugins', pcs().at(-1)?.body.value === 2, JSON.stringify(pcs().at(-1)?.body))
  const pc0 = pcs().length
  t.host.pluginDecisions.set({ a: true, b: true, c: false, d: false })
  await sleep(150)
  add('plugin_count: an unchanged count is not resent', pcs().length === pc0)

  // ---- pop-up hosts: none mounted, one missing, a double mount ---------------------------------------------------------
  t.navigate('/')
  await sleep(300)
  const seenFor = id => t.restLog.filter(r => r.path === '/seen' && r.body?.ids?.includes(id)).length
  const seenF0 = seenFor(F.id)
  let back = t.dropAnchors(['titleBar.center', 'statusBar.right', 'statusBar.left'])
  await sleep(250)
  t.fireTier(2, F.id)
  await sleep(1000)
  add('no host mounted: a toast with the trophy name and tier, no card', !popup() && t.toasts().some(x => x.title === F.name && /Gold/.test(x.message)), JSON.stringify(t.toasts().map(x => x.title)))
  add('no host mounted: marked seen after the toast', seenFor(F.id) === seenF0 + 1)
  back()
  await sleep(300)
  back = t.dropAnchors(['titleBar.center'])
  await sleep(250)
  t.fireTier(2, G.id)
  await sleep(1000)
  add('title host missing: the card moves to a status host', !!popup(), popup()?.textContent)
  await clearPopup(t)
  back()
  await sleep(300)
  let undup = t.dupAnchor('titleBar.center')
  await sleep(250)
  t.fireTier(2, H.id)
  await sleep(1000)
  add('double title host: exactly one card', $$('.tr-pop .tr-card').length === 1, `${$$('.tr-pop .tr-card').length}`)
  await clearPopup(t)
  undup()
  await setting(t, 'Bottom right')
  undup = t.dupAnchor('statusBar.right')
  t.navigate('/')
  await sleep(300)
  t.fireTier(2, I.id)
  await sleep(1000)
  add('double status host: exactly one card', $$('.tr-pop .tr-card').length === 1, `${$$('.tr-pop .tr-card').length}`)
  await clearPopup(t)
  undup()
  await setting(t, 'Top centre')

  // ---- badge promise rejections must not escape ---------------------------------------------------------------------------
  const rejections = []
  const onRej = e => {
    rejections.push(String(e.reason))
    e.preventDefault()
  }
  window.addEventListener('unhandledrejection', onRej)
  const saved = { set: Object.getOwnPropertyDescriptor(navigator, 'setAppBadge'), clear: Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge') }
  Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: () => Promise.reject(new Error('no taskbar')) })
  Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: () => Promise.reject(new Error('no taskbar')) })
  t.navigate('/')
  await sleep(250)
  t.fireTier(2, K.id)
  await sleep(1100)
  await clearPopup(t)
  t.navigate('/trophy-room')
  await sleep(1200)
  t.navigate('/')
  await sleep(300)
  add('badge: rejected setAppBadge and clearAppBadge promises are caught', rejections.length === 0, rejections.join(' | '))
  for (const [k, d] of [['setAppBadge', saved.set], ['clearAppBadge', saved.clear]]) {
    if (d) Object.defineProperty(navigator, k, d)
    else delete navigator[k]
  }
  window.removeEventListener('unhandledrejection', onRej)

  // ---- art requests: only ids the backend lists --------------------------------------------------------------------------------
  const artReqs = t.restLog.filter(r => r.method === 'GET' && r.path.startsWith('/art/')).map(r => decodeURIComponent(r.path.slice(5)))
  add('art requests are limited to ids in the art index', artReqs.every(id => artIds.includes(id)), `${artReqs.length} requests, ${artIds.length} indexed`)

  // ---- signals -----------------------------------------------------------------------------------------------------
  const sig = t.restLog.filter(r => r.path === '/signal').map(r => r.body.key)
  add('signals: trophy_room_open + page_visit + profile_seen', ['trophy_room_open', 'page_visit', 'profile_seen'].every(k => sig.includes(k)), [...new Set(sig)].join(','))
  const pages = new Set(t.restLog.filter(r => r.path === '/signal' && r.body?.key === 'page_visit').map(r => r.body.value))
  const wantPages = ['gallery', 'gallery-detail', 'settings', 'settings-notifications', 'settings-sound', 'settings-data']
  add('page_visit: a distinct value for the gallery, the detail and each settings page', wantPages.every(x => pages.has(x)), [...pages].join(','))

  // ---- optimistic totals ---------------------------------------------------------------------------------------------
  t.navigate('/')
  await sleep(300)
  const u0 = t.state().totals.unlocked
  const fresh = t.state().catalog.find(c => pr(c.id).tier < 0 && pr(c.id).state !== 'secret' && c.thresholds.length === 5)
  t.fire(t.payloadFor(0, fresh.id))
  await sleep(1400)
  const chip = document.querySelector('.tr-chip')?.textContent || ''
  add('totals update on unlock (optimistic, then confirmed by the backend)', t.state().totals.unlocked === u0 + 1 && chip.includes(`${u0 + 1}/`), `${u0} -> ${t.state().totals.unlocked}, chip "${chip}"`)
  await clearPopup(t)

  // ---- reset: a failing backend is caught; a good reset clears held pop-ups -----------------------------------------------
  const openReset = async () => {
    t.navigate('/settings')
    await sleep(250)
    t.settingsPage('settings', 'data')
    await sleep(450)
    byText('.tr-row button', 'Reset')?.click()
    await sleep(300)
  }
  t.failPaths.add('/reset')
  await openReset()
  byText('[role=dialog] button', 'Reset')?.click()
  await sleep(600)
  add('reset: a failing backend shows a message and nothing throws', /Reset failed/.test(document.body.textContent) && errors.length === 0, document.querySelector('.tr-note')?.textContent)
  t.failPaths.delete('/reset')
  t.navigate('/')
  await sleep(300)
  t.setBusy(true)
  t.fireTier(2, tiered[10]?.id || A.id)
  await sleep(900)
  add('reset: a trophy is being held while the turn is busy', !popup())
  await openReset()
  byText('[role=dialog] button', 'Reset')?.click()
  await sleep(900)
  t.setBusy(false)
  t.navigate('/')
  await sleep(900)
  add('reset: held pop-ups are cleared', !popup())
  if (mode === 'real') await fetch('http://127.0.0.1:8770/dev/state-reset', { method: 'POST' })

  t.failPaths.delete('/signal')
  window.removeEventListener('error', onErr)
  add('no uncaught errors during the run', errors.length === 0, errors.join(' | '))
  add(`backend: ${mode}`, true)
  return out
}

// Run with ?api=fixture&bare=1&nopopover=1&nodialog=1: the SDK is missing Popover and Dialog.
async function runFallbacks(t) {
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail: String(detail) })
  const errors = []
  const onErr = e => errors.push(e.message || String(e))
  window.addEventListener('error', onErr)
  add('plugin loads without Popover and Dialog', t.loaded, t.error || '')
  t.navigate('/')
  await sleep(3500)
  await clearPopup(t)
  add('the status chip still renders', !!document.querySelector('.tr-chip'))
  const st = t.state()
  const A = st.catalog.find(c => st.progress[c.id].tier >= 0 && c.thresholds.length === 5)
  t.fireTier(2, A.id)
  await sleep(1000)
  add('no Popover: no card, a toast names the trophy', !popup() && t.toasts().some(x => x.title === A.name), JSON.stringify(t.toasts().map(x => x.title)))
  add('no Popover: the trophy is marked seen', t.restLog.some(r => r.path === '/seen' && r.body?.ids?.includes(A.id)))
  t.navigate('/trophy-room')
  await sleep(900)
  add('gallery renders', $$('.tr-ac').length === st.catalog.length)
  $$('.tr-ac').find(c => c.textContent.includes(A.name)).click()
  await sleep(400)
  const inline = document.querySelector('.tr-inline[role=dialog]')
  add('no Dialog: the detail shows inline', !!inline && inline.textContent.includes(A.name))
  byText('.tr-inline button', 'Close')?.click()
  await sleep(200)
  add('no Dialog: the inline detail closes', !document.querySelector('.tr-inline'))
  t.navigate('/settings')
  await sleep(250)
  t.settingsPage('settings', 'data')
  await sleep(450)
  byText('.tr-row button', 'Reset')?.click()
  await sleep(300)
  add('no ConfirmDialog: an inline confirmation appears', !!document.querySelector('[role=alertdialog]'))
  byText('[role=alertdialog] button', 'Reset')?.click()
  await sleep(700)
  add('no ConfirmDialog: reset completes', /cleared/.test(document.body.textContent), document.querySelector('.tr-note')?.textContent)
  window.removeEventListener('error', onErr)
  add('no uncaught errors', errors.length === 0, errors.join(' | '))
  add(`backend: ${t.mode}`, true)
  return out
}

// Run with ?api=fixture&bare=1&artall=1&route=/trophy-room: every trophy has real art, so loading must stay lazy.
async function runLazyArt(t) {
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail: String(detail) })
  await sleep(2500)
  const total = t.state().catalog.length
  const artGets = () => t.restLog.filter(r => r.method === 'GET' && r.path.startsWith('/art/')).length
  const n1 = artGets()
  add('art: only cards near the screen request their picture', n1 > 0 && n1 < total / 2 && n1 <= 48, `${n1} of ${total}`)
  const page = document.querySelector('.tr-page')
  page.scrollTop = page.scrollHeight
  await sleep(1500)
  const n2 = artGets()
  add('art: scrolling requests the rest, once each', n2 > n1 && n2 <= total && new Set(t.restLog.filter(r => r.path.startsWith('/art/')).map(r => r.path)).size === n2, `${n1} then ${n2}`)
  add(`backend: ${t.mode}`, true)
  return out
}
