// Fake Hermes Desktop shell + boot for desktop/plugin.js. Query params:
//   api=fixture|real   backend (default: real dev server on :8770 if it answers, else the fixture)
//   bare=1             hide the control panel (full-window screenshots)
//   theme=dark|light   unseen=N  fixture unseen queue size   route=/trophy-room
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as sdk from '@hermes/plugin-sdk'
import { makeFixture } from './fixtures.js'

const h = React.createElement
const { Slot, host, useValue, atom, $route, $toasts, $os, registry, area, emitEvent, makeCtx, api, osLog, restLog, queryClient, flags } = sdk
const q = new URLSearchParams(location.search)
const REAL = 'http://127.0.0.1:8770/api/plugins/trophy-room'
const $theme = atom(q.get('theme') || 'dark')
const $set = atom({ id: null, sub: null })
let focused = true
document.hasFocus = () => focused

function Chat() {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
    h(
      'div',
      { className: 'hw-chat' },
      h('div', { className: 'hw-msg me' }, 'Run the whole release checklist and tell me when it is done.'),
      h('div', { className: 'hw-msg' }, 'On it. Running tests, building the installer, then drafting the notes. I will keep going until the checklist is clear.'),
      h('div', { className: 'hw-msg' }, 'pnpm test: 4,812 passed')
    ),
    h('div', { className: 'hw-comp' }, 'Ask Hermes anything...')
  )
}

function Settings() {
  useValue(registry.version)
  const s = useValue($set)
  const pages = registry.settings
  const cur = pages.find(p => p.id === (s.id || pages[0]?.id))
  const sub = s.sub ? cur?.children?.find(c => c.id === s.sub) : null
  return h(
    'div',
    { className: 'hw-set' },
    h(
      'div',
      { className: 'hw-rail' },
      h('div', { className: 'hw-lab' }, 'Settings / Plugins'),
      pages.map(p =>
        h(
          React.Fragment,
          { key: p.id },
          h('button', { className: !s.sub && cur?.id === p.id ? 'on' : '', onClick: () => $set.set({ id: p.id, sub: null }), 'data-set-page': p.id }, p.title),
          (p.children || []).map(c => h('button', { key: c.id, className: cn(['sub', cur?.id === p.id && s.sub === c.id && 'on']), onClick: () => $set.set({ id: p.id, sub: c.id }), 'data-set-sub': c.id }, c.title))
        )
      )
    ),
    h('div', { className: 'hw-setbody' }, (sub || cur)?.render())
  )
}
const cn = a => a.flat().filter(Boolean).join(' ')

function Outlet() {
  const route = useValue($route)
  useValue(registry.version)
  const path = route.split('?')[0]
  if (path === '/settings') return h(Settings)
  const r = area('routes').find(x => x.data?.path === path)
  if (r) return h('div', { style: { flex: 1, minHeight: 0 } }, r.render())
  return h(Chat)
}

function Window() {
  const theme = useValue($theme)
  const route = useValue($route)
  const nav = [['New agent'], ['Skills'], ['Messaging'], ['Artifacts']]
  useValue(registry.version)
  const toasts = useValue($toasts)
  return h(
    'div',
    { className: 'hw', 'data-theme': theme },
    h(
      'div',
      { className: 'hw-tb' },
      h('div', { className: 'hw-dots' }, h('i'), h('i'), h('i')),
      h('div', { className: 'hw-cluster', 'data-titlebar-cluster': 'left' }, h(Slot, { area: 'titleBar.left' }), h(Slot, { area: 'titleBar.center' })),
      h('div', { className: 'hw-title' }, 'Hermes'),
      h('div', { className: 'hw-cluster', style: { marginLeft: 'auto' } }, h('button', { className: 'hw-nav', onClick: () => host.navigate('/settings'), 'data-open-settings': true }, 'Settings'))
    ),
    h(
      'div',
      { className: 'hw-body' },
      h(
        'div',
        { className: 'hw-side' },
        nav.map(([n]) => h('button', { key: n, className: 'hw-nav' }, n)),
        area('sidebarNav').map(i => h('button', { key: i.id, className: cn(['hw-nav', route.split('?')[0] === i.data.path && 'on']), onClick: () => host.navigate(i.data.path), 'data-nav': i.data.path }, h('i', { className: `codicon codicon-${i.data.codicon}` }), i.data.label)),
        h('div', { className: 'hw-lab' }, 'Agents'),
        ['Ship the desktop release notes', 'Debug failing CI on arm64', 'Summarize the 42-page contract'].map(n => h('button', { key: n, className: 'hw-nav' }, n))
      ),
      h('div', { className: 'hw-main' }, h(Outlet))
    ),
    h('div', { className: 'hw-sb' }, h('div', { className: 'hw-cluster' }, h('span', null, 'Gateway ready'), h(Slot, { area: 'statusBar.left' })), h('div', { className: 'hw-cluster' }, h(Slot, { area: 'statusBar.right' }))),
    h('div', { className: 'hw-toasts' }, toasts.map(t => h('div', { key: t.id, className: 'hw-toast', 'data-toast': true }, t.title ? h('b', null, `${t.title}: `) : null, t.message)))
  )
}

