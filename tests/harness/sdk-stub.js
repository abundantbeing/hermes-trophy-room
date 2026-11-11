// Stand-in for @hermes/plugin-sdk, used only by the test harness. It reproduces the contract the real
// Desktop gives a plugin (registry + slots, atoms, React Query, ctx.*, a Radix-like Popover and Dialog)
// closely enough to run desktop/plugin.js unchanged. It is NOT the real app: see README in this folder.
import * as React from 'react'
import { createPortal } from 'react-dom'

const h = React.createElement
// ?nopopover=1 and ?nodialog=1 hide those SDK exports, to test plugin fallbacks for a missing SDK piece.
export const flags = new URLSearchParams(location.search)
const { useSyncExternalStore, useEffect, useLayoutEffect, useRef, useState, useContext, createContext, cloneElement } = React

export const cn = (...a) => a.flat(Infinity).filter(Boolean).join(' ')
export const haptic = () => {}

// ---- atoms (nanostores-shaped) --------------------------------------------------------------
export function atom(initial) {
  let v = initial
  const subs = new Set()
  return {
    get: () => v,
    set: n => {
      if (n === v) return
      v = n
      for (const s of [...subs]) s(v)
    },
    subscribe(cb) {
      subs.add(cb)
      cb(v)
      return () => subs.delete(cb)
    },
    listen(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    }
  }
}
export const computed = (src, fn) => ({ get: () => fn(src.get()), subscribe: cb => src.subscribe(x => cb(fn(x))), listen: cb => src.listen(x => cb(fn(x))) })
export function useValue(a) {
  return useSyncExternalStore(
    cb => a.listen(cb),
    () => a.get()
  )
}

// ---- event bus + host -----------------------------------------------------------------------
const bus = new Map()
export function emitEvent(type, payload) {
  const ev = { type, payload, session_id: '' }
  for (const k of [type, '*']) for (const fn of [...(bus.get(k) || [])]) fn(ev)
}
function onEvent(type, fn) {
  if (!bus.has(type)) bus.set(type, new Set())
  bus.get(type).add(fn)
  return () => bus.get(type)?.delete(fn)
}

export const $toasts = atom([])
let toastN = 0
export const $route = atom(location.hash.replace(/^#/, '') || '/')
window.addEventListener('hashchange', () => $route.set(location.hash.replace(/^#/, '') || '/'))

export const host = {
  state: {
    busy: atom(false),
    profile: atom('default'),
    gateway: atom('open'),
    activeSessionId: atom('s1'),
    focusedSessionId: atom('s1'),
    model: atom('claude-sonnet-5-5')
  },
  pluginDecisions: atom({}),
  notify(n) {
    const id = `t${++toastN}`
    $toasts.set([...$toasts.get(), { id, ...n }])
    setTimeout(() => $toasts.set($toasts.get().filter(x => x.id !== id)), 4000)
    return id
  },
  notifyError(e, fb) {
    return host.notify({ kind: 'error', message: String(e?.message || fb || e) })
  },
  navigate(path) {
    location.hash = path
    $route.set(path)
  },
  onEvent,
  request: async () => ({})
}

// ---- registry ---------------------------------------------------------------------------------
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'
export const SETTINGS_PLUGINS_AREA = 'settings.plugins'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
export const TITLEBAR_AREAS = { center: 'titleBar.center', left: 'titleBar.left', right: 'titleBar.right' }

export const registry = { items: [], version: atom(0), settings: [] }
const bump = () => registry.version.set(registry.version.get() + 1)
export const area = name => registry.items.filter(i => i.area === name).sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

export function Slot({ area: name }) {
  useValue(registry.version)
  return h(React.Fragment, null, area(name).map(c => (c.render ? h(React.Fragment, { key: c.id }, c.render()) : null)))
}

// ---- React Query (minimal but real) ----------------------------------------------------------
const hk = k => JSON.stringify(k)
const cache = new Map()
function entry(key) {
  const k = hk(key)
  let e = cache.get(k)
  if (!e) {
    e = { key, data: undefined, error: null, status: 'pending', at: 0, p: null, subs: new Set(), observers: 0, snap: null, invalid: false }
    e.snap = snap(e, false)
    cache.set(k, e)
  }
  return e
}
function snap(e, fetching) {
  return { data: e.data, error: e.error, status: e.status, isLoading: e.status === 'pending' && fetching, isError: e.status === 'error', isFetching: fetching, refetch: () => runFetch(e, e.fn) }
}
function emit(e, fetching) {
  e.snap = snap(e, fetching)
  for (const s of [...e.subs]) s()
}
function runFetch(e, fn) {
  if (!fn) return Promise.resolve(e.data)
  e.fn = fn
  if (e.p) return e.p
  emit(e, true)
  e.p = Promise.resolve()
    .then(fn)
    .then(
      d => {
        e.data = d
        e.error = null
        e.status = 'success'
        e.at = Date.now()
        e.invalid = false
      },
      err => {
        e.error = err
        if (e.data === undefined) e.status = 'error'
      }
    )
    .then(() => {
      e.p = null
      emit(e, false)
      return e.data
    })
  return e.p
}
export const queryClient = {
  getQueryData: key => cache.get(hk(key))?.data,
  setQueryData(key, upd) {
    const e = entry(key)
    e.data = typeof upd === 'function' ? upd(e.data) : upd
    e.status = 'success'
    e.at = Date.now()
    emit(e, false)
    return e.data
  },
  invalidateQueries({ queryKey } = {}) {
    const pre = queryKey ? hk(queryKey).slice(0, -1) : ''
    const jobs = []
    for (const [k, e] of cache) {
      if (!k.startsWith(pre)) continue
      e.invalid = true
      if (e.observers > 0) jobs.push(runFetch(e, e.fn))
    }
    return Promise.all(jobs)
  },
  async fetchQuery({ queryKey, queryFn, staleTime = 0 }) {
    const e = entry(queryKey)
    if (e.status === 'success' && !e.invalid && Date.now() - e.at < staleTime) return e.data
    await runFetch(e, queryFn)
    if (e.status === 'error') throw e.error
    return e.data
  }
}
export const useQueryClient = () => queryClient
export function useQuery(o) {
  const e = entry(o.queryKey)
  e.fn = o.queryFn
  const s = useSyncExternalStore(
    cb => {
      e.subs.add(cb)
      return () => e.subs.delete(cb)
    },
    () => e.snap
  )
  useEffect(() => {
    e.observers++
    return () => void e.observers--
  }, [e])
  const enabled = o.enabled !== false
  useEffect(() => {
    if (!enabled) return undefined
    const fresh = e.status === 'success' && !e.invalid && (o.staleTime === Infinity || Date.now() - e.at < (o.staleTime || 0))
    if (!fresh) void runFetch(e, o.queryFn)
    let id
    if (o.refetchInterval) id = setInterval(() => void runFetch(e, o.queryFn), o.refetchInterval)
    return () => id && clearInterval(id)
  }, [enabled, hk(o.queryKey)])
  return { ...s, isLoading: enabled && s.status === 'pending' }
}
export const useMutation = () => ({ mutate() {} })

// ---- storage / ctx ------------------------------------------------------------------------------
export const osLog = []
export const $os = atom([])
export const restLog = []
export const api = { base: null, fixture: null, fail: new Set() } // fail: rest paths that reject

export function makeCtx(id) {
  const disposers = []
  const reg = c => {
    const item = { ...c, id: `${id}:${c.id}`, source: `plugin:${id}` }
    registry.items.push(item)
    bump()
    return () => {
      registry.items = registry.items.filter(x => x !== item)
      bump()
    }
  }
  const ctx = {
    source: `plugin:${id}`,
    register: c => {
      const d = reg(c)
      disposers.push(d)
      return d
    },
    registerMany: cs => cs.map(c => ctx.register(c)),
    registerSettingsPage(page) {
      registry.settings.push({ ...page, plugin: id })
      bump()
      const d = () => {
        registry.settings = registry.settings.filter(p => p.id !== page.id)
        bump()
      }
      disposers.push(d)
      return d
    },
    async rest(path, opts = {}) {
      const method = opts.method || 'GET'
      restLog.push({ method, path, body: opts.body })
      if (api.fail.has(path)) throw new Error(`forced failure ${path}`)
      if (api.fixture) return api.fixture(method, path, opts.body)
      const r = await fetch(api.base + path, { method, headers: { 'content-type': 'application/json' }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
      if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
      return r.json()
    },
    socket: () => () => {},
    onEvent(type, fn) {
      const d = onEvent(type, fn)
      disposers.push(d)
      return d
    },
    onDispose: fn => void disposers.push(fn),
    setTimeout(fn, ms) {
      const t = setTimeout(fn, ms)
      const d = () => clearTimeout(t)
      disposers.push(d)
      return d
    },
    setInterval(fn, ms) {
      const t = setInterval(fn, ms)
      const d = () => clearInterval(t)
      disposers.push(d)
      return d
    },
    addEventListener(target, type, fn, o) {
      target.addEventListener(type, fn, o)
      const d = () => target.removeEventListener(type, fn, o)
      disposers.push(d)
      return d
    },
    os: {
      notify(n) {
        const item = { id: Date.now() + Math.random(), ...n }
        osLog.push(item)
        $os.set([...$os.get(), item])
        setTimeout(() => $os.set($os.get().filter(x => x !== item)), 9000)
      },
      openExternal: async () => true,
      revealPath: async () => true,
      writeClipboard: async text => {
        ctx.__clipboard = text
        return true
      }
    },
    pet: { say: () => () => {}, clear() {}, visible: atom(false) },
    runAction: async () => ({ ok: true }),
    storage: {
      get(k, d) {
        try {
          const v = localStorage.getItem(`hermes.plugin.${id}.${k}`)
          return v === null ? d : JSON.parse(v)
        } catch {
          return d
        }
      },
      set(k, v) {
        localStorage.setItem(`hermes.plugin.${id}.${k}`, JSON.stringify(v))
      },
      remove(k) {
        localStorage.removeItem(`hermes.plugin.${id}.${k}`)
      }
    },
    i18n: { register() {}, t: k => k },
    dispose() {
      for (const d of disposers.splice(0)) d()
    }
  }
  return ctx
}

export const usePluginI18n = () => k => k

// ---- UI kit stand-ins ----------------------------------------------------------------------------
export const Tip = ({ children, label }) => (React.isValidElement(children) ? cloneElement(children, { title: label }) : children)
export const Codicon = ({ name, className, ...p }) => h('i', { className: cn('codicon', `codicon-${name}`, className), 'aria-hidden': true, ...p })
export const Badge = ({ children }) => h('span', { className: 'hb-badge' }, children)
export const Button = ({ variant = 'default', size, className, children, ...p }) => h('button', { type: 'button', className: cn('hb-btn', `hb-btn-${variant}`, size && `hb-btn-${size}`, className), ...p }, children)
export const Switch = ({ checked, onCheckedChange, ...p }) => h('button', { type: 'button', role: 'switch', 'aria-checked': !!checked, 'data-state': checked ? 'checked' : 'unchecked', className: 'hb-switch', onClick: () => onCheckedChange?.(!checked), ...p }, h('span'))
export const SegmentedControl = ({ options, value, onChange, sizing }) =>
  h('div', { className: 'hb-seg' }, options.map(o => h('button', { key: o.id, type: 'button', 'aria-pressed': value === o.id, onClick: () => onChange(o.id) }, o.label)))
export const SearchField = ({ value, onChange, placeholder }) => h('label', { className: 'hb-search' }, h('i', { className: 'codicon codicon-search' }), h('input', { value, placeholder, 'aria-label': placeholder, onChange: e => onChange(e.target.value) }))
export const ScrollArea = ({ children, className }) => h('div', { className: cn('hb-scroll', className) }, children)
export const EmptyState = ({ title, children }) => h('div', null, title, children)
export const Select = ({ children }) => children
export const SelectContent = Select
export const SelectItem = Select
export const SelectTrigger = Select
export const SelectValue = Select
export const icons = {}

// Popover: controlled, portal content positioned against the trigger the way Radix does (side/align/offsets).
const PopCtx = createContext(null)
function PopoverImpl({ open, onOpenChange, children }) {
  const triggerRef = useRef(null)
  return h(PopCtx.Provider, { value: { open: !!open, onOpenChange, triggerRef } }, children)
}
function PopoverTriggerImpl({ asChild, children, ...p }) {
  const c = useContext(PopCtx)
  const child = asChild && React.isValidElement(children) ? children : h('button', { type: 'button', ...p }, children)
  return cloneElement(child, {
    ref: node => {
      c.triggerRef.current = node
      const r = child.ref
      if (typeof r === 'function') r(node)
      else if (r) r.current = node
    },
    onClick: e => {
      child.props.onClick?.(e)
      c.onOpenChange?.(!c.open)
    },
    'data-state': c.open ? 'open' : 'closed'
  })
}
function PopoverContentImpl({ side = 'bottom', align = 'center', alignOffset = 0, sideOffset = 6, collisionPadding = 8, className, style, children, ...rest }) {
  const c = useContext(PopCtx)
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  useLayoutEffect(() => {
    if (!c.open || !ref.current || !c.triggerRef.current) return
    const t = c.triggerRef.current.getBoundingClientRect()
    // Layout size, like Radix: a transform animation on the content must not change where it is placed.
    const r = { width: ref.current.offsetWidth, height: ref.current.offsetHeight }
    let left
    let top
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? t.bottom + sideOffset : t.top - r.height - sideOffset
      left = align === 'start' ? t.left + alignOffset : align === 'end' ? t.right - r.width - alignOffset : t.left + t.width / 2 - r.width / 2 + alignOffset
    } else {
      left = side === 'right' ? t.right + sideOffset : t.left - r.width - sideOffset
      top = t.top + alignOffset
    }
    left = Math.max(collisionPadding, Math.min(window.innerWidth - r.width - collisionPadding, left))
    top = Math.max(collisionPadding, Math.min(window.innerHeight - r.height - collisionPadding, top))
    setPos(p => (Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 ? p : { left, top }))
  })
  if (!c.open) return null
  const node = h(
    'div',
    { ref, 'data-slot': 'popover-content', 'data-side': side, 'data-align': align, className: cn('hb-popover', className), style: { position: 'fixed', zIndex: 80, left: pos.left, top: pos.top, ...style } },
    children,
    h('span', { style: { position: 'absolute', left: 10, top: -4, width: 8, height: 8, background: 'red' }, 'data-arrow': true })
  )
  return createPortal(node, document.body)
}

// Dialog
const DlgCtx = createContext(null)
function DialogImpl({ open, onOpenChange, children }) {
  return h(DlgCtx.Provider, { value: { open, onOpenChange } }, children)
}
function DialogContentImpl({ children, style, className }) {
  const c = useContext(DlgCtx)
  useEffect(() => {
    const k = e => e.key === 'Escape' && c.onOpenChange?.(false)
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [c])
  if (!c.open) return null
  return createPortal(
    h(
      'div',
      { className: 'hb-overlay', onMouseDown: e => e.target === e.currentTarget && c.onOpenChange?.(false) },
      h('div', { role: 'dialog', className: cn('hb-dialog', className), style }, h('button', { type: 'button', className: 'hb-dialog-x', 'aria-label': 'Close', onClick: () => c.onOpenChange?.(false) }, 'x'), children)
    ),
    document.body
  )
}
const DialogHeaderImpl = ({ children, className }) => h('div', { className }, children)
const DialogTitleImpl = ({ children }) => h('h2', { className: 'sr-only' }, children)
const DialogDescriptionImpl = ({ children }) => h('p', { className: 'sr-only' }, children)
function ConfirmDialogImpl({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm' }) {
  return h(DialogImpl, { open, onOpenChange: o => !o && onClose() }, h(DialogContentImpl, { style: { width: 420, padding: 20 } }, h('h3', null, title), h('p', null, description), h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } }, h(Button, { variant: 'outline', onClick: onClose }, 'Cancel'), h(Button, { variant: 'destructive', onClick: async () => { await onConfirm(); onClose() } }, confirmLabel))))
}

// Exported under the real names; a flag hides a family so the plugin's fallbacks can be exercised.
const hide = name => flags.has(name)
export const Popover = hide('nopopover') ? undefined : PopoverImpl
export const PopoverTrigger = hide('nopopover') ? undefined : PopoverTriggerImpl
export const PopoverContent = hide('nopopover') ? undefined : PopoverContentImpl
export const Dialog = hide('nodialog') ? undefined : DialogImpl
export const DialogContent = hide('nodialog') ? undefined : DialogContentImpl
export const DialogHeader = hide('nodialog') ? undefined : DialogHeaderImpl
export const DialogTitle = hide('nodialog') ? undefined : DialogTitleImpl
export const DialogDescription = hide('nodialog') ? undefined : DialogDescriptionImpl
export const ConfirmDialog = hide('nodialog') ? undefined : ConfirmDialogImpl