function OsLayer() {
  const list = useValue($os)
  return h('div', { className: 'os-layer' }, list.map(n => h('div', { key: n.id, className: 'os-toast', 'data-os-toast': true }, h('div', { className: 'ic' }, n.icon ? h('img', { src: `/art/icons/${String(n.icon).split(/[\\/]/).pop()}`, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' }, onError: e => (e.target.replaceWith(document.createTextNode('icon'))) }) : 'no icon'), h('div', null, h('div', { className: 'app' }, 'Trophy Room'), h('div', { className: 't' }, n.title), h('div', { className: 'b' }, n.body)))))
}

function Panel({ onTheme }) {
  const [tier, setTier] = React.useState(2)
  const [busy, setBusy] = React.useState(false)
  const [foc, setFoc] = React.useState(true)
  return h(
    'div',
    { className: 'cp' },
    h('h5', null, 'Harness controls'),
    h('div', { className: 'r' }, [0, 1, 2, 3, 4].map(t => h('button', { key: t, className: tier === t ? 'on' : '', onClick: () => setTier(t) }, ['Cu', 'Ag', 'Au', 'Di', 'Ol'][t])), h('button', { onClick: () => window.__trophy.fireTier(tier) }, 'Fire unlock')),
    h('div', { className: 'r' }, h('button', { className: busy ? 'on' : '', onClick: () => { setBusy(!busy); window.__trophy.setBusy(!busy) } }, 'Busy'), h('button', { className: foc ? 'on' : '', onClick: () => { setFoc(!foc); window.__trophy.setFocus(!foc) } }, 'Focused'), h('button', { onClick: onTheme }, 'Theme')),
    h('div', { className: 'r' }, h('button', { onClick: () => host.navigate('/') }, 'Chat'), h('button', { onClick: () => host.navigate('/trophy-room') }, 'Trophy room'), h('button', { onClick: () => host.navigate('/settings') }, 'Settings'))
  )
}

function App() {
  return h(React.Fragment, null, h(Window), h(OsLayer), !q.get('bare') && h(Panel, { onTheme: () => $theme.set($theme.get() === 'dark' ? 'light' : 'dark') }))
}

async function boot() {
  let mode = 'fixture'
  if (q.get('api') !== 'fixture') {
    try {
      const c = new AbortController()
      const tm = setTimeout(() => c.abort(), 1500)
      const r = await fetch(`${REAL}/art-index`, { signal: c.signal })
      clearTimeout(tm)
      if (r.ok) mode = 'real'
    } catch {
      /* dev server not running: use the fixture */
    }
  }
  let fixture = null
  if (mode === 'fixture') {
    fixture = makeFixture({ unseen: Number(q.get('unseen') || 0), legacyAvailable: q.get('legacy') !== '0', artAll: q.get('artall') === '1' })
    api.fixture = fixture
  } else api.base = REAL

  // ?nosignals=1 rejects /signal (still logged) so page visits cannot unlock Sightseer mid-capture.
  if (q.get('nosignals')) api.fail.add('/signal')
  const ctx = makeCtx('trophy-room')
  let chain = Promise.resolve()
  if (q.get('profile')) host.state.profile.set(q.get('profile'))
  const hadLastProfile = ctx.storage.get('lastProfile', null)
  const state = () => queryClient.getQueryData(['trophy-room', 'state'])
  const payloadFor = (tier, id) => {
    const cat = state()?.catalog || fixture?.catalog || []
    const c = cat.find(x => x.id === id) || cat.find(x => (state()?.progress?.[x.id]?.tier ?? -1) >= 0) || cat[0]
    const th = c.thresholds || []
    return { id: c.id, tier, tiers_gained: [tier], name: c.name, description: c.description || `${c.how}.`, category: c.category, glyph: c.glyph, how: c.how, value: th[tier] ?? 1, threshold: th[tier] ?? 1, next: th[tier + 1] ?? null, at: Math.floor(Date.now() / 1000), new: false }
  }
  window.__trophy = {
    mode,
    ctx,
    fixture,
    osLog,
    restLog,
    registry,
    queryClient,
    host,
    // Like the real backend: the unlock is stored first, then the event is broadcast.
    // Real mode writes the row through the dev server (/dev/fire) and broadcasts what it returns.
    fire: p => {
      if (mode === 'real') {
        chain = chain.then(async () => {
          let ev = p
          try {
            const r = await fetch(`http://127.0.0.1:8770/dev/fire?id=${encodeURIComponent(p.id)}&tier=${p.tier}`)
            if (r.ok) ev = await r.json()
          } catch {
            /* dev route missing: broadcast the local payload */
          }
          emitEvent('plugin.trophy-room.unlocked', ev)
        })
        return chain
      }
      fixture?.applyUnlock(p)
      emitEvent('plugin.trophy-room.unlocked', p)
      return undefined
    },
    fireTier: (tier, id) => window.__trophy.fire(payloadFor(tier, id)),
    payloadFor,
    setBusy: b => host.state.busy.set(!!b),
    setFocus: b => (focused = !!b),
    setTheme: t => $theme.set(t),
    navigate: p => host.navigate(p),
    settingsPage: (id, sub) => $set.set({ id, sub }),
    state,
    toasts: () => $toasts.get(),
    flags: { nopopover: flags.has('nopopover'), nodialog: flags.has('nodialog'), artall: q.get('artall') === '1' },
    hadLastProfile,
    // An unlock written by another process: the row exists in the backend, but nothing is broadcast.
    outsideUnlock: async (id, tier) => {
      if (mode === 'real') await fetch(`http://127.0.0.1:8770/dev/fire?id=${encodeURIComponent(id)}&tier=${tier}`)
      else fixture.addUnseen(id, tier)
    },
    refetchState: () => queryClient.invalidateQueries({ queryKey: ['trophy-room', 'state'] }),
    // Unmount pop-up hosts by removing their registry items (returns a restore function).
    dropAnchors: areas => {
      const gone = registry.items.filter(i => areas.includes(i.area))
      registry.items = registry.items.filter(i => !gone.includes(i))
      registry.version.set(registry.version.get() + 1)
      return () => {
        registry.items.push(...gone)
        registry.version.set(registry.version.get() + 1)
      }
    },
    // Mount a second copy of a host (a double registration after a hot reload).
    dupAnchor: areaName => {
      const src = registry.items.find(i => i.area === areaName)
      const copy = { ...src, id: `${src.id}-dup` }
      registry.items.push(copy)
      registry.version.set(registry.version.get() + 1)
      return () => {
        registry.items = registry.items.filter(i => i !== copy)
        registry.version.set(registry.version.get() + 1)
      }
    },
    failPaths: api.fail,
    popup: () => document.querySelector('.tr-pop .tr-card'),
    settings: () => ctx.storage.get('settings', {})
  }
  // Count Web Audio activity so checks can prove a sound played (or was muted).
  const spy = { osc: 0, ctxs: 0 }
  const Native = globalThis.AudioContext
  if (Native) {
    globalThis.AudioContext = class extends Native {
      constructor(...a) {
        super(...a)
        spy.ctxs++
      }
      createOscillator() {
        spy.osc++
        return super.createOscillator()
      }
    }
  }
  window.__trophy.audio = spy
  window.__runChecks = async () => (await import('./checks.js')).run(window.__trophy)
  let plugin
  try {
    plugin = (await import(`/desktop/plugin.js?v=${Date.now()}`)).default // cache-busted so edits always load
    plugin.register(ctx)
    window.__trophy.plugin = plugin
    window.__trophy.loaded = true
  } catch (e) {
    window.__trophy.loaded = false
    window.__trophy.error = String(e?.stack || e)
    console.error('plugin failed to load', e)
  }
  if (q.get('route')) host.navigate(q.get('route'))
  createRoot(document.getElementById('root')).render(h(App))
}
boot()
