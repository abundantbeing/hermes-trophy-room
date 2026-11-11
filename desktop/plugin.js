/**
 * Trophy Room: the Desktop half. Plain ESM, loaded uncompiled by Hermes Desktop.
 * Only imports: @hermes/plugin-sdk, react, react/jsx-runtime.
 *
 * Talks to its Python half over /api/plugins/trophy-room (see docs/CONTRACT.md)
 * and listens for plugin.trophy-room.unlocked. Everything visual is drawn here:
 * the pop-ups, the status chip, the trophy room page, the settings pages, the
 * Hermes Synth sound and the placeholder art.
 */

import * as sdk from '@hermes/plugin-sdk'
import { createElement as h, Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'trophy-room'
const EVENT = `plugin.${ID}.unlocked`
const ROUTE = '/trophy-room'

const { host, atom, useValue, useQuery, queryClient } = sdk

// ---------------------------------------------------------------------------
// Optional SDK pieces: every one has a plain fallback so an older Desktop still loads us.
// ---------------------------------------------------------------------------

const Codicon = sdk.Codicon || (({ name, className }) => h('span', { className: `tr-cod ${className || ''}`, 'data-name': name }))
const Button =
  sdk.Button ||
  (({ children, variant, size, ...p }) => h('button', { type: 'button', className: 'tr-btn-fb', ...p }, children))
const Switch =
  sdk.Switch ||
  (({ checked, onCheckedChange, ...p }) =>
    h('input', { type: 'checkbox', checked: !!checked, onChange: e => onCheckedChange?.(e.target.checked), ...p }))
const SegmentedControl =
  sdk.SegmentedControl ||
  (({ options, value, onChange }) =>
    h(
      'div',
      { className: 'tr-seg-fb' },
      options.map(o =>
        h('button', { key: o.id, type: 'button', 'aria-pressed': value === o.id, onClick: () => onChange(o.id) }, o.label)
      )
    ))
const SearchField =
  sdk.SearchField ||
  (({ value, onChange, placeholder }) =>
    h('input', { className: 'tr-search-fb', value, placeholder, onChange: e => onChange(e.target.value) }))
const ConfirmDialog = sdk.ConfirmDialog
const { Popover, PopoverContent, PopoverTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } = sdk
const cn = sdk.cn || ((...a) => a.filter(Boolean).join(' '))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIERS = [
  { name: 'Copper', color: '#B8714A' },
  { name: 'Silver', color: '#C5CADB' },
  { name: 'Gold', color: '#E5C36A' },
  { name: 'Diamond', color: '#8FE3FF' },
  { name: 'Olympian', color: '#E4D6FF' }
]
// Olympian is prismatic, not one metal: this ramp is its border, bar and foil colour.
const IRIS = '#7cf3ff,#b79cff 20%,#ff9edb 38%,#ffe08a 56%,#8cf5d2 74%,#9cb2ff 88%,#7cf3ff'
// One Greek set, drawn on a 24 px grid: amphora, Hermes' wing, laurel wreath, cut gem, temple.
const TIER_EMBLEMS = [
  'M9 3h6 M10 3v2.6C7.4 7 6 9.4 6 12.2c0 3.6 2.5 6.2 4.6 7.8h2.8c2.1-1.6 4.6-4.2 4.6-7.8 0-2.8-1.4-5.2-4-6.6V3 M10 6.2C7.3 5.7 5.5 7 5.6 9.4 M14 6.2c2.7-.5 4.5.8 4.4 3.2 M9.5 21h5 M6.6 11h10.8',
  'M3.5 17.5C4.2 10.5 10 5.6 20.5 5c-1.1 2.3-2.6 3.8-4.6 4.7 1.5.2 2.8.1 3.9-.3-1.5 3.1-3.9 4.9-7 5.5 1.1.4 2.2.5 3.3.3-2.9 3-7.6 4.6-12.6 2.3Z M7 16.5c2.6-3.4 5.8-5.6 9.9-7 M9.6 17.6c2-1.4 4-2.3 6.2-2.7',
  'M12 20.5C7.4 19.6 4.5 15.8 5 10 M12 20.5c4.6-.9 7.5-4.7 7-10.5 M5 10c-1.7-.4-2.4-1.9-2-3.3 1.6.4 2.4 1.7 2 3.3Z M5.4 14c-1.9.1-3-1.1-3.1-2.6 1.7-.1 2.9.9 3.1 2.6Z M7.6 17.6c-1.7.8-3.2 0-3.8-1.4 1.6-.7 3.1-.2 3.8 1.4Z M19 10c1.7-.4 2.4-1.9 2-3.3-1.6.4-2.4 1.7-2 3.3Z M18.6 14c1.9.1 3-1.1 3.1-2.6-1.7-.1-2.9.9-3.1 2.6Z M16.4 17.6c1.7.8 3.2 0 3.8-1.4-1.6-.7-3.1-.2-3.8 1.4Z M12 6.5l1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3Z',
  'M3 8 6 4h12l3 4-9 12Z M3 8h18 M6 4l3 4 3 12 3-12 3-4',
  'M12 2.8 21.2 8H2.8Z M5.6 10.8v7.4 M9.9 10.8v7.4 M14.1 10.8v7.4 M18.4 10.8v7.4 M3.6 10.8h16.8 M3.6 18.2h16.8 M2.6 21h18.8 M12 4.9v1.6'
]
// Bias neutral metal highlights while retaining the blue in the original backgrounds.
const TIER_ART_MATRICES = [
  '1.10 .10 0 0 0  .08 .78 0 0 0  0 -.55 1 0 0  0 0 0 1 0',
  '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
  '1.05 .12 0 0 0  .05 1.02 0 0 0  0 -.60 1 0 0  0 0 0 1 0',
  '0.84 -0.10 0.06 0 0  0.10 1.04 0.06 0 0  0.16 0.14 1.06 0 0  0 0 0 1 0',
  '1.10 .04 .02 0 0  .02 1.08 .04 0 0  .06 .06 1.14 0 0  0 0 0 1 0'
]
// Extract only metallic sculpture highlights (high R+G, moderate B) while clamping deep cobalt backgrounds to alpha 0.
const TIER_FOIL_MATRICES = {
  3: '0 0 0 0 0.70  0 0 0 0 0.96  0 0 0 0 1.00  1.85 1.85 -1.35 0 -0.36',
  4: '0 0 0 0 0.93  0 0 0 0 0.90  0 0 0 0 1.00  1.90 1.90 -1.38 0 -0.34'
}
const POP_MS = [4000, 5000, 6000, 7000, 8000]

const DEFAULTS = {
  style: 'auto',
  place: 'top-center',
  inApp: true,
  onWindow: true,
  os: true,
  sound: true,
  volume: 0.55,
  quiet: true,
  minTier: 0
}

const EN = {
  nav: 'Achievements',
  palette: 'Open Trophy Room',
  keybind: 'Open Trophy Room',
  chipTip: n => `Trophy Room: ${n}`,
  title: 'Trophy Room',
  eyebrow: 'Hermes achievements',
  complete: 'Complete',
  subtitle: 'Achievements earned from real Hermes work',
  unlockedOf: (a, b) => `${a} of ${b} unlocked`,
  rescan: 'Refresh',
  openSettings: 'Trophy Room settings',
  refreshing: 'Refreshing trophies',
  refreshed: 'Gallery refreshed',
  refreshFailed: 'Refresh failed',
  loading: 'Loading trophies',
  errorTitle: 'The trophy room could not load',
  errorBody: 'The achievements backend did not answer. Check that the Trophy Room plugin is enabled, then retry.',
  retry: 'Retry',
  all: 'All',
  categories: 'Trophy categories',
  categoriesPrevious: 'Scroll categories left',
  categoriesNext: 'Scroll categories right',
  fAll: 'All',
  fUnlocked: 'Unlocked',
  fProgress: 'In progress',
  fLocked: 'Locked',
  fNew: 'New',
  search: 'Search trophies',
  none: 'No trophies match.',
  secretName: 'Secret trophy',
  secretHidden: 'Hidden',
  secretBody: 'Hermes has not seen the first sign of this one yet. It appears here as soon as it does.',
  newTag: 'new',
  whatCounts: 'What counts',
  requirements: 'All of these',
  ladder: 'Tiers',
  firstEarned: d => `First earned ${d}`,
  notEarned: 'Not earned yet. Progress counts live.',
  replay: 'Replay unlock',
  share: 'Share card',
  saveCard: 'Save card',
  savingCard: 'Saving card',
  flipCard: 'Flip card',
  fullView: 'Full view',
  ditherOn: 'Dither on',
  ditherOff: 'Dither off',
  showFront: 'Show front',
  notYet: 'Not yet earned',
  cardAlt: (n, tier) => `${n} trophy card, ${tier}`,
  cardBackAlt: 'Back of the trophy card',
  shareKindPost: 'Post image',
  shareKindCard: 'Card only',
  close: 'Close',

  sharePreview: 'Share your achievement',
  sharePreparing: 'Preparing your image',
  shareReady: 'Save the image or copy it into a post. Nothing is posted automatically.',
  shareFailed: 'The image could not be prepared. Try again.',
  savePNG: 'Save PNG',
  copyImage: 'Copy image',
  shareImage: 'Share image',
  backToTrophy: 'Back to trophy',
  downloadRequested: 'PNG download requested',
  imageCopied: 'Image copied to the clipboard',
  imageCopyFailed: 'Image copying is unavailable. Save the PNG instead.',
  imageShared: 'Image handed to the share sheet',
  imageShareFailed: 'Sharing is unavailable. Save the PNG instead.',
  shareCanceled: 'Sharing canceled',
  popKicker: 'Trophy unlocked',
  popAway: 'While you were away',
  popAwayName: n => (n === 1 ? '1 trophy unlocked' : `${n} trophies unlocked`),
  popAwayBest: n => `Best: ${n}`,
  nextTier: n => `next ${n}`,
  topTier: 'top tier',
  osTitle: (n, t) => `${n} (${t})`,
  osAway: n => `${n} trophies unlocked while you were away`,
  setGeneral: 'Trophy Room',
  setGeneralBlurb: 'How trophies appear. Preferences are saved on this device.',
  setLook: 'Look',
  setLookHelp: 'Auto picks a quiet tile for Copper and Silver, a podium for Gold and Diamond, and a full card for Olympian.',
  lookAuto: 'Auto',
  lookPodium: 'Podium',
  lookTile: 'Tile',
  lookCard: 'Card',
  setPlace: 'Place',
  setPlaceHelp: 'Where the pop-up appears inside the window.',
  placeTopCenter: 'Top centre',
  placeTopRight: 'Top right',
  placeTopLeft: 'Top left',
  lookPick: 'Pick a look',
  lookAutoNote: 'Auto: Tile for Copper and Silver, Podium for Gold and Diamond, Card for Olympian.',
  placeBottomRight: 'Bottom right',
  placeBottomLeft: 'Bottom left',
  setMinTier: 'Smallest tier that pops up',
  setMinTierHelp: 'Quieter tiers still land in the trophy room.',
  setTest: 'Try it',
  setTestHelp: 'Plays a sample trophy through your current settings.',
  setNotif: 'Notifications',
  nInApp: 'Pop-up in the app',
  nInAppHelp: 'Podium, tile or card inside the Hermes window.',
  nWindow: 'On the window',
  nWindowHelp: 'A short glow on the status bar and a taskbar count of unseen trophies.',
  nOs: 'Desktop notification when I am away',
  nOsHelp: 'A native notification with the picture. Only fires while Hermes is in the background.',
  nQuiet: 'Hold pop-ups until the turn ends',
  nQuietHelp: 'Never cover the chat while Hermes is working.',
  setSound: 'Sound',
  sSound: 'Play the Hermes Synth sting',
  sSoundHelp: 'Made in code. Louder and longer for higher tiers.',
  sVolume: 'Volume',
  sVolumeHelp: 'Follows the switch above.',
  setData: 'Data',
  dCounts: (u, t, n) => `${u} of ${t} unlocked, ${n} unseen`,
  dImport: 'Import from the dashboard plugin',
  dImportHelp:
    'Reads the unlocks and progress saved by the bundled dashboard Achievements plugin (state.json and scan_snapshot.json in its folder). Nothing else outside this plugin is read, and nothing leaves your machine.',
  dImportBtn: 'Import',
  dImportNone: 'No dashboard data was found on this machine, so there is nothing to import.',
  dImported: (n, a) => `Imported ${n} trophies${a ? `, ${a} already here` : ''}. No pop-ups were fired.`,
  dImportFail: 'Import failed. Check that the dashboard plugin has run at least once.',
  dReplay: 'Replay the away summary',
  dReplayHelp: 'Open the collectible cards from your last away-unlock collection.',
  dReplayBtn: 'Replay',
  awayTitle: 'While you were away',
  awayCount: n => `${n} ${n === 1 ? 'trophy' : 'trophies'} unlocked`,
  awayHelp: 'Flip a card to see its back, or open Full view for a closer look.',
  awayEmpty: 'No saved away collection',
  awayEmptyHelp: 'Your next away collection will stay available here after its notifications are dismissed.',
  recentTitle: 'Recent trophies',
  recentEyebrow: 'Your trophy collection',
  viewRecent: 'View recent trophies',
  awayFailed: 'Could not load your away trophies. Please try again.',
  backToCollection: 'Back to collection',
  dReset: 'Reset Trophy Room data',
  dResetHelp: 'Clears this plugin\'s own progress and unlocks. The dashboard plugin and your sessions are untouched.',
  dResetBtn: 'Reset',
  dResetTitle: 'Reset all trophies?',
  dResetBody: 'Progress and unlocks stored by Trophy Room are deleted. This cannot be undone.',
  dResetConfirm: 'Reset',
  dResetDone: 'Trophy Room data cleared',
  dResetFail: 'Reset failed. The achievements backend did not answer.',
  cancel: 'Cancel',
  tierName: i => TIERS[i]?.name || ''
}
const t = (k, ...a) => {
  const v = EN[k]
  return typeof v === 'function' ? v(...a) : v === undefined ? k : v
}

// ---------------------------------------------------------------------------
// Module state (reset in register(); ES modules cannot be unloaded)
// ---------------------------------------------------------------------------

const KEY_STATE = [ID, 'state']
const KEY_ART_INDEX = [ID, 'art-index']

const $settings = atom({ ...DEFAULTS })
const $current = atom(null) // { key, p, look, place } while a pop-up is on screen
const $flash = atom(0) // timestamp of the last "on the window" flash
const $focus = atom(null) // trophy id the gallery should open
const $anchors = atom({}) // where -> ids of the mounted pop-up hosts ('title', 'status-left', 'status-right')
const $awayView = atom(null)
const $awayHosts = atom([])
const GALLERY_ROOTS = new Set()
const MODAL_ANIMATIONS = new Set()

// delivered: "id:tier:at" of every unlock this window has already surfaced (broadcast, away summary or a refetch).
const R = { ctx: null, n: 0, queue: [], held: [], seen: new Set(), delivered: new Set(), timer: null, watch: null, shown: 0, booted: false, ac: null, awayEpoch: 0, awayRequest: 0, lastAway: null }
let MOUNT_N = 0

const guard = fn => {
  try {
    return fn()
  } catch {
    return undefined
  }
}

function loadSettings(ctx) {
  let saved = {}
  guard(() => {
    saved = ctx.storage.get('settings', {}) || {}
  })
  const next = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULTS[k]) next[k] = saved[k]
  $settings.set(next)
}

function saveSettings(patch) {
  const next = { ...$settings.get(), ...patch }
  $settings.set(next)
  guard(() => R.ctx.storage.set('settings', next))
}

const rest = (path, opts) => R.ctx.rest(path, opts)
const post = (path, body) => rest(path, { method: 'POST', body }).catch(() => undefined)
function usePageVisit(name) {
  useEffect(() => {
    signal('page_visit', name)
  }, [name])
}

const signal = (key, value) =>
  void post('/signal', value === undefined ? { key } : { key, value }).then(r => {
    if (r?.unlocked?.length) void queryClient.invalidateQueries({ queryKey: KEY_STATE })
  })

// ---------------------------------------------------------------------------
// Art: deterministic engraved placeholder, drawn from a glyph key. Real pictures
// come from GET /art/{id}; the placeholder is only the fallback.
// ---------------------------------------------------------------------------

const GLYPHS = {
  flame:
    '<path d="M32 6C37 17 49 23 46 39C44 49 37 56 32 58C26 56 19 50 18 40C18 31 24 30 26 22C28 28 31 27 32 6Z"/><path d="M32 30C35 36 40 38 38 45C37 50 34 52 32 52C29 52 26 49 26 44C26 40 30 38 32 30Z"/>',
  wing:
    '<path d="M8 42C14 22 36 10 58 12C50 18 46 21 40 23C47 23 52 22 57 22C48 31 39 35 30 35C35 37 40 37 45 36C36 46 22 49 8 42Z"/><path d="M14 38C26 30 38 26 50 24"/><path d="M20 42C30 37 40 33 50 30"/>',
  clock: '<circle cx="32" cy="32" r="22"/><path d="M32 17V32L42 39"/><path d="M32 8V12M32 52V56M8 32H12M52 32H56"/>',
  nodes:
    '<circle cx="32" cy="14" r="6"/><circle cx="14" cy="46" r="6"/><circle cx="50" cy="46" r="6"/><path d="M29 19L17 41M35 19L47 41M20 46H44"/>',
  key: '<circle cx="21" cy="32" r="11"/><circle cx="21" cy="32" r="4"/><path d="M32 32H58M50 32V41M56 32V38"/>',
  crystal: '<path d="M32 6L52 26L32 58L12 26Z"/><path d="M12 26H52M32 6L24 26L32 58L40 26Z"/>',
  hammer: '<path d="M14 14H44V28H14Z"/><path d="M44 18H54V24H44M29 28V58"/><path d="M22 58H36"/>',
  term: '<rect x="6" y="12" width="52" height="40" rx="3"/><path d="M14 24L24 32L14 40M28 42H44"/>',
  eye: '<path d="M4 32C14 16 50 16 60 32C50 48 14 48 4 32Z"/><circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="3"/>',
  chat: '<path d="M8 10H56V44H30L18 56V44H8Z"/><path d="M18 22H46M18 32H38"/>',
  board: '<rect x="6" y="8" width="16" height="48"/><rect x="24" y="8" width="16" height="34"/><rect x="42" y="8" width="16" height="22"/>',
  crown: '<path d="M8 48L12 18L24 32L32 12L40 32L52 18L56 48Z"/><path d="M8 54H56"/>',
  moon: '<path d="M44 8C30 10 22 22 24 36C26 48 36 56 50 54C38 54 28 46 28 34C28 22 34 12 44 8Z"/>',
  cog: '<circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="20"/><path d="M32 6V12M32 52V58M6 32H12M52 32H58M14 14L18 18M46 46L50 50M50 14L46 18M18 46L14 50"/>',
  mic: '<rect x="24" y="6" width="16" height="30" rx="8"/><path d="M14 30C14 44 50 44 50 30M32 44V56M22 56H42"/>',
  globe: '<circle cx="32" cy="32" r="22"/><ellipse cx="32" cy="32" rx="10" ry="22"/><path d="M10 32H54M14 20H50M14 44H50"/>',
  hand: '<path d="M20 30V14M28 28V10M36 28V12M44 32V18M20 30C16 26 10 30 14 38L22 52H42L50 36C52 30 44 28 44 32"/>',
  star: '<path d="M32 6L39 24L58 25L43 37L48 56L32 45L16 56L21 37L6 25L25 24Z"/>',
  shield: '<path d="M32 6L52 14V32C52 44 43 53 32 58C21 53 12 44 12 32V14Z"/><path d="M22 32L30 40L44 24"/>',
  scroll:
    '<path d="M16 8H46V50C46 54 52 54 52 50V46H40V54H18C14 54 12 50 12 46V12C12 10 14 8 16 8Z"/><path d="M22 18H38M22 26H38M22 34H34"/>',
  bug: '<ellipse cx="32" cy="36" rx="12" ry="16"/><circle cx="32" cy="16" r="6"/><path d="M20 28H8M20 38H8M20 46L10 54M44 28H56M44 38H56M44 46L54 54M32 22V52M26 10L22 4M38 10L42 4"/>',
  plug: '<path d="M22 6V20M42 6V20M14 20H50V30C50 40 42 46 32 46C22 46 14 40 14 30Z"/><path d="M32 46V58"/>',
  puzzle: '<path d="M10 20H24C22 12 28 8 32 8C36 8 42 12 40 20H54V32C46 30 42 36 46 42C48 46 52 48 54 46V58H10Z"/>',
  book: '<path d="M8 12C16 10 26 10 32 16C38 10 48 10 56 12V50C48 48 38 48 32 54C26 48 16 48 8 50Z"/><path d="M32 16V54"/>',
  brain:
    '<path d="M32 10C26 6 16 10 16 20C10 22 8 32 14 38C12 46 20 54 28 50C30 54 34 54 36 50C44 54 52 46 50 38C56 32 54 22 48 20C48 10 38 6 32 10Z"/><path d="M32 10V50M22 24C26 24 28 28 28 32M42 24C38 24 36 28 36 32M20 40C24 40 28 38 28 36M44 40C40 40 36 38 36 36"/>',
  cloud: '<path d="M18 46C8 46 6 32 16 30C16 18 34 14 40 26C52 24 58 38 50 46Z"/>',
  bolt: '<path d="M36 6L14 36H30L26 58L50 26H34Z"/>',
  lock: '<rect x="14" y="28" width="36" height="28" rx="2"/><path d="M22 28V20C22 12 42 12 42 20V28"/><circle cx="32" cy="42" r="3"/>',
  rocket:
    '<path d="M32 6C42 14 44 28 40 42H24C20 28 22 14 32 6Z"/><circle cx="32" cy="24" r="4"/><path d="M24 42L16 50V40L22 34M40 42L48 50V40L42 34M28 48L32 58L36 48"/>',
  branch:
    '<circle cx="18" cy="12" r="5"/><circle cx="18" cy="52" r="5"/><circle cx="46" cy="24" r="5"/><path d="M18 17V47M46 29C46 40 18 36 18 47"/>',
  container: '<rect x="8" y="22" width="48" height="26"/><path d="M18 22V48M28 22V48M38 22V48M48 22V48M8 14H56"/>',
  image: '<rect x="8" y="12" width="48" height="40" rx="2"/><circle cx="22" cy="26" r="5"/><path d="M8 46L22 34L34 44L42 38L56 48"/>',
  film: '<rect x="10" y="8" width="44" height="48"/><path d="M10 18H54M10 46H54M20 8V56M44 8V56M10 28H20M10 38H20M44 28H54M44 38H54"/>',
  speaker: '<path d="M10 24H20L32 14V50L20 40H10Z"/><path d="M40 24C46 28 46 36 40 40M46 18C56 26 56 38 46 46"/>',
  compass: '<circle cx="32" cy="32" r="22"/><path d="M42 22L36 36L22 42L28 28Z"/>',
  hourglass:
    '<path d="M16 8H48M16 56H48M18 8C18 24 30 28 32 32C34 28 46 24 46 8M18 56C18 40 30 36 32 32C34 36 46 40 46 56"/>',
  bell: '<path d="M32 8C22 8 18 16 18 26C18 38 12 42 12 46H52C52 42 46 38 46 26C46 16 42 8 32 8Z"/><path d="M26 52C26 56 38 56 38 52"/>',
  cube: '<path d="M32 6L54 18V44L32 58L10 44V18Z"/><path d="M10 18L32 30L54 18M32 30V58"/>',
  wrench:
    '<path d="M44 8C38 8 34 14 36 20L12 44C10 46 10 50 12 52C14 54 18 54 20 52L44 28C50 30 56 26 56 20L48 26L42 20L48 12C46 10 46 8 44 8Z"/>',
  feather:
    '<path d="M50 8C30 8 14 22 14 42L10 56L14 54C14 54 22 50 30 48C44 44 52 28 50 8Z"/><path d="M14 54L38 24M26 44L36 44M30 34L42 32"/>',
  laurel:
    '<path d="M32 56C14 52 8 36 10 18"/><path d="M12 24C6 22 6 16 8 12C14 14 16 20 12 24ZM10 36C4 34 4 28 6 24C12 26 14 32 10 36ZM16 46C10 46 8 40 10 36C16 36 18 42 16 46Z"/><g transform="translate(64 0) scale(-1 1)"><path d="M32 56C14 52 8 36 10 18"/><path d="M12 24C6 22 6 16 8 12C14 14 16 20 12 24ZM10 36C4 34 4 28 6 24C12 26 14 32 10 36ZM16 46C10 46 8 40 10 36C16 36 18 42 16 46Z"/></g>'
}

function hash(s) {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return x >>> 0
}
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let m = Math.imul(a ^ (a >>> 15), 1 | a)
    m = (m + Math.imul(m ^ (m >>> 7), 61 | m)) ^ m
    return ((m ^ (m >>> 14)) >>> 0) / 4294967296
  }
}

function placeholderSvg(id, glyph, slice) {
  const R0 = rng(hash(id))
  const uid = `a${hash(id)}`
  let lines = ''
  const n = 34 + Math.floor(R0() * 18)
  const cx = 64 + (R0() - 0.5) * 14
  const cy = 64 + (R0() - 0.5) * 14
  for (let i = 0; i < n; i++) {
    const a = R0() * Math.PI * 2
    const r0 = 14 + R0() * 18
    const r1 = 60 + R0() * 64
    lines += `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" stroke="#C5CADB" stroke-opacity="${(0.12 + R0() * 0.4).toFixed(2)}" stroke-width="${(0.4 + R0() * 0.7).toFixed(2)}"/>`
  }
  let rings = ''
  for (let i = 0; i < 3; i++)
    rings += `<circle cx="${cx}" cy="${cy}" r="${(24 + i * 13 + R0() * 3).toFixed(1)}" fill="none" stroke="#8585F9" stroke-opacity="${(0.25 - i * 0.06).toFixed(2)}" stroke-width=".7"/>`
  const g = GLYPHS[glyph] || GLYPHS.star
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" preserveAspectRatio="${slice ? 'xMidYMid slice' : 'xMidYMid meet'}"><defs><radialGradient id="g${uid}" cx="50%" cy="46%" r="70%"><stop offset="0" stop-color="#1B1B8A"/><stop offset=".55" stop-color="#0A0A4A"/><stop offset="1" stop-color="#0D0D24"/></radialGradient><linearGradient id="m${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAFAFF"/><stop offset=".45" stop-color="#9FA6C6"/><stop offset=".6" stop-color="#E6E6EF"/><stop offset="1" stop-color="#5B6296"/></linearGradient><filter id="n${uid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${hash(id) % 97}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 .95  0 0 0 9 -4.4"/></filter></defs><rect width="128" height="128" fill="url(#g${uid})"/><rect width="128" height="128" filter="url(#n${uid})" opacity=".7"/>${rings}${lines}<g transform="translate(24 24)" fill="none" stroke="url(#m${uid})" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${g}</g><g transform="translate(24 24)" fill="none" stroke="#0D0D24" stroke-opacity=".35" stroke-width=".6" stroke-linejoin="round">${g}</g></svg>`
}

const placeholderCache = new Map()
function placeholderUri(id, glyph, slice) {
  const k = `${id}|${glyph}|${slice ? 1 : 0}`
  let v = placeholderCache.get(k)
  if (!v) {
    v = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(id, glyph, slice))}`
    placeholderCache.set(k, v)
  }
  return v
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

const BAYER_WIPE_URI = (() => {
  let rects = '<rect width="16" height="540" fill="#000"/>'
  for (let row = 0; row < 36; row++) {
    const t0 = (row + 0.5) / 36
    const bRow = BAYER4[row & 3]
    for (let col = 0; col < 4; col++) {
      if ((bRow[col] + 0.5) / 16 >= t0) {
        rects += `<rect x="${col * 4}" y="${540 + row * 4}" width="4" height="4" fill="#000"/>`
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="1280" viewBox="0 0 16 1280" shape-rendering="crispEdges">${rects}</svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
})()

const BAYER_TILE_URI = (() => {
  const pts = [
    [0, 0, 2],
    [4, 4, 2],
    [4, 0, 1],
    [0, 4, 1],
    [2, 2, 1],
    [6, 6, 1]
  ]
  const rects = pts.map(([x, y, o]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#fff" fill-opacity="${o === 2 ? 1 : 0.45}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" shape-rendering="crispEdges">${rects}</svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
})()

// Greek key, one 18 x 9 unit, used as a mask so the line takes any colour.
const MEANDER_URI = (() => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="9" viewBox="0 0 18 9" shape-rendering="crispEdges"><path d="M0 8.5H18M2.5 8.5V1.5H14.5V6H6.5V3.5H10.5" fill="none" stroke="#000" stroke-width="1" stroke-linecap="square"/></svg>'
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
})()
// The header frieze: the key between two rules, 24 x 16 per unit.
const FRIEZE_URI = (() => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" shape-rendering="crispEdges"><path d="M0 .5H24M0 15.5H24" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1"/><path d="M0 12.5H24M3.5 12.5V3.5H19.5V9.5H8.5V6.5H15.5" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="square"/></svg>'
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
})()
// The Hermes wordmark face ships with Desktop; the serifs after it are the fallback elsewhere.
const DISPLAY_FONT = "'Collapse','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif"

function useArtIndex() {
  const q = useQuery({
    queryKey: KEY_ART_INDEX,
    queryFn: () => rest('/art-index'),
    staleTime: 5 * 60 * 1000,
    retry: 0
  })
  // ready: the backend has said which trophies have a picture (or failed to), so "no picture" can be trusted.
  return useMemo(() => ({ ids: new Set(q.data?.ids || []), ready: q.data !== undefined || q.status === 'success' || q.status === 'error' }), [q.data, q.status])
}

// A 1 x 1 transparent picture: what a tile holds while its real picture is on the way.
const BLANK_URI = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// Olympian pictures are finished once per trophy and reused everywhere (gallery, pop-up, holo texture).
const OLYMPIAN_ART = new Map()
function olympianUrl(id, src) {
  const hit = OLYMPIAN_ART.get(id)
  if (hit && hit.src === src) return hit.url
  if (hit) void hit.url.then(u => URL.revokeObjectURL(u)).catch(() => {})
  const url = loadImage(src).then(img => canvasBlob(gradedShareArt(img, 4))).then(b => URL.createObjectURL(b))
  OLYMPIAN_ART.set(id, { src, url })
  url.catch(() => OLYMPIAN_ART.delete(id))
  return url
}
function disposeOlympianArt() {
  for (const v of OLYMPIAN_ART.values()) void v.url.then(u => URL.revokeObjectURL(u)).catch(() => {})
  OLYMPIAN_ART.clear()
}

const ART_GC_MS = 10 * 60 * 1000
const KEY_ART = 'art-v4'

function artFetch(id) {
  return queryClient.fetchQuery({
    queryKey: [ID, KEY_ART, id],
    queryFn: () => rest(`/art/${encodeURIComponent(id)}`),
    staleTime: Infinity,
    gcTime: ART_GC_MS
  })
}

// True once the element has come near the viewport (or at once where IntersectionObserver is missing).
function useNearViewport(ref) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (near || !ref.current) return undefined
    let io
    try {
      io = new IntersectionObserver(
        es => {
          if (es.some(e => e.isIntersecting)) {
            setNear(true)
            io.disconnect()
          }
        },
        { rootMargin: '240px' }
      )
      io.observe(ref.current)
    } catch {
      setNear(true)
    }
    return () => io?.disconnect()
  }, [near])
  return near
}

// ---------------------------------------------------------------------------
// Shared WebGL2 TrophyFX Engine: HoloCard Voronoi Shards + Reverse Bayer Dither Veil + Spring Tilt
// Single shared WebGL2 context blitting to lightweight 2D canvases (zero context-limit pressure).
// ---------------------------------------------------------------------------

const DITHER_PALETTES = {
  locked: [[0.04, 0.05, 0.16], [0.58, 0.61, 1.0], [0.26, 0.34, 1.0]],
  0: [[0.09, 0.05, 0.14], [0.91, 0.56, 0.35], [1.0, 0.8, 0.64]],
  1: [[0.05, 0.07, 0.18], [0.88, 0.91, 0.98], [0.58, 0.64, 1.0]],
  2: [[0.1, 0.07, 0.16], [0.96, 0.81, 0.42], [1.0, 0.95, 0.74]],
  3: [[0.03, 0.09, 0.2], [0.6, 0.93, 1.0], [0.9, 0.99, 1.0]],
  4: [[0.07, 0.06, 0.2], [0.93, 0.9, 1.0], [1.0, 0.72, 0.9]]
}

const FX_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FX_FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uScale;
uniform float uCell;
uniform int uTier;
uniform int uGrade;
uniform float uHolo;
uniform float uHover;
uniform vec2 uTilt;
uniform vec2 uLight;
uniform float uDistance;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uRim;
uniform vec4 uSegs[6];
uniform vec4 uBurst;

in vec2 vUv;
out vec4 fragColor;

const float TAU = 6.28318530718;

struct Foil {
  float mask;
  float angle;
  float jitter;
  vec2 facet;
};

float bayer8(vec2 cell) {
  ivec2 p = ivec2(mod(cell, 8.0));
  int v = p.x ^ p.y;
  int m = ((v & 1) << 5) | ((p.y & 1) << 4) | ((v & 2) << 2) | ((p.y & 2) << 1) | ((v & 4) >> 1) | ((p.y & 4) >> 2);
  return (float(m) + 0.5) / 64.0;
}

float h1(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 h2(vec2 p) {
  return vec2(h1(p), h1(p + 17.31));
}

// Exact spectral hue ramp from ReactBits HoloCard
vec3 holoHue(float t) {
  t = abs(fract(t * 0.5) * 2.0 - 1.0);
  vec3 c = mix(vec3(0.1, 0.25, 1.0), vec3(0.0, 0.85, 1.0), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.25, 1.0, 0.2), smoothstep(0.25, 0.45, t));
  c = mix(c, vec3(1.0, 0.92, 0.05), smoothstep(0.45, 0.65, t));
  c = mix(c, vec3(1.0, 0.45, 0.05), smoothstep(0.65, 0.85, t));
  return mix(c, vec3(0.95, 0.12, 0.3), smoothstep(0.85, 1.0, t));
}

// Exact shards(p) preset from ReactBits HoloCard
Foil holoShards(vec2 p) {
  vec2 g = p * 19.0;
  vec2 base = floor(g);
  float best = 9.0;
  float second = 9.0;
  vec2 id = base;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      float d = length(cell + 0.08 + h2(cell) * 0.84 - g);
      if (d < best) {
        second = best;
        best = d;
        id = cell;
      } else if (d < second) {
        second = d;
      }
    }
  }
  float crack = smoothstep(0.015, 0.07, second - best);
  float shine = 0.25 + 0.75 * pow(h1(id + 7.7), 2.0);
  return Foil((0.2 + 0.8 * crack) * shine, h1(id + 3.17) * TAU, h1(id + 11.73), (h2(id + 5.0) - 0.5) * 0.5);
}

vec3 holoSparkles(vec2 p, vec3 halfway, vec2 sweep, float awake) {
  vec2 g = p * 62.0;
  vec2 cell = floor(g);
  vec2 d = fract(g) - 0.5 - (h2(cell) - 0.5) * 0.36;
  float spin = h1(cell + 3.0) * TAU;
  d = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * d;
  vec2 a = abs(d);
  float hexagon = max(a.x * 0.866 + a.y * 0.5, a.y);
  float size = mix(0.22, 0.38, h1(cell + 2.0));
  float piece = smoothstep(size, size - 0.07, hexagon) * step(0.42, h1(cell + 4.0));
  vec3 facet = normalize(vec3((h2(cell + 6.0) - 0.5) * 0.9, 1.0));
  float flash = pow(max(dot(facet, halfway), 0.0), 6.0);
  vec3 tint = holoHue(dot(sweep, vec2(cos(spin), sin(spin))) * 1.2 + dot(sweep, vec2(0.8, 0.6)) * 0.8 + h1(cell + 8.0) * 0.5);
  return piece * tint * (0.3 + 1.6 * flash) * awake;
}

vec3 gradeTier(vec3 c, int t) {
  if (t < 0) return vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.48);
  if (t == 0) return clamp(vec3(1.10 * c.r + 0.10 * c.g, 0.08 * c.r + 0.78 * c.g, -0.55 * c.g + c.b), 0.0, 1.0);
  if (t == 1) return c;
  if (t == 2) return clamp(vec3(1.05 * c.r + 0.12 * c.g, 0.05 * c.r + 1.02 * c.g, -0.60 * c.g + c.b), 0.0, 1.0);
  if (t == 3) return clamp(vec3(0.84 * c.r - 0.10 * c.g + 0.06 * c.b, 0.10 * c.r + 1.04 * c.g + 0.06 * c.b, 0.16 * c.r + 0.14 * c.g + 1.06 * c.b), 0.0, 1.0);
  return clamp(vec3(1.10 * c.r + 0.04 * c.g + 0.02 * c.b, 0.02 * c.r + 1.08 * c.g + 0.04 * c.b, 0.06 * c.r + 0.06 * c.g + 1.14 * c.b), 0.0, 1.0);
}

float segPoint(vec2 p, vec4 a, vec4 b) {
  if (a.z <= 0.001) return 0.0;
  vec2 pa = p - a.xy;
  vec2 ba = (b.z > 0.001 ? b.xy : a.xy) - a.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  float d = length(pa - ba * h);
  float str = mix(a.z, b.z > 0.001 ? b.z : a.z, h);
  float rad = a.w * (0.55 + 0.45 * str);
  return clamp((rad - d) / max(rad * 0.62, 0.02), 0.0, 1.0) * str;
}

float segMask(vec2 p) {
  float m = segPoint(p, uSegs[0], uSegs[1]);
  m = max(m, segPoint(p, uSegs[1], uSegs[2]));
  m = max(m, segPoint(p, uSegs[2], uSegs[3]));
  m = max(m, segPoint(p, uSegs[3], uSegs[4]));
  m = max(m, segPoint(p, uSegs[4], uSegs[5]));
  if (uBurst.w > 0.001) {
    float bd = abs(distance(p, uBurst.xy) - uBurst.z);
    m = max(m, clamp(1.0 - bd / 0.12, 0.0, 1.0) * uBurst.w);
  }
  return clamp(m, 0.0, 1.0);
}

vec2 imgUv(vec2 uv) {
  return (uv - 0.5) * uScale + 0.5;
}

float inBounds(vec2 uv) {
  vec2 s = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return s.x * s.y;
}

void main() {
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float uAspect = uRes.y / max(uRes.x, 1.0);
  vec2 pUv = vUv * aspect;
  float trail = segMask(pUv);

  if (uHolo < 0.5 && trail <= 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 iUv = imgUv(vUv);
  float inside = inBounds(iUv);
  vec3 raw = inside > 0.5 ? texture(uTex, iUv).rgb : vec3(0.051, 0.051, 0.141);
  vec3 base = gradeTier(raw, uGrade);

  vec3 lit = base;
  float outAlpha = 0.0;

  if (uHolo > 0.5) {
    // Exact ReactBits HoloCard (preset='shards', glare=0.3) linear-space optical pipeline
    vec3 art = pow(base, vec3(2.2));
    vec2 p = vec2(vUv.x, vUv.y * uAspect);
    vec2 center = vec2(0.5, 0.5 * uAspect);
    vec2 qBox = abs(p - center) - center + 0.04;
    float outside = length(max(qBox, 0.0)) + min(max(qBox.x, qBox.y), 0.0) - 0.04;
    float pixel = 1.0 / max(uRes.x, 1.0);
    float frame = 1.0 - smoothstep(0.032 - pixel, 0.032 + pixel, -outside);

    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(uTilt.x), sin(uTilt.x), 0.0, -sin(uTilt.x), cos(uTilt.x));
    mat3 ry = mat3(cos(uTilt.y), 0.0, -sin(uTilt.y), 0.0, 1.0, 0.0, sin(uTilt.y), 0.0, cos(uTilt.y));
    mat3 turn = rx * ry;
    vec3 world = turn * vec3(p - center, 0.0);
    vec3 view = normalize(transpose(turn) * (vec3(0.0, 0.0, uDistance) - world));
    vec3 lamp = vec3((uLight - 0.5) * vec2(1.1, 1.1 * uAspect), 0.9);
    vec3 light = normalize(transpose(turn) * (lamp - world));
    vec3 halfway = normalize(light + view);
    vec2 sweep = light.xy + view.xy;
    float sheen = pow(max(halfway.z, 0.0), 10.0);
    float shine = pow(max(halfway.z, 0.0), 80.0);

    Foil f = holoShards(p);
    vec3 metal = uTier == 4 ? vec3(0.95, 0.92, 1.0) : vec3(0.56, 0.88, 1.0);
    vec4 look = vec4(0.9, 0.9, 0.6, 0.5);
    vec2 dir = vec2(cos(f.angle), sin(f.angle));
    float phase = dot(sweep, dir) * look.x + dot(sweep, vec2(0.8, 0.6)) * look.y + f.jitter * look.z;
    vec3 tint = mix(holoHue(phase), metal, uTier == 4 ? 0.1 : 0.28);
    float glint = pow(max(dot(normalize(vec3(f.facet, 1.0)), halfway), 0.0), 24.0) * step(0.001, length(f.facet));
    vec3 foil = tint * (1.15 + 0.3 * sheen) + metal * glint * 1.2;

    float tilted = smoothstep(0.02, 0.21, length(sin(uTilt)));
    float awake = mix(0.08, 0.72, tilted * (0.35 + 0.65 * uHover));
    float sculpt = inside * smoothstep(0.17, 0.34, 0.85 * raw.r + 0.85 * raw.g - 0.63 * raw.b);
    float uIntensity = mix(0.14, 0.76, sculpt);
    float strength = uIntensity * f.mask * (1.0 - frame * 0.4) * awake;
    float band = 0.25 + 0.75 * smoothstep(0.3, 0.95, 0.5 + 0.5 * cos(phase * TAU * 0.5 + 1.3));

    vec3 color = 1.0 - (1.0 - art) * (1.0 - clamp(foil * look.w * band * strength, 0.0, 1.0));
    color += holoSparkles(p, halfway, sweep, mix(0.25, 0.85, tilted)) * 0.45 * frame;
    // Gate glare strictly by uHover + sculpture so linear->sRGB gamma never washes out #0D0D24 cobalt at rest!
    color += metal * (sheen * 0.05 + shine * 0.22) * 0.30 * uHover * (0.18 + 0.82 * sculpt);
    lit = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
    outAlpha = 1.0;
  }

  if (trail > 0.001) {
    vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec2 cell = floor(px / uCell);
    vec2 centerUv = ((cell + 0.5) * uCell) / uRes;
    vec2 cImgUv = imgUv(centerUv);
    vec3 cRaw = inBounds(cImgUv) > 0.5 ? texture(uTex, cImgUv).rgb : vec3(0.051, 0.051, 0.141);
    float cSculpt = smoothstep(0.16, 0.34, 0.85 * cRaw.r + 0.85 * cRaw.g - 0.63 * cRaw.b);
    float luma = dot(cRaw, vec3(0.2126, 0.7152, 0.0722));
    float graded = pow(clamp((luma - 0.42) * 1.38 + 0.50, 0.0, 1.0), 1.28);
    float bVal = bayer8(cell);
    float steps = 2.0;
    float s = graded * steps;
    float qBase = floor(s);
    float q = min(qBase + step(bVal, s - qBase), steps) / steps;
    vec3 ditherCol = mix(uInk, uPaper, q);

    float shown = 1.0 - trail * 0.78;
    float order = bayer8(cell.yx);
    float rimW = 0.15;
    float low = order * (1.0 - rimW);
    float isRim = step(low, shown) * (1.0 - step(low + rimW, shown));
    float isDither = (1.0 - step(low + rimW, shown)) * mix(0.54, 0.36, cSculpt);

    vec3 cellCol = mix(ditherCol, uRim, isRim);
    if (outAlpha > 0.5) {
      lit = mix(lit, cellCol, isDither);
    } else {
      lit = cellCol;
      outAlpha = isDither;
    }
  }

  fragColor = vec4(lit * outAlpha, outAlpha);
}`

const FX_ENGINE = {
  slots: [],
  freeSlots: [],
  tasks: new Set(),
  raf: 0,
  modalDepth: 0,
  hidden: false,
  visBound: false
}

const FX_MAX_CONTEXTS = 6

function destroyFxSlot(slot) {
  if (!slot) return
  slot.cv?.remove()
  const gl = slot.gl
  if (gl && !gl.isContextLost()) {
    if (slot.tex) guard(() => gl.deleteTexture(slot.tex))
    guard(() => slot.vao && gl.deleteVertexArray(slot.vao))
    guard(() => slot.prog && gl.deleteProgram(slot.prog))
    guard(() => gl.getExtension('WEBGL_lose_context')?.loseContext())
  }
  slot.gl = null
  slot.tex = null
  slot.texSrc = ''
}

function parkFxSlot(slot) {
  if (!slot) return
  const idx = FX_ENGINE.slots.indexOf(slot)
  if (idx >= 0) FX_ENGINE.slots.splice(idx, 1)
  slot.hovered = false
  slot.priority = false
  const onEvict = slot.onEvict
  slot.onEvict = null
  slot.cv?.remove()
  if (!slot.gl || slot.gl.isContextLost()) {
    destroyFxSlot(slot)
    onEvict?.()
    return
  }
  guard(() => {
    slot.gl.clearColor(0, 0, 0, 0)
    slot.gl.clear(slot.gl.COLOR_BUFFER_BIT)
  })
  FX_ENGINE.freeSlots.push(slot)
  onEvict?.()
}

function disposeFxEngine() {
  if (FX_ENGINE.raf) cancelAnimationFrame(FX_ENGINE.raf)
  FX_ENGINE.raf = 0
  FX_ENGINE.tasks.clear()
  while (FX_ENGINE.slots.length) destroyFxSlot(FX_ENGINE.slots.pop())
  while (FX_ENGINE.freeSlots.length) destroyFxSlot(FX_ENGINE.freeSlots.pop())
}

function createCompiledSlot() {
  try {
    const cv = document.createElement('canvas')
    cv.className = 'tr-fx-cv'
    cv.setAttribute('aria-hidden', 'true')
    const gl = cv.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    })
    if (!gl) return null
    const compile = (type, src) => {
      const sh = gl.createShader(type)
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh)
        return null
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, FX_VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FX_FRAG)
    if (!vs || !fs) return null
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
    const vao = gl.createVertexArray()
    const names = ['uTex', 'uRes', 'uScale', 'uCell', 'uTier', 'uGrade', 'uHolo', 'uHover', 'uTilt', 'uLight', 'uDistance', 'uInk', 'uPaper', 'uRim', 'uSegs[0]', 'uBurst']
    const u = {}
    for (const nm of names) u[nm] = gl.getUniformLocation(prog, nm)
    if (!FX_ENGINE.visBound && typeof document !== 'undefined') {
      FX_ENGINE.visBound = true
      document.addEventListener('visibilitychange', () => {
        FX_ENGINE.hidden = document.hidden
        if (!FX_ENGINE.hidden) wakeFxEngine()
      })
    }
    return { cv, gl, prog, vao, u, tex: null, texSrc: '', hovered: false, priority: false, onEvict: null }
  } catch {
    return null
  }
}

function prewarmFxSlot() {
  if (FX_ENGINE.freeSlots.length || FX_ENGINE.slots.length >= FX_MAX_CONTEXTS) return
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const s = createCompiledSlot()
  if (s) FX_ENGINE.freeSlots.push(s)
}

function acquireFxSlot(wrap, onEvict) {
  while (FX_ENGINE.freeSlots.length) {
    const warm = FX_ENGINE.freeSlots.pop()
    if (warm.gl && !warm.gl.isContextLost()) {
      warm.onEvict = onEvict
      wrap.appendChild(warm.cv)
      FX_ENGINE.slots.push(warm)
      return warm
    }
    destroyFxSlot(warm)
  }
  if (FX_ENGINE.slots.length >= FX_MAX_CONTEXTS) {
    const victim = FX_ENGINE.slots.find(s => !s.hovered && !s.priority) || FX_ENGINE.slots[0]
    parkFxSlot(victim)
    if (FX_ENGINE.freeSlots.length) {
      const reused = FX_ENGINE.freeSlots.pop()
      reused.onEvict = onEvict
      wrap.appendChild(reused.cv)
      FX_ENGINE.slots.push(reused)
      return reused
    }
  }
  const fresh = createCompiledSlot()
  if (!fresh) return null
  fresh.onEvict = onEvict
  wrap.appendChild(fresh.cv)
  FX_ENGINE.slots.push(fresh)
  return fresh
}

function wakeFxEngine() {
  if (FX_ENGINE.raf || FX_ENGINE.hidden || !FX_ENGINE.tasks.size) return
  FX_ENGINE.raf = requestAnimationFrame(stepFxEngine)
}

function stepFxEngine(now) {
  FX_ENGINE.raf = 0
  if (FX_ENGINE.hidden || !FX_ENGINE.tasks.size) return
  let anyActive = false
  for (const task of FX_ENGINE.tasks) {
    if (task(now)) anyActive = true
  }
  if (anyActive && FX_ENGINE.tasks.size) {
    FX_ENGINE.raf = requestAnimationFrame(stepFxEngine)
  }
}

function TrophyFxCanvas({ src, imgRef, tier, holo, contain, burstOnMount, pregraded = false, dither = true, seed = 0 }) {
  const wrapRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof window === 'undefined') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    const hostEl = wrap.closest('.tr-ac, .tr-tc, .tr-dlg-col, .tr-big') || wrap.parentElement
    const tiltEl = wrap.closest('.tr-dlg-col') ? wrap.parentElement : hostEl
    const isDetailOrBig = !!wrap.closest('.tr-dlg-col, .tr-big')
    const tiltMax = isDetailOrBig ? 10 : tier >= 3 ? 12 : 7
    const hoverScale = isDetailOrBig ? 1.018 : 1.028
    const PERSPECTIVE = 1100
    const LINGER = 0.88
    const segBuf = new Float32Array(6 * 4)

    let slot = null
    let glFailed = false
    let visible = true
    let inside = false
    let hoverAmt = 0
    let targetNx = 0.5
    let targetNy = 0.5
    let tiltX = 0, tiltVX = 0
    let tiltY = 0, tiltVY = 0
    let lightX = 0.36, lightVX = 0
    let lightY = 0.26, lightVY = 0
    let lift = 1, liftV = 0
    let clock = (seed % 97) * 0.41
    let lastT = performance.now()
    let lastPtAt = 0
    let wasDrawing = false
    const pts = []
    let burst = burstOnMount ? { x: 0.5, y: 0.5, start: performance.now() + 40 } : null

    const springStep = (val, vel, target, k, damp, dt) => {
      const nv = vel + ((target - val) * k - vel * damp) * dt
      return [val + nv * dt, nv]
    }

    let hostRect = null
    let wrapRect = null
    let dpr = 1
    let pw = 168
    let ph = 168
    const refreshRects = () => {
      if (hostEl) hostRect = hostEl.getBoundingClientRect()
      wrapRect = wrap.getBoundingClientRect()
      const maxDpr = isDetailOrBig ? 1.15 : 1.2
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      const baseW = wrap.clientWidth || wrapRect.width || 168
      const baseH = wrap.clientHeight || wrapRect.height || 168
      pw = Math.max(2, Math.round(baseW * dpr))
      ph = Math.max(2, Math.round(baseH * dpr))
      if (slot?.cv && (slot.cv.width !== pw || slot.cv.height !== ph)) {
        slot.cv.width = pw
        slot.cv.height = ph
      }
    }
    refreshRects()

    let decodePending = false
    const ensureSlot = () => {
      if (glFailed) return null
      if (slot && slot.gl && !slot.gl.isContextLost()) {
        if (slot.cv.width !== pw || slot.cv.height !== ph) {
          slot.cv.width = pw
          slot.cv.height = ph
        }
        return slot
      }
      slot = acquireFxSlot(wrap, () => {
        slot = null
        setReady(false)
      })
      if (!slot) glFailed = true
      else {
        slot.priority = isDetailOrBig
        slot.cv.width = pw
        slot.cv.height = ph
      }
      return slot
    }

    const pushTrailPoint = (clientX, clientY, force) => {
      if (!dither) return
      if (!wrapRect || !wrapRect.width || !wrapRect.height) refreshRects()
      if (!wrapRect.width || !wrapRect.height) return
      const x = (clientX - wrapRect.left) / wrapRect.width
      const y = (clientY - wrapRect.top) / wrapRect.height
      if (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08) return
      const now = performance.now()
      const aspect = wrapRect.width / Math.max(wrapRect.height, 1)
      const ax = x * aspect
      const ay = y
      const prev = pts[0]
      if (!force && prev && now - lastPtAt < 32 && Math.hypot(ax - prev.x, ay - prev.y) < 0.04) return
      lastPtAt = now
      pts.unshift({ x: ax, y: ay, t: now })
      if (pts.length > 6) pts.length = 6
    }

    const onEnter = e => {
      FX_ENGINE.hidden = false
      refreshRects()
      inside = true
      if (slot) slot.hovered = true
      onMove(e, true)
    }
    const onMove = (e, forced = false) => {
      FX_ENGINE.hidden = false
      if (!hostRect || !hostRect.width) refreshRects()
      if (!hostRect || !hostRect.width || !hostRect.height) return
      targetNx = Math.max(0, Math.min(1, (e.clientX - hostRect.left) / hostRect.width))
      targetNy = Math.max(0, Math.min(1, (e.clientY - hostRect.top) / hostRect.height))
      const wasIn = inside
      inside = true
      if (slot) slot.hovered = true
      pushTrailPoint(e.clientX, e.clientY, forced || !wasIn)
      wakeFxEngine()
    }
    const onLeave = () => {
      inside = false
      if (slot) slot.hovered = false
      wakeFxEngine()
    }
    const onDown = e => {
      if (!dither) return
      refreshRects()
      if (!wrapRect || !wrapRect.width || !wrapRect.height) return
      const aspect = wrapRect.width / Math.max(wrapRect.height, 1)
      const bx = ((e.clientX - wrapRect.left) / wrapRect.width) * aspect
      const by = (e.clientY - wrapRect.top) / wrapRect.height
      if (by >= -0.05 && by <= 1.05) {
        burst = { x: bx, y: by, start: performance.now() }
        wakeFxEngine()
      }
    }

    const step = now => {
      if (!visible) return false
      if (!isDetailOrBig && FX_ENGINE.modalDepth > 0) {
        inside = false
        pts.length = 0
        burst = null
        if (tiltEl) tiltEl.style.transform = ''
        if (slot) {
          parkFxSlot(slot)
          slot = null
          setReady(false)
        }
        return false
      }

      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastT) / 1000))
      lastT = now
      hoverAmt += ((inside ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 10))

      let wantTiltX = 0
      let wantTiltY = 0
      let wantLightX = 0.36
      let wantLightY = 0.26
      let wantLift = 1
      if (inside) {
        wantTiltX = (0.5 - targetNy) * 2 * tiltMax
        wantTiltY = (targetNx - 0.5) * 2 * tiltMax
        wantLightX = targetNx
        wantLightY = targetNy
        wantLift = hoverScale
      } else if (holo) {
        clock += dt
        wantTiltX = Math.sin(clock * 0.7) * tiltMax * 0.26
        wantTiltY = Math.sin(clock * 0.53 + 1.2) * tiltMax * 0.36
        wantLightX = 0.5 + Math.sin(clock * 0.41) * 0.42
        wantLightY = 0.38 + Math.sin(clock * 0.33 + 0.6) * 0.3
      }

      const subSteps = Math.ceil(dt / (1 / 240))
      const sh = dt / subSteps
      for (let i = 0; i < subSteps; i++) {
        ;[tiltX, tiltVX] = springStep(tiltX, tiltVX, wantTiltX, 150, 16, sh)
        ;[tiltY, tiltVY] = springStep(tiltY, tiltVY, wantTiltY, 150, 16, sh)
        ;[lightX, lightVX] = springStep(lightX, lightVX, wantLightX, 220, 30, sh)
        ;[lightY, lightVY] = springStep(lightY, lightVY, wantLightY, 220, 30, sh)
        ;[lift, liftV] = springStep(lift, liftV, wantLift, 320, 30, sh)
      }

      const domMoving = inside || Math.abs(lift - 1) > 0.0015 || (!holo && (Math.abs(tiltX) > 0.03 || Math.abs(tiltY) > 0.03))
      if (tiltEl) {
        if (domMoving) {
          tiltEl.style.transform = `perspective(${PERSPECTIVE}px) scale(${lift.toFixed(4)}) rotateX(${(tiltX * 0.52).toFixed(2)}deg) rotateY(${(tiltY * 0.52).toFixed(2)}deg)`
          if (!isDetailOrBig) {
            hostEl?.style.setProperty('--mx', `${(lightX * 100).toFixed(1)}%`)
            hostEl?.style.setProperty('--my', `${(lightY * 100).toFixed(1)}%`)
          }
        } else if (tiltEl.style.transform) {
          tiltEl.style.transform = ''
        }
      }

      while (pts.length && (now - pts[pts.length - 1].t) / 1000 >= LINGER) pts.pop()
      let burstActive = false
      let bX = 0, bY = 0, bR = 0, bW = 0
      if (burst) {
        const bk = (now - burst.start) / 880
        if (bk >= 1) burst = null
        else if (bk >= 0) {
          burstActive = true
          bX = burst.x
          bY = burst.y
          bR = Math.sin(bk * Math.PI * 0.5) * 1.45
          bW = (1 - bk * bk) * 0.92
        } else {
          burstActive = true
        }
      }

      const hasDither = pts.length > 0 || burstActive
      const needsGl = !glFailed && (holo || hasDither)
      const settlingTilt = domMoving

      if (!needsGl) {
        if (wasDrawing && slot?.gl) {
          slot.gl.clearColor(0, 0, 0, 0)
          slot.gl.clear(slot.gl.COLOR_BUFFER_BIT)
          wasDrawing = false
        }
        if (!holo && slot && !inside) {
          parkFxSlot(slot)
          slot = null
        }
        return settlingTilt
      }

      const imgEl = imgRef.current
      if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) return true
      const s = ensureSlot()
      if (!s) return settlingTilt
      const gl = s.gl

      if (!s.tex || s.texSrc !== src) {
        if (decodePending) return true
        if (typeof createImageBitmap === 'function') {
          decodePending = true
          createImageBitmap(imgEl)
            .then(bmp => {
              decodePending = false
              if (!slot || slot !== s || !s.gl || s.gl.isContextLost()) {
                bmp.close?.()
                return
              }
              if (!s.tex) s.tex = s.gl.createTexture()
              s.gl.bindTexture(s.gl.TEXTURE_2D, s.tex)
              s.gl.pixelStorei(s.gl.UNPACK_FLIP_Y_WEBGL, false)
              s.gl.texParameteri(s.gl.TEXTURE_2D, s.gl.TEXTURE_WRAP_S, s.gl.CLAMP_TO_EDGE)
              s.gl.texParameteri(s.gl.TEXTURE_2D, s.gl.TEXTURE_WRAP_T, s.gl.CLAMP_TO_EDGE)
              s.gl.texParameteri(s.gl.TEXTURE_2D, s.gl.TEXTURE_MIN_FILTER, s.gl.LINEAR)
              s.gl.texParameteri(s.gl.TEXTURE_2D, s.gl.TEXTURE_MAG_FILTER, s.gl.LINEAR)
              s.gl.texImage2D(s.gl.TEXTURE_2D, 0, s.gl.RGBA, s.gl.RGBA, s.gl.UNSIGNED_BYTE, bmp)
              bmp.close?.()
              s.texSrc = src
              wakeFxEngine()
            })
            .catch(() => {
              decodePending = false
            })
          return true
        }
        if (!s.tex) s.tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, s.tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEl)
        s.texSrc = src
      }

      const cssW = Math.max(1, wrapRect?.width || 168)
      const ratio = (pw / ph) / (imgEl.naturalWidth / Math.max(imgEl.naturalHeight, 1))
      const sx = contain ? (ratio > 1 ? ratio : 1) : (ratio > 1 ? 1 : ratio)
      const sy = contain ? (ratio > 1 ? 1 : 1 / ratio) : (ratio > 1 ? 1 / ratio : 1)
      const pal = DITHER_PALETTES[tier >= 0 ? tier : 'locked'] || DITHER_PALETTES.locked
      const rad = isDetailOrBig ? 0.16 : 0.21

      segBuf.fill(0)
      for (let i = 0; i < pts.length && i < 6; i++) {
        const age = Math.max(0, (now - pts[i].t) / 1000)
        const str = Math.max(0, 1 - age / LINGER)
        segBuf[i * 4] = pts[i].x
        segBuf[i * 4 + 1] = pts[i].y
        segBuf[i * 4 + 2] = str
        segBuf[i * 4 + 3] = rad
      }

      gl.viewport(0, 0, pw, ph)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(s.prog)
      gl.bindVertexArray(s.vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, s.tex)
      const u = s.u
      gl.uniform1i(u.uTex, 0)
      gl.uniform2f(u.uRes, pw, ph)
      gl.uniform2f(u.uScale, sx, sy)
      gl.uniform1f(u.uCell, Math.max(2, Math.round(2 * dpr)))
      gl.uniform1i(u.uTier, tier)
      gl.uniform1i(u.uGrade, pregraded ? 1 : tier)
      gl.uniform1f(u.uHolo, holo ? 1 : 0)
      gl.uniform1f(u.uHover, hoverAmt)
      gl.uniform2f(u.uTilt, (tiltX * Math.PI) / 180, (tiltY * Math.PI) / 180)
      gl.uniform2f(u.uLight, lightX, lightY)
      gl.uniform1f(u.uDistance, PERSPECTIVE / cssW)
      gl.uniform3fv(u.uInk, pal[0])
      gl.uniform3fv(u.uPaper, pal[1])
      gl.uniform3fv(u.uRim, pal[2])
      gl.uniform4fv(u['uSegs[0]'], segBuf)
      gl.uniform4f(u.uBurst, bX, bY, bR, bW)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      wasDrawing = true
      if (holo) setReady(r => (r ? r : true))
      return holo || hasDither || settlingTilt
    }

    const scrollEl = wrap.closest('.tr-page, .tr-dlg, .tr-away-shell')
    const dropRects = () => {
      hostRect = null
      wrapRect = null
    }
    FX_ENGINE.tasks.add(step)
    scrollEl?.addEventListener('scroll', dropRects, { passive: true })
    hostEl?.addEventListener('pointerenter', onEnter, { passive: true })
    hostEl?.addEventListener('pointermove', onMove, { passive: true })
    hostEl?.addEventListener('pointerleave', onLeave, { passive: true })
    hostEl?.addEventListener('pointerdown', onDown, { passive: true })

    let ro, io
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        refreshRects()
        if (holo) wakeFxEngine()
      })
      ro.observe(wrap)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(es => {
        visible = es.some(e => e.isIntersecting)
        if (!visible && slot) {
          parkFxSlot(slot)
          slot = null
          setReady(false)
        } else if (visible && (holo || burst)) {
          refreshRects()
          wakeFxEngine()
        }
      })
      io.observe(wrap)
    }
    if (holo || burst) wakeFxEngine()

    return () => {
      FX_ENGINE.tasks.delete(step)
      ro?.disconnect()
      io?.disconnect()
      scrollEl?.removeEventListener('scroll', dropRects)
      hostEl?.removeEventListener('pointerenter', onEnter)
      hostEl?.removeEventListener('pointermove', onMove)
      hostEl?.removeEventListener('pointerleave', onLeave)
      hostEl?.removeEventListener('pointerdown', onDown)
      if (slot) parkFxSlot(slot)
      if (tiltEl) tiltEl.style.transform = ''
    }
  }, [src, tier, holo, contain, burstOnMount, pregraded, dither, seed])

  return h('div', {
    ref: wrapRef,
    className: 'tr-fx-wrap',
    'data-ready': ready ? 'true' : undefined,
    'aria-hidden': true
  })
}

function Art({ id, glyph, secret, slice, className, tier = -1, fx = false, contain = false, burstOnMount = false }) {
  const { ids, ready } = useArtIndex()
  const ref = useRef(null)
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const filterId = `tr-grade-${rawId}`
  const foilId = `tr-foil-${rawId}`
  const [loadedSrc, setLoadedSrc] = useState(null)
  const [oly, setOly] = useState(null)
  const near = useNearViewport(ref)
  const has = !secret && ids.has(id)
  // Only ids the backend lists as having real art, and only once the picture is close to the screen.
  const q = useQuery({
    queryKey: [ID, KEY_ART, id],
    queryFn: () => rest(`/art/${encodeURIComponent(id)}`),
    enabled: has && near,
    staleTime: Infinity,
    gcTime: ART_GC_MS,
    retry: 0
  })
  const grade = !secret && Number.isInteger(tier) && tier >= 0 && tier < TIER_ART_MATRICES.length ? tier : -1
  const real = (has && q.data?.uri) || null
  useEffect(() => {
    if (grade !== 4 || !real) return undefined
    let dead = false
    olympianUrl(id, real).then(url => { if (!dead) setOly({ from: real, url }) }).catch(() => { if (!dead) setOly({ from: real, url: null }) })
    return () => { dead = true }
  }, [grade, real, id])
  const finished = grade === 4 && oly?.from === real ? oly.url : null
  // The engraved drawing is only for a trophy that truly has no picture. While the list of pictures, the picture
  // itself or its Olympian finish is still on the way, the tile stays a quiet blank: nothing flashes and is replaced.
  const waiting = !secret && (!ready || (has && !real && q.status !== 'error') || (grade === 4 && !!real && oly?.from !== real))
  const src = waiting ? BLANK_URI : finished || real || placeholderUri(id, secret ? 'star' : glyph, slice)
  const foilMatrix = TIER_FOIL_MATRICES[grade]
  const holo = grade >= 3
  const shown = !waiting && loadedSrc === src
  return h(Fragment, null,
    grade >= 0 && h('svg', { width: 0, height: 0, 'aria-hidden': true, focusable: false, style: { position: 'absolute' } },
      h('defs', null,
        h('filter', { id: filterId, colorInterpolationFilters: 'sRGB' }, h('feColorMatrix', { type: 'matrix', values: TIER_ART_MATRICES[grade] })),
        foilMatrix && h('filter', { id: foilId, colorInterpolationFilters: 'sRGB' }, h('feColorMatrix', { type: 'matrix', values: foilMatrix }))
      )
    ),
    h('img', {
      ref,
      className: cn('tr-art', secret && 'tr-art-secret', waiting && 'tr-art-wait', className),
      src,
      alt: '',
      draggable: false,
      decoding: 'async',
      onLoad: () => setLoadedSrc(src),
      style: grade >= 0 && shown && !finished ? { filter: `url(#${filterId})` } : undefined,
      'data-art-tier': grade >= 0 ? grade : undefined
    }),
    foilMatrix && shown && h('img', {
      className: 'tr-art-foil',
      'data-foil-tier': grade,
      src,
      alt: '',
      'aria-hidden': true,
      draggable: false,
      style: { filter: `url(#${foilId})` }
    }),
    fx && !secret && shown && h(TrophyFxCanvas, {
      src,
      imgRef: ref,
      tier: grade,
      holo,
      contain,
      burstOnMount,
      pregraded: !!finished,
      seed: hash(id)
    })
  )
}

// ---------------------------------------------------------------------------
// Sound: Hermes Synth, made in code (square lead, triangle bass, noise wing sweep)
// ---------------------------------------------------------------------------

const N = {
  D2: 73.42,
  D3: 146.83,
  D5: 587.33,
  Fs5: 739.99,
  A5: 880,
  D6: 1174.66,
  Fs6: 1479.98,
  A6: 1760
}

function note(ctx, dst, at, f, d, type, g, opts = {}) {
  const o = ctx.createOscillator()
  const e = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, at)
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, at + d)
  e.gain.setValueAtTime(0, at)
  e.gain.linearRampToValueAtTime(g, at + 0.008)
  e.gain.exponentialRampToValueAtTime(0.0008, at + d)
  o.connect(e)
  e.connect(dst)
  o.start(at)
  o.stop(at + d + 0.05)
}

function swoosh(ctx, dst, at, d, g) {
  const len = Math.floor(ctx.sampleRate * d)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const a = buf.getChannelData(0)
  for (let i = 0; i < len; i++) a[i] = Math.random() * 2 - 1
  const s = ctx.createBufferSource()
  s.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 3
  f.frequency.setValueAtTime(400, at)
  f.frequency.exponentialRampToValueAtTime(5200, at + d)
  const e = ctx.createGain()
  e.gain.setValueAtTime(0, at)
  e.gain.linearRampToValueAtTime(g, at + d * 0.4)
  e.gain.linearRampToValueAtTime(0, at + d)
  s.connect(f)
  f.connect(e)
  e.connect(dst)
  s.start(at)
}

const JINGLES = [
  (c, d, at) => note(c, d, at, N.D5, 0.16, 'square', 0.16),
  (c, d, at) => [N.D5, N.A5].forEach((f, i) => note(c, d, at + i * 0.09, f, 0.2, 'square', 0.15)),
  (c, d, at) => {
    ;[N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => note(c, d, at + i * 0.08, f, 0.26, 'square', 0.14))
    note(c, d, at, N.D3, 0.5, 'triangle', 0.3)
  },
  (c, d, at) => {
    ;[N.D5, N.Fs5, N.A5, N.D6, N.Fs6, N.A6].forEach((f, i) => note(c, d, at + i * 0.07, f, 0.3, 'square', 0.12))
    note(c, d, at, N.D3, 0.9, 'triangle', 0.3)
    swoosh(c, d, at + 0.1, 0.55, 0.1)
    ;[N.A6, N.Fs6].forEach((f, i) => note(c, d, at + 0.5 + i * 0.01, f * 1.005, 0.9, 'sawtooth', 0.03))
  },
  (c, d, at) => {
    swoosh(c, d, at, 0.55, 0.14)
    ;[N.D5, N.D5, N.A5].forEach((f, i) => note(c, d, at + 0.45 + i * 0.12, f, 0.14, 'square', 0.15))
    ;[N.Fs5, N.A5, N.D6].forEach((f, i) => note(c, d, at + 0.85 + i * 0.1, f, 1.3, 'square', 0.12))
    note(c, d, at + 0.85, N.D3, 1.5, 'triangle', 0.34)
    note(c, d, at + 0.85, N.D2, 1.6, 'triangle', 0.3)
    ;[N.D6, N.Fs6, N.A6].forEach((f, i) => note(c, d, at + 1.1 + i * 0.06, f, 1.2, 'sawtooth', 0.028))
    note(c, d, at + 0.85, N.A6, 1.4, 'triangle', 0.08, { slideTo: N.A6 * 2 })
  }
]

function audio() {
  if (!R.ac) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!C) return null
    R.ac = new C()
  }
  return R.ac
}

function resumeAudio() {
  guard(() => {
    const ac = audio()
    if (ac && ac.state === 'suspended') void ac.resume()
  })
}

function playSound(tier, force) {
  const s = $settings.get()
  if (!s.sound && !force) return
  guard(() => {
    const ac = audio()
    if (!ac) return
    if (ac.state === 'suspended') void ac.resume()
    const m = ac.createGain()
    m.gain.value = Math.max(0, Math.min(1, s.volume))
    m.connect(ac.destination)
    JINGLES[Math.max(0, Math.min(4, tier))](ac, m, ac.currentTime + 0.02)
  })
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// The unlock row and its broadcast carry the same `at`, so this key matches an unlock however it reached this window.
const dkey = u => `${u.id}:${u.tier}:${u.at || 0}`

function unlockPayload(st, u) {
  const c = st.catalog?.find(x => x.id === u.id) || {}
  const pr = st.progress?.[u.id] || {}
  return { id: u.id, tier: u.tier, at: u.at || Math.floor(Date.now() / 1000), name: c.name || u.id, description: c.description || '', category: c.category || '', glyph: c.glyph || 'star', how: c.how || '', value: pr.value, next: pr.next }
}

const awayScope = () => String(guard(() => host.state.profile.get()) || 'default')
const awayStorageKey = () => `away-collection:${awayScope()}`

function awaySnapshot(st, list) {
  const catalog = new Map((st.catalog || []).map(c => [c.id, c]))
  const entries = new Map()
  for (const u of Array.isArray(list) ? list.slice(0, 500) : []) {
    const c = catalog.get(u?.id)
    const pr = st.progress?.[u?.id]
    if (!c || !Number.isInteger(u.tier) || u.tier < 0 || u.tier > 4 || !(pr?.tier >= u.tier)) continue
    if ((entries.get(u.id)?.tier ?? -1) > u.tier) continue
    entries.set(u.id, {
      id: u.id, tier: u.tier, state: 'unlocked',
      at: Number.isFinite(u.at) ? u.at : pr.unlocked_at || 0,
      value: Number.isFinite(u.value) ? u.value : pr.value || 0,
      unlocked_at: u.unlocked_at || pr.unlocked_at || u.at || null,
      first_tier: pr.first_tier ?? u.tier,
      next: c.thresholds?.[u.tier + 1] ?? null
    })
  }
  return [...entries.values()]
}

function rememberAway(entries) {
  if (!entries.length) return
  R.lastAway = { scope: awayScope(), entries }
  guard(() => R.ctx.storage.set(awayStorageKey(), { version: 1, entries }))
}

function recalledAway(st) {
  const saved = guard(() => R.ctx.storage.get(awayStorageKey(), null))
  const list = saved?.version === 1 ? saved.entries : R.lastAway?.scope === awayScope() ? R.lastAway.entries : []
  return awaySnapshot(st, list)
}

function recentTrophies(st) {
  const entries = Object.entries(st.progress || {})
    .filter(([, pr]) => pr.tier >= 0)
    .sort((a, b) => (b[1].unlocked_at || 0) - (a[1].unlocked_at || 0))
    .slice(0, 3)
    .map(([id, pr]) => ({ ...pr, id, at: pr.unlocked_at }))
  return awaySnapshot(st, entries)
}

function openAway(entries, markSeen = false, recent = false) {
  const st = currentState()
  const snapshot = awaySnapshot(st || {}, entries)
  const catalog = new Map((st?.catalog || []).map(c => [c.id, c]))
  $awayView.set({ key: ++R.awayRequest, scope: awayScope(), markSeen, recent, items: snapshot.map(pr => ({ c: catalog.get(pr.id), pr })) })
  if ((!Dialog || !DialogContent) && !$awayHosts.get().length) host.navigate(ROUTE)
}

function summaryPayload(st, list, replayed) {
  const entries = awaySnapshot(st, list)
  if (!entries.length) return null
  if (!replayed) rememberAway(entries)
  const best = entries.reduce((a, b) => (b.tier > a.tier ? b : a))
  const c = st.catalog?.find(x => x.id === best.id) || {}
  return { id: best.id, tier: best.tier, at: Date.now(), name: c.name || best.id, description: c.description || '', category: c.category || '', glyph: c.glyph || 'star', how: c.how || '', summary: true, replay: !!replayed, count: entries.length, entries }
}

// Unlocks written by other processes (cron, hermes chat) never broadcast to this window; they only show
// up in /state.unseen. Surface the ones this window has not delivered yet: one or two as cards, more as the away summary.
function syncUnseen(st) {
  if (!R.booted) return
  const fresh = (st.unseen || []).filter(u => !R.delivered.has(dkey(u)))
  if (!fresh.length) return
  for (const u of fresh) R.delivered.add(dkey(u))
  if (fresh.length > 2) deliver(summaryPayload(st, fresh, false))
  else for (const u of fresh) deliver(unlockPayload(st, u), { fromSync: true })
}

async function fetchState() {
  const st = await rest('/state')
  guard(() => syncUnseen(st))
  return st
}

function useTrophyState() {
  return useQuery({
    queryKey: KEY_STATE,
    queryFn: fetchState,
    refetchInterval: 60000,
    staleTime: 15000,
    retry: 1
  })
}

const currentState = () => queryClient.getQueryData(KEY_STATE)
const catalogEntry = id => currentState()?.catalog?.find(c => c.id === id)

function patchStateForUnlock(p) {
  queryClient.setQueryData(KEY_STATE, old => {
    if (!old) return old
    const prev = old.progress?.[p.id] || {}
    const was = prev.tier ?? -1
    const by = [...(old.totals?.by_tier || [0, 0, 0, 0, 0])]
    if (was >= 0) by[was] = Math.max(0, by[was] - 1)
    by[p.tier] = (by[p.tier] || 0) + 1
    return {
      ...old,
      progress: {
        ...old.progress,
        [p.id]: {
          ...prev,
          value: p.value ?? prev.value ?? 0,
          tier: p.tier,
          state: 'unlocked',
          first_tier: prev.first_tier >= 0 ? prev.first_tier : p.tier,
          unlocked_at: prev.unlocked_at || p.at,
          next: p.next ?? prev.next
        }
      },
      totals: { ...old.totals, unlocked: (old.totals?.unlocked || 0) + (was < 0 ? 1 : 0), by_tier: by },
      unseen: [...(old.unseen || []), { id: p.id, tier: p.tier, at: p.at }]
    }
  })
}

// ---------------------------------------------------------------------------
// Delivery: one event in, in-app pop-up + sound + window glow + OS notification out
// ---------------------------------------------------------------------------

function lookFor(tier, s) {
  if (s.style && s.style !== 'auto') return s.style
  return tier <= 1 ? 'tile' : tier <= 3 ? 'podium' : 'card'
}

const hasFocus = () => guard(() => document.hasFocus()) !== false

// setAppBadge / clearAppBadge return promises that can reject (no taskbar, no permission): never let that escape.
function setBadge(n) {
  const quiet = pr => guard(() => pr?.catch?.(() => {}))
  guard(() => {
    if (!$settings.get().onWindow || n <= 0 || !navigator.setAppBadge) {
      if (navigator.clearAppBadge) quiet(navigator.clearAppBadge())
      return
    }
    quiet(navigator.setAppBadge(n))
  })
}

function flash() {
  $flash.set(Date.now())
}

async function osNotify(p) {
  if (!R.ctx?.os?.notify) return
  let icon
  if (!p.summary) {
    try {
      const a = await artFetch(p.id)
      if (a?.icon_path) icon = a.icon_path
    } catch {
      /* no real art yet: the notification goes out without a picture */
    }
  }
  guard(() =>
    R.ctx.os.notify({
      title: p.summary ? t('osAway', p.count) : t('osTitle', p.name, TIERS[p.tier]?.name || ''),
      body: p.summary ? t('popAwayBest', p.name) : p.description || p.how || '',
      silent: true,
      icon,
      activate: ROUTE,
      onActivate: () => p.summary ? openAway(p.entries) : openTrophy(p.id)
    })
  )
}

function present(p, opts = {}) {
  const s = $settings.get()
  if (s.onWindow && !opts.replay) {
    flash()
  }
  if (s.os && !opts.replay && !hasFocus()) void osNotify(p)
  if (s.inApp || opts.replay) {
    R.queue.push(p)
    pump()
  } else {
    playSound(p.tier)
    if (!opts.replay) markSeen(p)
  }
}

function deliver(p, opts = {}) {
  if (!p || !p.id) return
  const s = $settings.get()
  const key = `${p.id}:${p.tier}:${p.at || 0}:${p.summary ? 's' : ''}`
  if (!opts.replay) {
    if (R.seen.has(key)) return
    R.seen.add(key)
    if (!p.summary) {
      // Already surfaced (for example by a refetch that beat the broadcast): do not show it twice.
      if (R.delivered.has(dkey(p)) && !opts.fromSync) return
      R.delivered.add(dkey(p))
    }
    if (p.tier < s.minTier && !p.summary) {
      markSeen(p)
      return
    }
    if (s.quiet && !p.summary && guard(() => host.state.busy.get())) {
      R.held.push(p)
      return
    }
  }
  present(p, opts)
}

function releaseHeld() {
  const list = R.held.splice(0)
  for (const p of list) present(p)
}

function markSeen(p) {
  if (p.summary) void post('/seen', { ids: (p.entries || []).map(u => u.id) })
  else void post('/seen', { ids: [p.id] })
}

// Pop-up hosts are chosen from the ones actually mounted, nearest to the wanted place first.
const OWNER_ORDER = {
  'top-center': ['title', 'status-right', 'status-left'],
  'top-right': ['title', 'status-right', 'status-left'],
  'top-left': ['title', 'status-left', 'status-right'],
  'bottom-right': ['status-right', 'status-left', 'title'],
  'bottom-left': ['status-left', 'status-right', 'title']
}
const ownerFor = (place, anchors) => (OWNER_ORDER[place] || OWNER_ORDER['top-center']).find(w => anchors[w]?.length) || null

// No host to draw the card (or it never mounted): a plain toast keeps the trophy from vanishing.
function toastFallback(p) {
  playSound(p.tier)
  guard(() =>
    host.notify({
      kind: 'info',
      title: p.summary ? t('popAway') : p.name,
      message: p.summary ? t('popAwayName', p.count) : `${TIERS[p.tier]?.name || ''}: ${p.how || p.description || ''}`,
      icon: 'star-full',
      accentColor: TIERS[p.tier]?.color
    })
  )
  if (!p.replay) markSeen(p)
}

function pump() {
  if ($current.get()) return
  const p = R.queue.shift()
  if (!p) return
  const s = $settings.get()
  if (!ownerFor(s.place, $anchors.get())) {
    toastFallback(p)
    R.ctx.setTimeout(pump, 450)
    return
  }
  R.n += 1
  const cur = { key: R.n, p, look: p.summary ? 'podium' : lookFor(p.tier, s), place: s.place }
  $current.set(cur)
  // The card should mount at once; if it does not (its host unmounted meanwhile), fall back to a toast.
  R.watch?.()
  R.watch = R.ctx.setTimeout(() => {
    if ($current.get()?.key === cur.key && R.shown !== cur.key) {
      $current.set(null)
      toastFallback(p)
      pump()
    }
  }, 1500)
}

// Called by the card that actually mounted: sound, "seen" and the dismiss timer start here, not in pump().
function cardShown(cur) {
  if (R.shown === cur.key) return
  R.shown = cur.key
  R.watch?.()
  playSound(cur.p.tier)
  if (!cur.p.replay) markSeen(cur.p)
  R.timer?.()
  R.timer = R.ctx.setTimeout(dismiss, POP_MS[Math.max(0, Math.min(4, cur.p.tier))])
}

function dismiss() {
  R.timer?.()
  R.timer = null
  if (!$current.get()) return
  $current.set(null)
  R.ctx.setTimeout(pump, 450)
}

// After a reset nothing queued, held or on screen refers to data that still exists.
function resetRuntime() {
  R.awayEpoch++
  R.awayRequest++
  R.lastAway = null
  $awayView.set(null)
  guard(() => R.ctx.storage.remove(awayStorageKey()))
  R.seen.clear()
  R.delivered.clear()
  R.queue.length = 0
  R.held.length = 0
  R.timer?.()
  R.timer = null
  R.watch?.()
  R.watch = null
  $current.set(null)
  setBadge(0)
}

// Straight to this plugin's own settings page (sound, pop-ups, data), not the top of Settings.
function openSettings() {
  guard(() => host.navigate(guard(() => sdk.pluginSettingsHref?.(ID)) || '/settings'))
}

function openTrophy(id) {
  if (id) $focus.set(id)
  guard(() => host.navigate(ROUTE))
}

function onUnlockEvent(ev) {
  const p = ev?.payload || ev
  if (!p || !p.id) return
  patchStateForUnlock(p)
  void queryClient.invalidateQueries({ queryKey: KEY_STATE })
  deliver(p)
}

async function awaySummary(force) {
  const ctx = R.ctx
  const scope = awayScope()
  const epoch = R.awayEpoch
  const request = force ? ++R.awayRequest : null
  try {
    const st = force ? await ctx.rest('/state') : await queryClient.fetchQuery({ queryKey: KEY_STATE, queryFn: fetchState, staleTime: 0 })
    if (ctx !== R.ctx || scope !== awayScope() || epoch !== R.awayEpoch || (force && request !== R.awayRequest)) return
    const list = awaySnapshot(st, st.unseen)
    if (force) {
      queryClient.setQueryData(KEY_STATE, st)
      if (list.length) rememberAway(list)
      openAway(list.length ? list : recalledAway(st), list.length > 0)
    } else {
      for (const u of list) R.delivered.add(dkey(u))
      if (list.length) deliver(summaryPayload(st, list, false))
    }
  } catch {
    if (force && ctx === R.ctx && scope === awayScope() && epoch === R.awayEpoch && request === R.awayRequest) guard(() => host.notify({ kind: 'error', message: t('awayFailed') }))
  } finally {
    if (ctx === R.ctx && scope === awayScope() && epoch === R.awayEpoch) R.booted = true
  }
}

function replay(id, tier) {
  const c = catalogEntry(id)
  if (!c) return
  const pr = currentState()?.progress?.[id] || {}
  const tr = tier ?? Math.max(0, pr.tier ?? 0)
  deliver(
    {
      id,
      tier: tr,
      at: Date.now(),
      name: c.name,
      description: c.description,
      category: c.category,
      glyph: c.glyph,
      how: c.how,
      value: pr.value,
      next: pr.next,
      replay: true
    },
    { replay: true }
  )
}

function testTier(tier) {
  const st = currentState()
  const pick =
    st?.catalog?.find(c => (st.progress?.[c.id]?.tier ?? -1) >= 0 && c.state !== 'secret') || st?.catalog?.[0] || null
  const base = pick || { id: 'sample', name: 'Let Him Cook', description: '', category: 'Agent Autonomy', glyph: 'flame', how: 'Tool calls in one session' }
  deliver(
    {
      id: base.id,
      tier,
      at: Date.now(),
      name: base.name,
      description: base.description,
      category: base.category,
      glyph: base.glyph,
      how: base.how,
      replay: true
    },
    { replay: true }
  )
}

// ---------------------------------------------------------------------------
// CSS (theme variables for chrome; brand colours only on trophy art and cards)
// ---------------------------------------------------------------------------

const CSS = `
@property --tr-spin{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes tr-orbit{to{--tr-spin:360deg}}
@keyframes tr-bar-flow{to{background-position:200% 0}}
@keyframes tr-bayer-in{from{mask-position:0 -690px;opacity:.82;transform:translateY(8px) scale(.972)}18%{opacity:1}to{mask-position:0 0;opacity:1;transform:none}}
@keyframes tr-bayer-out{from{mask-position:0 0;opacity:1;transform:none}to{mask-position:0 -690px;opacity:.2;transform:translateY(5px) scale(.98)}}
.tr-dialog.tr-entering,.tr-inline.tr-entering{mask-image:${BAYER_WIPE_URI};mask-size:16px 1280px;mask-repeat:repeat-x;mask-position:0 0;animation:tr-bayer-in .24s cubic-bezier(.22,1,.36,1) both}
.tr-dialog.tr-exiting,.tr-inline.tr-exiting{pointer-events:none;mask-image:${BAYER_WIPE_URI};mask-size:16px 1280px;mask-repeat:repeat-x;mask-position:0 0;animation:tr-bayer-out .18s cubic-bezier(.4,0,1,1) both}
.tr-page{--tr-plaque-base:#101228;--tr-display:${DISPLAY_FONT};container-type:inline-size;container-name:trpage;height:100%;overflow:auto;color:var(--ui-text-primary,inherit);font-size:12px;line-height:1.45;scrollbar-width:thin;scrollbar-color:var(--ui-stroke-secondary,#8884) transparent}
.tr-body{padding:20px 24px 28px}
.tr-page>.tr-empty{padding:60px 24px}
.tr-page *{box-sizing:border-box}
.tr-head{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:16px 28px;padding:2px 0 14px}
.tr-overview{display:flex;align-items:center;gap:16px;min-width:0}
.tr-meander{height:16px;margin:0 0 4px;background:linear-gradient(90deg,transparent,var(--ui-accent,#8585F9) 9%,var(--ui-text-secondary,#C5CADB) 32%,#F0CA67 50%,var(--ui-text-secondary,#C5CADB) 68%,var(--ui-accent,#8585F9) 91%,transparent);opacity:.82;mask-image:${FRIEZE_URI};mask-size:24px 16px;mask-repeat:repeat-x;mask-position:center}
.tr-ring{position:relative;width:108px;height:108px;flex:none;border-radius:50%;background:radial-gradient(circle at 32% 26%,#1A1F4A 0%,#0C0E24 68%,#080A1A 100%);box-shadow:0 8px 20px -6px rgba(9,11,28,.46),0 0 18px -6px rgba(133,133,249,.32),inset 0 1px 0 rgba(255,255,255,.14);transition:transform .24s cubic-bezier(.22,1,.36,1),box-shadow .24s}
.tr-ring:hover{transform:scale(1.035);box-shadow:0 12px 26px -6px rgba(9,11,28,.58),0 0 22px -4px rgba(240,202,103,.34),inset 0 1px 0 rgba(255,255,255,.2)}
.tr-ring:before{content:'';position:absolute;inset:30px;border-radius:50%;background:#8585F9;opacity:.2;mask-image:${BAYER_TILE_URI},radial-gradient(circle,#000 18%,transparent 72%);mask-size:8px 8px,100% 100%;mask-repeat:repeat,no-repeat;mask-composite:intersect;pointer-events:none}
.tr-ring svg{position:relative;display:block;width:100%;height:100%}
.tr-ring-arc{transform:rotate(-90deg);transform-origin:60px 60px}
.tr-ring-progress{filter:drop-shadow(0 0 3px rgba(143,227,255,.6))}
.tr-ring-beacon{filter:drop-shadow(0 0 4px #E4D6FF)}
.tr-leaf{fill:rgba(197,202,219,.07);stroke:rgba(197,202,219,.3);stroke-width:.6;transition:fill .4s,stroke .4s}
.tr-leaf[data-lit]{fill:url(#tr-laurel-grad);stroke:rgba(255,244,201,.55);filter:drop-shadow(0 0 1.5px rgba(240,202,103,.5))}
.tr-ring-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;color:#FAFAFF}
.tr-ring-label strong{font:700 19px/1 var(--tr-display);letter-spacing:.01em;font-variant-numeric:tabular-nums;text-shadow:0 1px 8px rgba(133,133,249,.45)}
.tr-ring-label small{margin-top:3px;font:600 6px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:#A5ADCE}
.tr-hero{min-width:0}
.tr-wordmark{font:700 36px/.9 var(--tr-display);letter-spacing:.012em;text-transform:uppercase;margin:0 0 8px;white-space:nowrap}
.tr-h1{font-size:13px;font-weight:500;margin:0;line-height:1.2;color:var(--ui-text-secondary,#aaa);font-variant-numeric:tabular-nums}
.tr-eyebrow{font:500 10px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--ui-text-tertiary,#888);margin-bottom:6px}
.tr-pips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-width:0;gap:8px}
.tr-tier-stat{position:relative;min-width:0;padding:10px 11px 9px;border:1px solid color-mix(in srgb,var(--c) 36%,#252952);border-radius:10px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 7px),linear-gradient(155deg,color-mix(in srgb,var(--c) 14%,#121531) 0%,#0C0E22 65%,color-mix(in srgb,var(--c) 9%,#10132C) 100%);box-shadow:0 6px 16px -6px rgba(9,11,28,.38),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden;cursor:pointer;text-align:left;color:#F3F4FA;font:inherit;transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .22s,border-color .2s}
.tr-tier-stat:before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--c),transparent);opacity:.92}
.tr-tier-stat:after{content:'';position:absolute;inset:0;background:var(--c);opacity:.24;mask-image:${BAYER_TILE_URI},linear-gradient(132deg,transparent 42%,#000 100%);mask-size:8px 8px,100% 100%;mask-repeat:repeat,no-repeat;mask-composite:intersect;pointer-events:none;transition:opacity .22s}
.tr-tier-sheen{position:absolute;inset:0;background:linear-gradient(112deg,transparent 26%,color-mix(in srgb,var(--c) 32%,rgba(255,255,255,.28)) 50%,transparent 74%);transform:translateX(-130%);pointer-events:none;z-index:1}
.tr-tier-stat:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--c) 78%,#fff);box-shadow:0 12px 24px -8px rgba(8,10,26,.55),0 0 16px -5px color-mix(in srgb,var(--c) 55%,transparent),inset 0 1px 0 rgba(255,255,255,.16)}
.tr-tier-stat:hover:after{opacity:.38}
.tr-tier-stat:hover .tr-tier-sheen{transform:translateX(130%);transition:transform .62s cubic-bezier(.22,1,.36,1)}
.tr-tier-stat[aria-pressed='true']{transform:translateY(-2px);border-color:var(--c);box-shadow:0 12px 26px -6px rgba(8,10,26,.6),0 0 0 1px var(--c),0 0 20px -4px color-mix(in srgb,var(--c) 68%,transparent)}
.tr-tier-stat:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:2px}
.tr-tier-top{position:relative;z-index:2;display:flex;align-items:center;gap:8px}
.tr-tier-emblem{width:30px;height:30px;flex:none;display:grid;place-items:center;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 62%,rgba(255,255,255,.18));background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--c) 28%,#1c2046),#0B0D20 85%);box-shadow:0 2px 8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16);border-radius:8px;transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
.tr-tier-stat:hover .tr-tier-emblem{transform:scale(1.06);box-shadow:0 0 12px color-mix(in srgb,var(--c) 48%,transparent)}
.tr-tier-emblem svg{width:16px;height:16px}
.tr-tier-count{display:block;color:#FAFAFF;font:700 25px/1 var(--tr-display);letter-spacing:.01em;font-variant-numeric:tabular-nums}
.tr-tier-rank{margin-left:auto;align-self:flex-start;font:600 8px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.12em;color:color-mix(in srgb,var(--c) 76%,#9ca3c9);opacity:.82}
.tr-tier-foot{position:relative;z-index:2;margin-top:7px;display:flex;align-items:center;justify-content:space-between;gap:6px}
.tr-tier-label{display:block;font:600 10px/1.1 var(--font-mono,ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb,var(--c) 82%,#E4E7F5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-tier-meter{position:relative;z-index:2;height:3px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden}
.tr-tier-meter i{display:block;height:100%;border-radius:2px;background:var(--c);box-shadow:0 0 8px var(--c);transition:width .35s cubic-bezier(.22,1,.36,1)}
.tr-tier-stat[data-tier='0']{--c:#DA8A55}
.tr-tier-stat[data-tier='1']{--c:#D4DCEF}
.tr-tier-stat[data-tier='2']{--c:#F0CA67}
.tr-tier-stat[data-tier='3']{border:1px solid transparent;background:repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 7px) padding-box,linear-gradient(148deg,#11293E 0%,#0B1126 62%,#102338 100%) padding-box,conic-gradient(from var(--tr-spin),#1d506b,#8fe3ff 22%,#ffffff 30%,#9cb2ff 44%,#173f57 64%,#8fe3ff 86%,#1d506b) border-box;animation:tr-orbit 8.5s linear infinite}
.tr-tier-stat[data-tier='3']:before{height:2.5px;background:linear-gradient(90deg,#38bdf8,#8fe3ff,#f0fcff)}
.tr-tier-stat[data-tier='3'] .tr-tier-emblem{color:#dff9ff;background:radial-gradient(circle at 30% 25%,#1b4b66,#0b1929);border-color:#9be7ff;box-shadow:0 0 12px rgba(143,227,255,.42)}
.tr-tier-stat[data-tier='4']{border:1px solid transparent;background:repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 7px) padding-box,linear-gradient(148deg,#1E1846 0%,#0E1028 58%,#141B42 100%) padding-box,conic-gradient(from var(--tr-spin),${IRIS}) border-box;box-shadow:0 8px 20px -6px rgba(14,12,32,.5),0 0 18px -6px rgba(183,156,255,.45);animation:tr-orbit 6.6s linear infinite}
.tr-tier-stat[data-tier='4']:before{height:2.5px;background:linear-gradient(90deg,${IRIS})}
.tr-tier-stat[data-tier='4'] .tr-tier-emblem{color:#fff;background:radial-gradient(circle at 30% 25%,#4a3f8f,#151433);border-color:#d9ccff;box-shadow:0 0 14px rgba(183,156,255,.55)}
.tr-tier-stat[data-tier='4'] .tr-tier-meter i{background:linear-gradient(90deg,${IRIS});background-size:200% 100%;box-shadow:0 0 8px rgba(183,156,255,.7);animation:tr-bar-flow 3.8s linear infinite}
.tr-grow{margin-left:auto;display:flex;gap:8px;align-items:center}
.tr-refresh-btn{width:34px;height:34px;padding:0!important;display:inline-flex;align-items:center;justify-content:center;flex:none;border:0!important;background:transparent!important;box-shadow:none!important;color:var(--ui-text-secondary,inherit);border-radius:6px}
.tr-refresh-btn:hover:not(:disabled){color:var(--ui-text-primary,inherit);background:var(--chrome-action-hover,#8882)!important}
.tr-refresh-btn:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:2px}
.tr-search-tools{position:relative;display:flex;align-items:center;gap:8px;flex:1 1 260px;min-width:0;margin-left:auto;justify-content:flex-end}
.tr-search-tools .tr-search{min-width:0;flex:1 1 160px;max-width:280px}
.tr-search input{min-width:0;width:100%}
.tr-search-tools .tr-refresh-status{position:absolute;right:84px;top:calc(100% + 3px);white-space:nowrap;max-width:none}
.tr-refresh-btn svg{display:block;flex:none}
.tr-refresh-btn[data-refreshing='true'] svg{animation:tr-refresh-spin .8s linear infinite}
.tr-refresh-status{font:500 10px/1.2 var(--font-mono,monospace);color:var(--ui-text-secondary,#aaa);max-width:100px}
@keyframes tr-refresh-spin{to{transform:rotate(360deg)}}
.tr-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0 4px}
.tr-tools>:first-child{max-width:100%;overflow-x:auto;flex-shrink:0}
.tr-category-nav{display:flex;align-items:center;min-width:0;gap:6px;border-bottom:1px solid var(--ui-stroke-secondary,#8883);margin:10px 0 14px}
.tr-tabs{display:flex;flex:1;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
.tr-tabs::-webkit-scrollbar{display:none}
.tr-category-nav[data-more-right] .tr-tabs{mask-image:linear-gradient(90deg,#000 calc(100% - 44px),transparent)}
.tr-category-nav[data-more-left] .tr-tabs{mask-image:linear-gradient(90deg,transparent,#000 44px)}
.tr-category-nav[data-more-left][data-more-right] .tr-tabs{mask-image:linear-gradient(90deg,transparent,#000 44px,#000 calc(100% - 44px),transparent)}
.tr-tabs button{font:500 11px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.05em;text-transform:uppercase;color:var(--ui-text-secondary,#aaa);background:none;border:0;border-bottom:2px solid transparent;border-image:none;padding:12px 11px;cursor:pointer;white-space:nowrap;flex:none;transition:color .16s}
.tr-tabs button:hover{color:var(--ui-text-primary,inherit)}
.tr-tabs button[aria-selected=true]{color:var(--ui-text-primary,inherit);border-image:linear-gradient(90deg,var(--ui-accent,#8585F9),#F0CA67) 1}
.tr-tabs button:focus-visible,.tr-tab-arrow:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:-2px}
.tr-tab-arrow{width:28px;height:28px;padding:0;flex:none;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--ui-text-secondary,inherit);cursor:pointer;transition:background .18s,color .18s,transform .18s}
.tr-tab-arrow svg{width:16px;height:16px;display:block}
.tr-tab-arrow:hover:not(:disabled){color:#F0CA67;background:var(--chrome-action-hover,#8882)}
.tr-tab-arrow:active:not(:disabled){transform:scale(.92)}
.tr-tab-arrow:disabled{opacity:.22;cursor:default}
.tr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,164px),1fr));gap:10px}
.tr-ac{position:relative;display:flex;flex-direction:column;text-align:left;padding:0;background:var(--ui-bg-quaternary,#8881);border:1px solid var(--ui-stroke-secondary,#8883);border-radius:11px;overflow:hidden;cursor:pointer;color:inherit;font:inherit;transform-style:preserve-3d;will-change:transform;transition:border-color .22s,box-shadow .24s}
.tr-ac:after{content:'';position:absolute;inset:0;background:radial-gradient(210px circle at var(--mx,50%) var(--my,28%),color-mix(in srgb,var(--tier-color,#8585F9) 22%,transparent),transparent 72%);opacity:0;transition:opacity .22s ease;pointer-events:none;z-index:3}
.tr-ac:hover,.tr-ac:focus-visible{border-color:var(--tier-color,var(--ui-accent,#8585F9));box-shadow:0 12px 28px -6px rgba(0,0,0,.5)}
.tr-ac:hover:after{opacity:1}
.tr-ac:active{filter:brightness(.97)}
.tr-ac:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:1px}
.tr-ac-im{position:relative;width:100%;flex:none;aspect-ratio:1;background:#0D0D24;overflow:hidden;content-visibility:auto}
.tr-ac-im .tr-art,.tr-ac-im .tr-art-foil{width:100%;height:100%;object-fit:cover}
.tr-fx-wrap,.tr-fx-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.tr-ac-im:has(.tr-fx-wrap[data-ready='true']) .tr-art-foil,.tr-dlg-im:has(.tr-fx-wrap[data-ready='true']) .tr-art-foil,.tr-big .art:has(.tr-fx-wrap[data-ready='true']) .tr-art-foil{opacity:0;animation:none}
.tr-ac-im:after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 24%,rgba(255,255,255,.18) 48%,transparent 70%);transform:translateX(-125%);opacity:0;pointer-events:none;z-index:2}
@media (hover:hover) and (pointer:fine){.tr-ac:hover .tr-ac-im:after{opacity:.55;transform:translateX(125%);transition:transform .68s cubic-bezier(.22,1,.36,1),opacity .18s}}
.tr-ac[data-tier]{color:#F3F4FA;background:var(--tr-plaque-base)}
.tr-ac[data-tier] .tr-ac-cat{color:rgba(218,222,242,.72)}
.tr-ac[data-tier] .tr-ac-pn{color:rgba(228,232,248,.82)}
.tr-ac[data-tier] .tr-bar{background:rgba(255,255,255,.12)}
.tr-ac[data-tier='0']{border-color:color-mix(in srgb,#da8a55 40%,var(--ui-stroke-secondary,#8883));background:linear-gradient(180deg,color-mix(in srgb,#da8a55 8%,var(--tr-plaque-base)),var(--tr-plaque-base))}
.tr-ac[data-tier='1']{border-color:color-mix(in srgb,#d4dcef 42%,var(--ui-stroke-secondary,#8883));background:linear-gradient(180deg,color-mix(in srgb,#d4dcef 8%,var(--tr-plaque-base)),var(--tr-plaque-base))}
.tr-ac[data-tier='2']{border-color:color-mix(in srgb,#e5c36a 46%,var(--ui-stroke-secondary,#8883));background:linear-gradient(180deg,color-mix(in srgb,#e5c36a 9%,var(--tr-plaque-base)),var(--tr-plaque-base))}
.tr-ac[data-tier='3']{border:1px solid transparent;background:linear-gradient(155deg,color-mix(in srgb,#8fe3ff 13%,var(--tr-plaque-base)),color-mix(in srgb,#38bdf8 5%,var(--tr-plaque-base)) 58%,color-mix(in srgb,#8fe3ff 10%,var(--tr-plaque-base))) padding-box,conic-gradient(from var(--tr-spin),#1d506b,#8fe3ff 20%,#ffffff 28%,#9cb2ff 40%,#173f57 58%,#8fe3ff 84%,#1d506b) border-box;box-shadow:0 6px 20px -8px rgba(143,227,255,.32),inset 0 0 0 1px rgba(143,227,255,.12);animation:tr-orbit 7.5s linear infinite}
.tr-ac[data-tier='3']:hover,.tr-ac[data-tier='3']:focus-visible{box-shadow:0 12px 28px -6px rgba(86,208,255,.42),0 0 16px -4px rgba(143,227,255,.32),inset 0 0 0 1px rgba(210,249,255,.28)}
.tr-ac[data-tier='3'] .tr-ac-im:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 78%,rgba(12,18,38,.86) 100%),radial-gradient(ellipse 85% 50% at 50% 0%,rgba(143,227,255,.2),transparent 68%),linear-gradient(125deg,rgba(143,227,255,.16) 0%,transparent 26%,transparent 74%,rgba(165,180,252,.16) 100%);box-shadow:inset 0 -16px 22px -14px rgba(72,202,255,.36);z-index:1;pointer-events:none}
.tr-ac[data-tier='3'] .tr-ac-tx:before{content:'';position:absolute;top:-10px;left:0;right:0;height:22px;background:#8fe3ff;opacity:.24;mask-image:${BAYER_TILE_URI},linear-gradient(180deg,transparent,#000 45%,transparent);mask-size:8px 8px,100% 100%;mask-repeat:repeat,no-repeat;mask-composite:intersect;pointer-events:none;z-index:2}
.tr-ac[data-tier='3'] .tr-bar i{background:linear-gradient(90deg,#0ea5e9,#8fe3ff,#f0fdff);box-shadow:0 0 8px rgba(143,227,255,.5)}
.tr-ac[data-tier='4']{border:1px solid transparent;background:linear-gradient(155deg,color-mix(in srgb,#b79cff 15%,var(--tr-plaque-base)),color-mix(in srgb,#7cf3ff 6%,var(--tr-plaque-base)) 62%,color-mix(in srgb,#ff9edb 9%,var(--tr-plaque-base))) padding-box,conic-gradient(from var(--tr-spin),${IRIS}) border-box;box-shadow:0 8px 24px -10px rgba(183,156,255,.5),0 0 14px -6px rgba(124,243,255,.3),inset 0 0 0 1px rgba(228,214,255,.16);animation:tr-orbit 6s linear infinite}
.tr-ac[data-tier='4']:hover,.tr-ac[data-tier='4']:focus-visible{box-shadow:0 14px 32px -6px rgba(183,156,255,.55),0 0 20px -4px rgba(124,243,255,.4),inset 0 0 0 1px rgba(255,255,255,.34)}
.tr-ac[data-tier='4'] .tr-ac-im:before{content:'';position:absolute;inset:-18%;background:repeating-conic-gradient(from 0deg,rgba(183,156,255,0) 0 11deg,rgba(236,226,255,.2) 11deg 12.5deg,rgba(124,243,255,0) 12.5deg 22.5deg);mask-image:radial-gradient(circle at 50% 48%,#000 12%,transparent 58%);mix-blend-mode:screen;animation:tr-spin 22s linear infinite;z-index:1;pointer-events:none}
.tr-ac[data-tier='4'] .tr-ac-tx:before{content:'';position:absolute;top:-10px;left:0;right:0;height:24px;background:linear-gradient(90deg,${IRIS});opacity:.36;mask-image:${BAYER_TILE_URI},linear-gradient(180deg,transparent,#000 45%,transparent);mask-size:8px 8px,100% 100%;mask-repeat:repeat,no-repeat;mask-composite:intersect;pointer-events:none;z-index:2}
.tr-ac[data-tier='4'] .tr-bar i{background:linear-gradient(90deg,${IRIS});background-size:200% 100%;animation:tr-bar-flow 3.8s linear infinite;box-shadow:0 0 9px rgba(183,156,255,.6)}
.tr-glints{position:absolute;inset:0;z-index:2;pointer-events:none;color:#c6f5ff;overflow:hidden}
.tr-glints i{position:absolute;width:var(--gs,14px);height:var(--gs,14px);left:var(--gx,80%);top:var(--gy,18%);background:radial-gradient(ellipse 1px 52% at center,#fff,currentColor 42%,transparent),radial-gradient(ellipse 52% 1px at center,#fff,currentColor 42%,transparent),radial-gradient(circle,#fff 0,currentColor 18%,transparent 42%);opacity:0;animation:tr-glint 3.8s cubic-bezier(.4,0,.2,1) infinite;animation-delay:var(--gd,0s)}
.tr-glints b{position:absolute;width:var(--es,3px);height:var(--es,3px);left:var(--ex,50%);bottom:var(--ey,10%);border-radius:50%;background:radial-gradient(circle,#fff 25%,#c9b4ff 72%,transparent);box-shadow:0 0 6px currentColor;opacity:0;animation:tr-ember 3.4s ease-out infinite;animation-delay:var(--ed,0s)}
.tr-glints[data-tier='4']{color:#f1e9ff;box-shadow:inset 0 -22px 28px -16px rgba(183,156,255,.3),inset 0 18px 24px -18px rgba(124,243,255,.22)}
@keyframes tr-glint{0%,100%{opacity:.14;transform:scale(.42) rotate(0deg)}45%{opacity:1;transform:scale(1.15) rotate(12deg)}75%{opacity:.32;transform:scale(.68) rotate(0deg)}}
@keyframes tr-ember{0%{opacity:0;transform:translate3d(0,6px,0) scale(.5)}25%{opacity:.95;transform:translate3d(-3px,-8px,0) scale(1)}100%{opacity:0;transform:translate3d(4px,-34px,0) scale(.25)}}
.tr-art-foil{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;mix-blend-mode:screen;opacity:.72;mask-image:linear-gradient(116deg,transparent 31%,rgba(0,0,0,.26) 43%,#000 50%,rgba(0,0,0,.26) 57%,transparent 69%);mask-size:280% 280%;mask-repeat:no-repeat;animation:tr-foil-sweep 5.2s cubic-bezier(.36,0,.24,1) infinite;z-index:1}
.tr-art-foil[data-foil-tier='3']{opacity:.54;animation-duration:6.4s}
@keyframes tr-foil-sweep{0%,16%{mask-position:115% 115%}74%,100%{mask-position:-15% -15%}}
.tr-ac.tr-disc .tr-art{filter:grayscale(1) brightness(.55)}
.tr-ac.tr-lock .tr-art{filter:grayscale(1) brightness(.4)}
.tr-art{display:block;object-fit:cover;background:#0D0D24;user-select:none}
.tr-art-wait{background:linear-gradient(110deg,#0D0D24 34%,#161A54 50%,#0D0D24 66%);background-size:220% 100%;animation:tr-bar-flow 1.5s linear infinite;filter:none!important}
.tr-art-secret{filter:brightness(0)!important}
.tr-q{position:absolute;inset:0;display:grid;place-items:center;font-size:64px;font-weight:200;color:rgba(133,133,249,.55);pointer-events:none}
.tr-tag{position:absolute;top:6px;z-index:2;display:inline-flex;align-items:center;gap:4px;font:600 8px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.12em;text-transform:uppercase;padding:3px 6px;border-radius:3px;background:rgba(10,10,28,.86);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(4px);color:#fff}
.tr-tag svg{width:10px;height:10px;flex:none}
.tr-tag.l{left:6px;border-color:color-mix(in srgb,currentColor 48%,transparent)}.tr-tag.r{right:6px;background:rgba(16,20,68,.9);border-color:rgba(143,154,255,.55);color:#dfe3ff}
.tr-ac-tx{position:relative;flex:1;display:flex;flex-direction:column;width:100%;padding:9px 10px 10px}
.tr-ac-nm{font-size:14px;font-weight:600;line-height:1.22}
.tr-ac-cat{font:500 10px/1.3 var(--font-mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--ui-text-secondary,#aaa);margin-top:4px;margin-bottom:10px;overflow-wrap:anywhere}
.tr-bar{height:4px;border-radius:2px;background:color-mix(in srgb,var(--ui-text-primary,#fff) 12%,transparent);box-shadow:inset 0 1px 1px rgba(0,0,0,.28);margin-top:auto;overflow:hidden}
.tr-bar i{display:block;height:100%;border-radius:2px;background:var(--c,var(--ui-accent,#8585F9))}
.tr-ac-pn{display:flex;justify-content:space-between;font:500 10px/1.2 var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;color:var(--ui-text-secondary,#bbb);margin-top:5px}
.tr-inline{border:1px solid var(--ui-stroke-secondary,#8883);border-radius:3px;margin:12px 0;background:var(--ui-bg-quaternary,#8881);padding:12px}
.tr-empty{padding:40px 0;text-align:center;color:var(--ui-text-tertiary,#888)}
.tr-dialog{--tr-dlg-bg:color-mix(in srgb,var(--ui-text-primary,#e6e6ef) 4%,var(--ui-bg-chrome,#111225))}
.tr-dialog-body{padding:0;gap:0}
.tr-dialog-close{position:absolute;top:12px;right:12px;z-index:30;width:32px;height:32px;padding:0;border:1px solid var(--ui-stroke-secondary);border-radius:8px;background:var(--ui-bg-chrome);color:var(--ui-text-primary)}
.tr-dialog-close:hover{background:var(--ui-bg-elevated)}
.tr-dialog[data-tier='3']{border:1px solid transparent!important;background:linear-gradient(150deg,color-mix(in srgb,#8fe3ff 10%,var(--tr-dlg-bg)),var(--tr-dlg-bg) 55%) padding-box,linear-gradient(135deg,#8fe3ff 0%,#ffffff 24%,#9cb2ff 50%,#1d506b 76%,#8fe3ff 100%) border-box!important;box-shadow:0 24px 56px rgba(0,0,20,.68),0 0 24px -6px rgba(143,227,255,.32)!important}
.tr-dialog[data-tier='4']{border:1px solid transparent!important;background:linear-gradient(150deg,color-mix(in srgb,#b79cff 11%,var(--tr-dlg-bg)),color-mix(in srgb,#7cf3ff 5%,var(--tr-dlg-bg)) 60%) padding-box,linear-gradient(135deg,${IRIS}) border-box!important;box-shadow:0 24px 60px rgba(0,0,20,.72),0 0 30px -6px rgba(183,156,255,.42)!important}
.tr-dlg-im:has(.tr-fx-wrap[data-ready='true']) .tr-dlg-halo{animation:none!important;opacity:0!important}
.tr-dlg{display:grid;grid-template-columns:minmax(0,352px) minmax(0,1fr);gap:0;min-width:0;max-height:88vh;overflow:hidden}
.tr-dlg-col{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-width:0;padding:24px 22px 16px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.022) 0 1px,transparent 1px 9px),radial-gradient(ellipse 90% 60% at 50% 40%,color-mix(in srgb,var(--stage-c,#8585F9) 20%,#14184E),#0A0B22 72%);border-right:1px solid rgba(255,255,255,.08);overflow:hidden}
.tr-dlg-col:before{content:'';position:absolute;left:0;right:0;bottom:0;height:9px;background:var(--stage-c,#8585F9);opacity:.34;mask-image:${MEANDER_URI};mask-size:18px 9px;mask-repeat:repeat-x;mask-position:center;pointer-events:none}
.tr-tc{position:relative;z-index:1;width:min(100%,308px);aspect-ratio:744/1040;perspective:1500px;cursor:pointer;flex:none;border-radius:4.6%/3.3%}
.tr-tc:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:5px}
.tr-tc-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .72s cubic-bezier(.3,1.25,.4,1)}
.tr-tc[data-flipped] .tr-tc-inner{transform:rotateY(180deg)}
.tr-tc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.tr-tc-back{transform:rotateY(180deg)}
.tr-tc-tilt{position:absolute;inset:0;border-radius:4.6%/3.3%;overflow:hidden;will-change:transform;background:#0A0B22;box-shadow:0 20px 44px -14px rgba(0,0,20,.85),0 0 34px -12px var(--stage-c,#8585F9)}
.tr-tc-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;user-select:none}
.tr-tc-wait{position:absolute;inset:0;background:linear-gradient(110deg,#0D0F30 30%,#1A1E5C 50%,#0D0F30 70%);background-size:220% 100%;animation:tr-bar-flow 1.4s linear infinite}
.tr-flip-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid rgba(255,255,255,.16);border-radius:6px;background:rgba(255,255,255,.05);color:#E6E6EF;font:600 10px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:background .18s,border-color .18s}
.tr-flip-btn:hover{background:rgba(255,255,255,.1);border-color:var(--stage-c,#8585F9)}
.tr-flip-btn:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:2px}
.tr-flip-btn svg{width:13px;height:13px}
.tr-flip-btn:disabled{opacity:.5;cursor:default}
.tr-flip-btn[aria-pressed='false']{opacity:.62}
.tr-dlg.tr-dlg-full{grid-template-columns:1fr}
.tr-dlg-col.tr-full{border-right:0;padding:44px 22px 26px;gap:22px;max-height:88vh}
.tr-dlg-col.tr-full:before{display:none}
.tr-full .tr-tc{width:min(100%,calc((88vh - 176px)*.7154))}
.tr-full-bar{position:relative;z-index:2;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.tr-dlg-col:after{content:'';position:absolute;inset:0;background:radial-gradient(240px circle at var(--mx,50%) var(--my,38%),color-mix(in srgb,var(--stage-c,#8585F9) 22%,transparent),transparent 72%);opacity:0;transition:opacity .22s ease;pointer-events:none;z-index:3}
.tr-dlg-col:hover:after{opacity:1}
.tr-dlg-im{position:relative;width:100%;aspect-ratio:1;min-width:0;overflow:hidden;background:#0D0D24;transform-style:preserve-3d;will-change:transform}
.tr-dlg-im .tr-art,.tr-dlg-im .tr-art-foil{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.tr-dlg-halo{position:absolute;inset:-22%;pointer-events:none;z-index:0;opacity:0}
.tr-dlg-col[data-tier='3'] .tr-dlg-halo{opacity:.85;background:repeating-conic-gradient(from 0deg,rgba(143,227,255,0) 0 14deg,rgba(143,227,255,.22) 14deg 16deg,rgba(165,180,252,0) 16deg 30deg);mask-image:radial-gradient(circle at 50% 50%,#000 10%,transparent 58%);mix-blend-mode:screen;animation:tr-spin 26s linear infinite}
.tr-dlg-col[data-tier='4'] .tr-dlg-halo{opacity:.95;background:repeating-conic-gradient(from 0deg,rgba(183,156,255,0) 0 10deg,rgba(232,222,255,.26) 10deg 12deg,rgba(124,243,255,0) 12deg 20deg);mask-image:radial-gradient(circle at 50% 50%,#000 12%,transparent 62%);mix-blend-mode:screen;animation:tr-spin 20s linear infinite}
.tr-dlg-burst{position:absolute;left:50%;top:50%;width:44%;aspect-ratio:1;border-radius:50%;border:1.5px solid var(--stage-c,#8585F9);box-shadow:0 0 24px var(--stage-c,#8585F9),inset 0 0 18px var(--stage-c,#8585F9);transform:translate(-50%,-50%) scale(.45);opacity:0;pointer-events:none;z-index:2;animation:tr-stage-ring .68s .04s cubic-bezier(.16,1,.3,1) forwards}
@keyframes tr-stage-ring{0%{opacity:.92;transform:translate(-50%,-50%) scale(.42)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.05)}}
.tr-dlg-plinth{position:relative;z-index:2;display:grid;grid-template-columns:auto auto;justify-content:space-between;align-items:center;gap:12px 8px;width:min(100%,308px);margin-bottom:10px;color:#E6E6EF}
.tr-dlg-plinth .tr-dlg-stamp{grid-column:1/-1;grid-row:2;text-align:center}
.tr-dlg-stat{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}
.tr-dlg-stat strong{font-size:19px;font-weight:600;letter-spacing:-.02em;color:#FAFAFF}
.tr-dlg-stat span{font:600 10px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.1em;text-transform:uppercase;color:var(--stage-c,#8585F9)}
.tr-dlg-pbar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:7px;overflow:hidden}
.tr-dlg-pbar i{display:block;height:100%;border-radius:2px;background:var(--stage-c,#8585F9);box-shadow:0 0 10px var(--stage-c,#8585F9)}
.tr-dlg-col[data-tier='4'] .tr-dlg-pbar i{background:linear-gradient(90deg,${IRIS});background-size:200% 100%;animation:tr-bar-flow 3.8s linear infinite}
.tr-dlg-stamp{font:500 10px/1.25 var(--font-mono,ui-monospace,monospace);letter-spacing:.04em;color:rgba(230,230,239,.66)}
.tr-dlg-in{margin-top:40px;padding:0 22px 18px;min-width:0;max-height:calc(88vh - 40px);overflow:auto;scrollbar-width:thin}
.tr-dlg-in>*{animation:tr-dlg-rise .28s cubic-bezier(.16,1,.3,1) both}
.tr-dlg-in>*:nth-child(2){animation-delay:.03s}.tr-dlg-in>*:nth-child(3){animation-delay:.06s}.tr-dlg-in>*:nth-child(4){animation-delay:.09s}.tr-dlg-in>*:nth-child(5){animation-delay:.12s}.tr-dlg-in>*:nth-child(6){animation-delay:.15s}
@keyframes tr-dlg-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.tr-dlg h4{font-size:26px;font-weight:600;letter-spacing:-.025em;line-height:1.12;margin:5px 0 10px;overflow-wrap:anywhere}
.tr-dlg-tier{display:inline-flex;align-items:center;gap:8px;padding:4px 10px 4px 5px;border-radius:7px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent);color:var(--ui-text-primary,inherit);font:600 11px/1 var(--font-mono,monospace);letter-spacing:.1em;text-transform:uppercase}
.tr-dlg-tier svg{width:22px;height:22px;padding:3px;border:1px solid color-mix(in srgb,currentColor 55%,transparent);background:color-mix(in srgb,currentColor 14%,transparent);color:var(--c);border-radius:5px;flex:none}
.tr-dlg p{line-height:1.48}
.tr-dlg-description{font-size:12px;color:var(--ui-text-secondary,#aaa);margin:12px 0 16px}
.tr-dlg-milestone{display:grid;gap:4px;padding:12px 15px;border-left:2px solid var(--detail-c,var(--ui-accent,#8585F9));background:linear-gradient(105deg,color-mix(in srgb,var(--detail-c,var(--ui-accent,#8585F9)) 10%,transparent),transparent)}
.tr-dlg-milestone-label{font:600 9px/1.3 var(--font-mono,ui-monospace,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--ui-text-secondary,#aaa)}
.tr-dlg-milestone strong{font:550 34px/1.08 var(--font-sans,system-ui,sans-serif);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--ui-text-primary,inherit)}
.tr-dlg-milestone-context{font-size:11px;line-height:1.4;color:var(--ui-text-secondary,#aaa)}
.tr-dlg-next{display:grid;grid-template-columns:1fr auto;gap:8px;margin:13px 0 5px;font-size:11px;color:var(--ui-text-secondary,#aaa)}
.tr-dlg-next strong{font-size:10px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--ui-text-primary,inherit)}
.tr-dlg-next-track{grid-column:1/-1;height:3px;border-radius:3px;background:var(--ui-stroke-secondary,#8883);overflow:hidden}
.tr-dlg-next-track i{display:block;height:100%;background:var(--detail-c,var(--ui-accent,#8585F9));border-radius:inherit}
.tr-dlg-complete{display:flex;align-items:center;gap:7px;margin:13px 0 5px;font-size:11px;color:var(--detail-c,var(--ui-accent,#8585F9))}
.tr-dlg-complete svg{width:17px;height:17px}
.tr-ladder{display:grid;gap:2px;margin:12px 0 14px}
.tr-ladder>div{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:9px;align-items:center;padding:6px 8px;border:1px solid transparent;border-radius:5px;font:500 10px/1.2 var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;color:var(--ui-text-secondary,#aaa)}
.tr-rank-emblem{display:grid;place-items:center;width:22px;height:22px;color:var(--c);opacity:.4}
.tr-rank-emblem svg{width:19px;height:19px}
.tr-ladder .d{color:var(--ui-text-primary,inherit)}.tr-ladder .d .tr-rank-emblem{opacity:1}
.tr-ladder .tr-rank-current{border-color:color-mix(in srgb,var(--c) 32%,transparent);background:color-mix(in srgb,var(--c) 7%,transparent)}
.tr-rank-name{display:flex;align-items:center;gap:8px;min-width:0}
.tr-rank-name small{font:500 8px/1 var(--font-sans,system-ui,sans-serif);color:var(--ui-text-primary,inherit);padding:3px 4px;border-radius:3px;background:color-mix(in srgb,var(--c) 12%,transparent)}
.tr-rank-value{display:flex;align-items:center;gap:7px;justify-content:flex-end;white-space:nowrap}
.tr-rank-check{display:inline-flex;width:12px;color:var(--c)}.tr-rank-check svg{width:12px;height:12px}
.tr-dlg-rule{padding-top:12px;border-top:1px solid var(--ui-stroke-secondary,#8883)}
.tr-dlg-rule h5{margin:0 0 5px;font:600 9px/1.3 var(--font-mono,ui-monospace,monospace);letter-spacing:.1em;text-transform:uppercase;color:var(--ui-text-secondary,#aaa)}
.tr-dlg-rule p{margin:0;font-size:11px;color:var(--ui-text-secondary,#aaa)}
.tr-muted{color:var(--ui-text-tertiary,#888)}
.tr-acts{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
.tr-away-shell{padding:20px;max-height:82vh;overflow:auto;scrollbar-width:thin;color:var(--ui-text-primary,inherit)}
.tr-away-heading{margin:0 0 22px;padding-right:24px}
.tr-away-heading h4{font-size:26px;font-weight:600;letter-spacing:-.025em;line-height:1.15;margin:6px 0 8px}
.tr-away-heading p{font-size:12px;line-height:1.5;color:var(--ui-text-secondary,#aaa);margin:0}
.tr-away-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px 22px;align-items:start}
.tr-away-tile{min-width:0}
.tr-away-card-col{display:block;aspect-ratio:744/1040;padding:0;border:0;border-radius:5px;background:none;overflow:visible}
.tr-away-card-col .tr-tc{width:100%;max-width:none}
.tr-away-card-col .tr-tc-tilt{box-shadow:none}
.tr-away-caption{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-top:12px}
.tr-away-caption h5{min-width:0;margin:0;font-size:12px;line-height:1.4;font-weight:600;overflow-wrap:anywhere}
.tr-away-caption>span{display:flex;align-items:center;gap:4px;flex:none;font:500 9px/1.4 var(--font-mono,monospace);color:var(--ui-text-secondary,#aaa)}
.tr-away-caption svg{width:14px;height:14px;color:var(--c)}
.tr-away-actions{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}
.tr-away-actions .tr-flip-btn{margin:0;min-height:30px;justify-content:center;flex:1;color:var(--ui-text-primary);border-color:var(--ui-stroke-secondary);background:transparent}
.tr-away-actions .tr-flip-btn:hover{background:var(--ui-bg-elevated)}
.tr-away-actions .tr-flip-btn[aria-pressed]{opacity:1}
.tr-page[data-modal-paused] .tr-art-foil{animation-play-state:paused}
.tr-away-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
.tr-away-grid:empty{display:none}
.tr-away-inline{margin:12px;max-width:1040px}
@media(max-width:820px){.tr-away-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}}
@media(max-width:480px){.tr-away-grid{grid-template-columns:1fr}.tr-away-shell{padding:16px}.tr-away-tile{width:min(100%,300px);justify-self:center}.tr-away-heading h4{font-size:22px}}
.tr-share-pane{margin-top:40px;padding:0 22px 22px;max-height:calc(88vh - 40px);overflow:auto;scrollbar-width:thin;min-width:0;color:var(--ui-text-primary,inherit)}
.tr-share-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.tr-share-head h4{font-size:22px;line-height:1.2;margin:0;font-weight:600;letter-spacing:-.025em}
.tr-share-head p{font-size:12px;margin:5px 0 0;color:var(--ui-text-secondary,#aaa)}
.tr-share-kind{margin:-6px 0 12px}
.tr-share-frame{display:grid;place-items:center;border-radius:8px;background:#090B1C;overflow:hidden}
.tr-share-frame[data-kind='card']{padding:14px;background:radial-gradient(ellipse at 50% 40%,#161B5C,#090B1C 72%)}
.tr-share-image{display:block;max-width:100%;width:auto;height:auto;max-height:min(58vh,520px);object-fit:contain}
.tr-share-loading{width:100%;min-height:300px;display:grid;place-items:center;color:var(--ui-text-secondary,#aaa)}
.tr-share-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:18px}
.tr-share-format{margin-left:auto;font-size:10px;color:var(--ui-text-tertiary,#888);font-variant-numeric:tabular-nums}
.tr-share-status{font-size:11px;line-height:1.5;color:var(--ui-text-secondary,#aaa);margin:12px 0 0;min-height:17px}
.tr-req{display:grid;gap:7px;list-style:none;margin:8px 0 0;padding:0;font-size:11px;color:var(--ui-text-secondary,#aaa)}
.tr-req li{display:flex;justify-content:space-between;gap:15px}.tr-req strong{color:var(--ui-text-primary,inherit);font-weight:500;font-variant-numeric:tabular-nums}
@media(max-width:720px){.tr-dlg{grid-template-columns:1fr;overflow:auto;scrollbar-width:thin}.tr-dlg-in{margin-top:0;padding-top:18px;max-height:none;overflow:visible}.tr-dlg-col{border-right:0;border-bottom:1px solid rgba(255,255,255,.08);padding:18px 16px 14px}.tr-tc,.tr-dlg-plinth{width:min(100%,240px)}.tr-dlg-in{padding:18px}.tr-dlg-col{padding-top:44px}}
/* the page follows its own width (side panel, split view, small window), not the screen */
@container trpage (max-width:980px){.tr-head{grid-template-columns:minmax(0,1fr)}}
@container trpage (max-width:600px){.tr-body{padding:14px 12px 20px}.tr-pips{gap:6px}.tr-tier-stat{padding:9px 3px 8px;text-align:center}.tr-tier-top{flex-direction:column;gap:6px}.tr-tier-rank{display:none}.tr-tier-foot{justify-content:center;margin-top:6px}.tr-tier-label{font-size:8px;letter-spacing:.03em}.tr-tier-count{font-size:22px}.tr-tier-meter{margin:6px 6px 0}.tr-ring{width:88px;height:88px}.tr-wordmark{font-size:30px;margin-bottom:6px}.tr-overview{gap:12px}.tr-tools{gap:8px}.tr-search-tools{flex-basis:100%}.tr-search-tools .tr-search{max-width:none}}
@container trpage (max-width:400px){.tr-tier-label{font-size:7px;letter-spacing:0}.tr-tier-emblem{width:26px;height:26px}.tr-tier-count{font-size:19px}.tr-wordmark{font-size:25px}.tr-ring{width:76px;height:76px}.tr-ring-label small{display:none}}
@container trpage (max-width:330px){.tr-tier-label{display:none}.tr-wordmark{font-size:21px}}
/* settings */
.tr-set{max-width:720px;padding:20px 24px}
.tr-set h3{font-size:22px;font-weight:300;margin:0 0 4px}
.tr-row{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:12px 0;border-bottom:1px solid var(--ui-stroke-secondary,#8883)}
.tr-row b{display:block;font-weight:600;font-size:12px}
.tr-row span.h{display:block;color:var(--ui-text-tertiary,#888);font-size:11px;margin-top:2px;max-width:420px}
.tr-row input[type=range]{width:170px;accent-color:var(--ui-accent,#0000F2)}
.tr-note{margin-top:10px;font-size:11px;color:var(--ui-text-tertiary,#888)}
.tr-test{display:flex;gap:6px;flex-wrap:wrap}
.tr-looks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:12px 0;border-bottom:1px solid var(--ui-stroke-secondary,#8883)}
.tr-look{display:grid;gap:6px;justify-items:center;padding:8px 6px;border:1px solid var(--ui-stroke-secondary,#8883);border-radius:8px;background:#0D0D24;color:#C9D0EA;font:600 10px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:border-color .16s,box-shadow .16s}
.tr-look:hover{border-color:var(--ui-accent,#8585F9)}
.tr-look[aria-pressed='true']{border-color:#F0CA67;box-shadow:0 0 0 1px #F0CA67;color:#fff}
.tr-look:focus-visible{outline:2px solid var(--ui-accent,#8585F9);outline-offset:2px}
.tr-look svg{width:100%;max-width:150px;height:auto}
.tr-look .box{fill:#15183F;stroke:#8585F9;stroke-width:1}
.tr-look .art{fill:#2B36E6;stroke:#C5CADB;stroke-width:1}
.tr-look .ln{fill:none;stroke:#C5CADB;stroke-width:2;stroke-linecap:round;opacity:.8}
.tr-look-note{grid-column:1/-1;margin:0;font-size:11px;color:var(--ui-text-tertiary,#888)}
.tr-look-note[data-on]{color:var(--ui-text-primary,inherit)}
/* status chip + anchors */
.tr-chip{display:inline-flex;height:100%;align-items:center;gap:5px;padding:0 6px;font-size:11px;color:var(--ui-text-tertiary,inherit);background:transparent;border:0;cursor:pointer;position:relative}
.tr-chip:hover{color:var(--ui-text-primary,inherit);background:var(--chrome-action-hover,#8882)}
.tr-chip .tr-dot{position:absolute;top:3px;left:3px;width:6px;height:6px;border-radius:50%;background:#0000F2;box-shadow:0 0 0 1px var(--ui-bg-chrome,transparent)}
.tr-chip.tr-flash,.tr-anchor.tr-flash{animation:tr-glow 1.6s ease-out}
@keyframes tr-glow{0%{box-shadow:0 0 0 0 rgba(0,0,242,0);background:transparent}15%{box-shadow:0 0 18px 4px rgba(0,0,242,.85);background:rgba(0,0,242,.45);color:#fff}100%{box-shadow:0 0 0 0 rgba(0,0,242,0);background:transparent}}
.tr-anchor{display:inline-flex;align-items:center;justify-content:center;height:22px;min-width:0;width:0;overflow:visible;border-radius:3px;color:#fff;pointer-events:none}
.tr-anchor.tr-flash{width:22px;margin:0 2px}
.tr-anchor i{font-size:13px}
/* pop-ups */
.tr-pop{z-index:2147483000!important;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important;backdrop-filter:none!important;width:auto!important;max-width:none!important;pointer-events:none}
.tr-pop>span[style*="absolute"]{display:none!important}
.tr-card{pointer-events:auto;cursor:pointer;position:relative;overflow:hidden;color:#E6E6EF;font-family:inherit;border-radius:3px}
.tr-card .k{font:500 9px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.16em;text-transform:uppercase;color:#8585F9}
.tr-card .nm{font-size:22px;font-weight:300;line-height:1.05;letter-spacing:-.005em;color:#FAFAFF;margin:4px 0}
.tr-card .ds{font-size:11px;line-height:1.35;color:rgba(230,230,239,.72)}
.tr-card .tier{font:500 10px/1 var(--font-mono,ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--tc)}
.tr-card .art{position:relative;overflow:hidden;flex:none;background:#0D0D24}
.tr-card .art .tr-art{width:100%;height:100%}
.tr-card .shine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none}
.tr-card.t2 .shine,.tr-card.t3 .shine,.tr-card.t4 .shine,.tr-card.t1 .shine{animation:tr-shine 1.1s .45s ease-out forwards}
@keyframes tr-shine{to{transform:translateX(120%)}}
.tr-card .spark{position:absolute;width:3px;height:3px;background:var(--tc);opacity:0;left:12%;top:50%;pointer-events:none}
.tr-card.t2 .spark,.tr-card.t3 .spark,.tr-card.t4 .spark{animation:tr-spark 1.4s .25s ease-out forwards}
@keyframes tr-spark{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
.tr-card .rays{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg,rgba(133,133,249,0) 0 7deg,rgba(133,133,249,.28) 7deg 8deg);animation:tr-spin 14s linear infinite;mix-blend-mode:screen;opacity:0;pointer-events:none}
.tr-card.t3 .rays,.tr-card.t4 .rays{opacity:.9}
@keyframes tr-spin{to{transform:rotate(360deg)}}
.tr-podium{display:flex;gap:12px;align-items:center;width:min(440px,calc(100vw - 32px));padding:10px 18px 10px 10px;background:linear-gradient(180deg,#0B0B22,#15153A);border:1px solid rgba(133,133,249,.5);box-shadow:0 18px 50px rgba(0,0,40,.55),0 0 0 1px rgba(0,0,242,.35);animation:tr-drop .42s cubic-bezier(.2,.9,.2,1)}
.tr-podium .art{width:76px;height:76px;border:1px solid var(--tc)}
@keyframes tr-drop{from{transform:translateY(-26px);opacity:0}to{transform:none;opacity:1}}
.tr-tile{display:flex;align-items:center;height:76px;width:min(330px,calc(100vw - 32px));background:#0B0B22;border:1px solid rgba(133,133,249,.5);box-shadow:0 14px 40px rgba(0,0,40,.55);animation:tr-tilebox 5s linear both}
.tr-tile .art{width:74px;height:74px}
.tr-tile .tx{padding:0 18px 0 14px;white-space:nowrap;overflow:hidden;animation:tr-unfold .9s .35s cubic-bezier(.2,.9,.2,1) both}
.tr-tile .ring{position:absolute;left:0;top:0;width:74px;height:74px;border:2px solid var(--tc);opacity:0;animation:tr-ring 1s ease-out}
@keyframes tr-unfold{from{max-width:0;opacity:0}to{max-width:260px;opacity:1}}
@keyframes tr-ring{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(2.4)}}
@keyframes tr-tilebox{0%{transform:scale(.6);opacity:0}6%{transform:scale(1.06);opacity:1}10%{transform:scale(1)}100%{transform:scale(1);opacity:1}}
.tr-big{width:min(330px,calc(100vw - 32px),calc(100vh - 180px));background:linear-gradient(170deg,#0B0B22,#16164A);border:1px solid var(--tc);box-shadow:0 20px 60px rgba(0,0,30,.65),0 0 25px color-mix(in srgb,var(--tc) 22%,transparent);mask-image:${BAYER_WIPE_URI};mask-size:16px 1280px;mask-repeat:repeat-x;mask-position:0 0;animation:tr-bayer-in .32s cubic-bezier(.22,1,.36,1) both}
.tr-big .art{width:100%;aspect-ratio:1}
.tr-big .art .tr-art{position:absolute;inset:0;object-fit:contain}

.tr-big .rays,.tr-big .shine,.tr-big .spark{display:none}
.tr-big .tx{padding:12px 16px 16px;animation:tr-pop-copy .48s .16s cubic-bezier(.16,1,.3,1) both}
.tr-big .nm{font-size:30px}
.tr-big .bar{height:3px;background:rgba(255,255,255,.12);margin-top:10px}.tr-big .bar i{display:block;height:100%;background:var(--tc);width:0;animation:tr-fill 1.2s .5s ease-out forwards}
@keyframes tr-fill{to{width:100%}}
@keyframes tr-pop-in{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes tr-pop-copy{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tr-card,.tr-card *,.tr-chip,.tr-anchor,.tr-glints i,.tr-glints b,.tr-glints:before,.tr-glints:after,.tr-ac,.tr-ac-im:before,.tr-bar i,.tr-tier-stat,.tr-refresh-btn svg,.tr-dialog,.tr-inline,.tr-dlg-halo,.tr-dlg-burst,.tr-dlg-pbar i,.tr-dlg-in>*,.tr-tc-wait,.tr-art-wait{animation:none!important}.tr-tc-inner{transition:none}.tr-dialog,.tr-inline,.tr-big{mask-image:none}.tr-card .shine,.tr-card .spark,.tr-card .rays,.tr-art-foil,.tr-dlg-burst{display:none}.tr-ac,.tr-ac .tr-art,.tr-ac .tr-art-foil,.tr-ac-im:after,.tr-ac:after,.tr-dlg-im,.tr-dlg-col:after{transition:none!important}.tr-ac:hover,.tr-ac:focus-visible,.tr-ac:active,.tr-ac:hover .tr-art,.tr-ac:hover .tr-art-foil,.tr-dlg-col:hover .tr-dlg-im{transform:none}}
`

function Css() {
  return jsx('style', { 'data-trophy-room': '', children: CSS })
}

// ---------------------------------------------------------------------------
// Pop-up cards
// ---------------------------------------------------------------------------

function Sparks({ k }) {
  const items = useMemo(() => {
    const r = rng(hash(String(k)))
    return Array.from({ length: 14 }, (_, i) => {
      const an = (i / 14) * Math.PI * 2
      const d = 40 + r() * 50
      return { '--dx': `${(Math.cos(an) * d).toFixed(0)}px`, '--dy': `${(Math.sin(an) * d).toFixed(0)}px` }
    })
  }, [k])
  return items.map((st, i) => h('i', { key: i, className: 'spark', style: st }))
}

function PopCard({ cur }) {
  const { p, look, key } = cur
  useEffect(() => {
    cardShown(cur)
  }, [key])
  const T = TIERS[Math.max(0, Math.min(4, p.tier))]
  const kicker = p.summary ? t('popAway') : t('popKicker')
  const name = p.summary ? t('popAwayName', p.count) : p.name
  const sub = p.summary ? t('popAwayBest', p.name) : p.how || p.description
  const open = () => {
    if (p.summary) openAway(p.entries)
    else openTrophy(p.id)
    dismiss()
  }
  const art = h('div', { className: 'art' }, h(Art, { id: p.id, glyph: p.glyph, tier: p.tier }), h('div', { className: 'shine' }), look === 'card' && h('div', { className: 'rays' }))
  const tier = h('div', { className: 'tier' }, `◆ ${T.name}`)
  const base = { onClick: open, role: 'button', tabIndex: 0, style: { '--tc': T.color } }

  if (look === 'tile')
    return h(
      'div',
      { ...base, className: `tr-card tr-tile t${p.tier}` },
      art,
      h('span', { className: 'ring' }),
      h('div', { className: 'tx' }, h('div', { className: 'k' }, kicker), h('div', { className: 'nm', style: { fontSize: 18 } }, name), tier),
      h(Sparks, { k: key })
    )
  if (look === 'card')
    return h(
      'div',
      { ...base, className: `tr-card tr-big t${p.tier}` },
      art,
      h(
        'div',
        { className: 'tx' },
        h('div', { className: 'k' }, p.category ? `${kicker} · ${p.category}` : kicker),
        h('div', { className: 'nm' }, name),
        h('div', { className: 'ds' }, sub),
        h(
          'div',
          { className: 'tier', style: { marginTop: 8 } },
          `◆ ${T.name}${p.tier < 4 ? ` · ${t('nextTier', TIERS[p.tier + 1].name)}` : ` · ${t('topTier')}`}`
        ),
        h('div', { className: 'bar' }, h('i'))
      ),
      h(Sparks, { k: key })
    )
  return h(
    'div',
    { ...base, className: `tr-card tr-podium t${p.tier}` },
    art,
    h('div', null, h('div', { className: 'k' }, kicker), h('div', { className: 'nm' }, name), h('div', { className: 'ds' }, h('span', { className: 'tier' }, `◆ ${T.name}`), `  ${sub}`)),
    h(Sparks, { k: key })
  )
}

// Puts the pop-up exactly where the setting says, whichever host ended up drawing it. The host's own popover
// only gets it near its anchor (and the title-bar anchor is not always mounted), so measure and move the card.
function Placed({ place, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let raf = 0, n = 0
    const settle = () => {
      el.style.transform = ''
      const r = el.getBoundingClientRect()
      if (r.width && r.height) {
        const W = window.innerWidth, H = window.innerHeight
        const x = place.endsWith('left') ? 16 : place.endsWith('center') ? (W - r.width) / 2 : W - r.width - 16
        const y = place.startsWith('top') ? 48 : H - r.height - 40
        el.style.transform = `translate(${Math.round(x - r.left)}px,${Math.round(y - r.top)}px)`
      }
      // the popover finishes positioning over a few frames; follow it until it rests
      if (++n < 24) raf = requestAnimationFrame(settle)
    }
    settle()
    return () => cancelAnimationFrame(raf)
  }, [place])
  return h('div', { ref, className: 'tr-placed' }, children)
}

function cardWidth(look) {
  return look === 'podium' ? 440 : 330
}

function PopHost({ where, trigger }) {
  const canPop = !!(Popover && PopoverContent && PopoverTrigger)
  const cur = useValue($current)
  const anchors = useValue($anchors)
  const flashAt = useValue($flash)
  const [flashing, setFlashing] = useState(false)
  const ref = useRef(null)
  const idRef = useRef(0)
  if (!idRef.current) idRef.current = ++MOUNT_N
  const [off, setOff] = useState(0)

  // Register this host while it is mounted. Only the first host of a kind opens, so a double mount never shows two cards.
  useLayoutEffect(() => {
    if (!canPop) return undefined
    const id = idRef.current
    const now = $anchors.get()
    $anchors.set({ ...now, [where]: [...(now[where] || []), id] })
    return () => {
      const c = $anchors.get()
      const rest = (c[where] || []).filter(x => x !== id)
      const next = { ...c }
      if (rest.length) next[where] = rest
      else delete next[where]
      $anchors.set(next)
    }
  }, [where, canPop])

  const open = canPop && !!cur && anchors[where]?.[0] === idRef.current && ownerFor(cur.place, anchors) === where

  useEffect(() => {
    if (!flashAt) return undefined
    setFlashing(true)
    const id = setTimeout(() => setFlashing(false), 1700)
    return () => clearTimeout(id)
  }, [flashAt])

  useLayoutEffect(() => {
    if (!open || where !== 'title' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const w = Math.min(cardWidth(cur.look), window.innerWidth - 32, cur.look === 'card' ? window.innerHeight - 180 : Infinity)
    const target = cur.place === 'top-center' ? (window.innerWidth - w) / 2 : cur.place === 'top-left' ? 16 : window.innerWidth - w - 16
    setOff(Math.round(target - r.left))
  }, [open, cur, where])

  const side = where === 'title' ? 'bottom' : 'top'
  const align = where === 'status-right' ? 'end' : 'start'

  // Without Popover in the SDK the host is just its trigger (chip or anchor); pop-ups fall back to a toast.
  if (!canPop) return trigger(ref, flashing)

  return h(
    Popover,
    { open, onOpenChange: () => {} },
    h(PopoverTrigger, { asChild: true }, trigger(ref, flashing)),
    open &&
      h(
        PopoverContent,
        {
          key: cur.key,
          side,
          align,
          alignOffset: where === 'title' ? off : 0,
          sideOffset: where === 'title' ? 8 : 10,
          collisionPadding: 12,
          className: 'tr-pop',
          onOpenAutoFocus: e => e.preventDefault(),
          onCloseAutoFocus: e => e.preventDefault(),
          onInteractOutside: e => e.preventDefault(),
          onFocusOutside: e => e.preventDefault(),
          onPointerDownOutside: e => e.preventDefault(),
          onEscapeKeyDown: e => e.preventDefault()
        },
        h(Placed, { place: cur.place }, h(PopCard, { cur }))
      )
  )
}

function TitleAnchor() {
  return h(Fragment, null, h(Css), h(AwayHost), h(PopHost, { where: 'title', trigger: (ref, fl) => h('span', { ref, className: cn('tr-anchor', fl && 'tr-flash'), 'aria-hidden': true }, fl && h(Codicon, { name: 'star-full' })) }))
}

function StatusLeftAnchor() {
  return h(Fragment, null, h(AwayHost), h(PopHost, { where: 'status-left', trigger: ref => h('span', { ref, className: 'tr-anchor', 'aria-hidden': true }) }))
}

function StatusChip() {
  const q = useTrophyState()
  const st = q.data
  const unseen = st?.unseen?.length || 0
  const s = useValue($settings)
  useEffect(() => setBadge(unseen), [unseen, s.onWindow])
  const label = st ? `${st.totals?.unlocked ?? 0}/${st.totals?.total ?? 0}` : '...'
  return h(
    Fragment,
    null,
    h(Css),
    h(AwayHost),
    h(PopHost, {
      where: 'status-right',
      trigger: (ref, fl) =>
        h(
          'button',
          { ref, type: 'button', title: t('chipTip', label), 'aria-label': t('chipTip', label), className: cn('tr-chip', fl && 'tr-flash'), onClick: () => openTrophy(null) },
          unseen > 0 && h('i', { className: 'tr-dot' }),
          h(Codicon, { name: 'star-full' }),
          h('span', null, label)
        )
    })
  )
}

// ---------------------------------------------------------------------------
// Trophy room page
// ---------------------------------------------------------------------------

const fmtDate = ts => guard(() => new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })) || ''

function progressOf(c, pr) {
  const v = pr?.value ?? 0
  const tier = pr?.tier ?? -1
  const th = c.thresholds || []
  // multi_condition entries have no thresholds: value is a percent, and they unlock once.
  if (!th.length) return { v, tier, next: tier >= 0 ? null : 100, pct: tier >= 0 ? 100 : Math.max(0, Math.min(100, v)), percent: true }
  const next = tier >= 4 ? null : (pr?.next ?? th[tier + 1] ?? th[0] ?? 0)
  const pct = tier >= 4 ? 100 : next ? Math.min(100, (v / next) * 100) : 0
  return { v, tier, next, pct }
}

function Glints({ tier, seed = 'trophy' }) {
  const { stars, embers } = useMemo(() => {
    const r = rng(hash(`${seed}:${tier}`))
    const flip = r() > 0.5
    const zones = [
      [68, 86, 14, 32],
      [12, 30, 56, 80],
      [62, 84, 60, 82],
      [14, 36, 22, 42]
    ]
    const st = zones.map(([x0, x1, y0, y1], idx) => {
      const px = x0 + r() * (x1 - x0)
      return {
        '--gx': `${(flip ? 94 - px : px).toFixed(1)}%`,
        '--gy': `${(y0 + r() * (y1 - y0)).toFixed(1)}%`,
        '--gs': `${((tier >= 4 && idx === 0 ? 18 : 11) + r() * 6).toFixed(1)}px`,
        '--gd': `-${(r() * 3.6).toFixed(2)}s`
      }
    })
    const em =
      tier >= 4
        ? [0, 1, 2].map(idx => ({
            '--ex': `${(18 + idx * 28 + r() * 14).toFixed(1)}%`,
            '--ey': `${(6 + r() * 12).toFixed(1)}%`,
            '--es': `${(2.4 + r() * 1.4).toFixed(1)}px`,
            '--ed': `-${(r() * 3.2).toFixed(2)}s`
          }))
        : []
    return { stars: st, embers: em }
  }, [tier, seed])
  return h(
    'span',
    { className: 'tr-glints', 'data-tier': tier, 'aria-hidden': true },
    stars.map((st, idx) => h('i', { key: `s${idx}`, style: st })),
    embers.map((em, idx) => h('b', { key: `e${idx}`, style: em }))
  )
}

function TierGlyph({ tier }) {
  return h(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: TIER_EMBLEMS[tier] })
  )
}

// Progress medallion: a ring inside a laurel wreath whose leaves turn gold from the tie upward as trophies unlock.
const LAUREL = (() => {
  const n = 9
  const leaf = (len, w) => `M0 0C${len * 0.3} ${-w} ${len * 0.74} ${-w} ${len} 0C${len * 0.74} ${w} ${len * 0.3} ${w} 0 0Z`
  const out = []
  for (const side of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const a = 17 + (k * 141) / (n - 1)
      const phi = 90 + side * a
      const rad = (phi * Math.PI) / 180
      const x = (60 + 45 * Math.cos(rad)).toFixed(2)
      const y = (60 + 45 * Math.sin(rad)).toFixed(2)
      const tangent = phi + side * 90
      out.push({ k, d: leaf(11.5, 2.5), tf: `translate(${x} ${y}) rotate(${(tangent - side * 30).toFixed(1)})` })
      out.push({ k, d: leaf(8.5, 2.1), tf: `translate(${x} ${y}) rotate(${(tangent + side * 38).toFixed(1)})` })
    }
  }
  return { n, leaves: out }
})()

function Medallion({ frac }) {
  const pct = Math.round(frac * 100)
  const lit = frac <= 0 ? 0 : Math.max(1, Math.round(frac * LAUREL.n))
  const angle = 2 * Math.PI * frac
  return h('div', { className: 'tr-ring', role: 'img', 'aria-label': `${pct}%` },
    h('svg', { viewBox: '0 0 120 120', 'aria-hidden': true },
      h('defs', null,
        h('linearGradient', { id: 'tr-ring-grad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#6366F1' }),
          h('stop', { offset: '55%', stopColor: '#8FE3FF' }),
          h('stop', { offset: '100%', stopColor: '#E4D6FF' })
        ),
        h('linearGradient', { id: 'tr-laurel-grad', x1: '0%', y1: '100%', x2: '100%', y2: '0%' },
          h('stop', { offset: '0%', stopColor: '#B98A2C' }),
          h('stop', { offset: '55%', stopColor: '#F0CA67' }),
          h('stop', { offset: '100%', stopColor: '#FFF4C9' })
        )
      ),
      h('circle', { cx: 60, cy: 60, r: 58.5, fill: 'none', stroke: 'rgba(133,133,249,.3)', strokeWidth: 1 }),
      h('path', { d: 'M46.84 103.03A45 45 0 0 1 43.14 18.28M73.16 103.03A45 45 0 0 0 76.86 18.28', fill: 'none', stroke: 'rgba(197,202,219,.26)', strokeWidth: .8 }),
      LAUREL.leaves.map((l, i) => h('path', { key: i, className: 'tr-leaf', d: l.d, transform: l.tf, 'data-lit': l.k < lit ? '' : undefined })),
      h('path', { d: 'M60 100.5l3.2 4.5-3.2 4.5-3.2-4.5Z', fill: lit ? '#F0CA67' : 'rgba(197,202,219,.3)' }),
      h('circle', { cx: 60, cy: 60, r: 27, fill: 'rgba(9,11,28,.7)', stroke: 'rgba(143,227,255,.16)', strokeWidth: 1 }),
      h('g', { className: 'tr-ring-arc' },
        h('circle', { cx: 60, cy: 60, r: 33, fill: 'none', stroke: 'rgba(255,255,255,.09)', strokeWidth: 4.6 }),
        frac > 0 && h('circle', { className: 'tr-ring-progress', cx: 60, cy: 60, r: 33, fill: 'none', stroke: 'url(#tr-ring-grad)', strokeWidth: 4.6, strokeLinecap: 'round', pathLength: 100, strokeDasharray: `${frac * 100} 100` }),
        frac > 0 && h('circle', { className: 'tr-ring-beacon', cx: 60 + 33 * Math.cos(angle), cy: 60 + 33 * Math.sin(angle), r: 2.6, fill: '#FFFFFF' })
      )
    ),
    h('span', { className: 'tr-ring-label', 'aria-hidden': true }, h('strong', null, `${pct}%`), h('small', null, t('complete')))
  )
}

function Card({ c, pr, onOpen }) {
  const secret = pr?.state === 'secret'
  const { v, tier, next, pct, percent } = progressOf(c, pr)
  const T = tier >= 0 ? TIERS[tier] : null
  const unlocked = pr?.state === 'unlocked'
  const cls = unlocked ? '' : pr?.state === 'discovered' ? 'tr-disc' : 'tr-lock'
  return h(
    'button',
    {
      type: 'button',
      className: cn('tr-ac', cls),
      style: {
        '--c': T ? (tier === 4 ? `linear-gradient(90deg,${IRIS})` : T.color) : 'var(--ui-accent,#8585F9)',
        '--tier-color': T ? T.color : 'var(--ui-accent,#8585F9)'
      },
      onClick: () => onOpen(c.id),
      'data-trophy': c.id,
      'data-tier': T ? tier : undefined
    },
    h(
      'div',
      { className: 'tr-ac-im' },
      h(Art, { id: c.id, glyph: c.glyph, secret, tier, fx: !secret }),
      unlocked && tier >= 3 && h(Glints, { tier, seed: c.id }),
      secret && h('div', { className: 'tr-q' }, '?'),
      T && h('span', { className: 'tr-tag l', style: { color: T.color } }, h(TierGlyph, { tier }), T.name),
      c.source === 'new' && h('span', { className: 'tr-tag r' }, t('newTag'))
    ),
    h(
      'div',
      { className: 'tr-ac-tx' },
      h('div', { className: 'tr-ac-nm' }, secret ? t('secretName') : c.name),
      h('div', { className: 'tr-ac-cat' }, secret ? t('secretHidden') : c.category),
      h('div', { className: 'tr-bar' }, h('i', { style: { width: `${secret ? 0 : pct}%` } })),
      h('div', { className: 'tr-ac-pn' }, h('span', null, secret ? '?' : percent ? `${Math.round(v)}%` : v.toLocaleString()), h('span', null, secret ? '' : percent ? (tier >= 0 ? 'DONE' : '100%') : tier >= 4 ? 'MAX' : (next || 0).toLocaleString()))
    )
  )
}

function Ladder({ c, pr }) {
  const v = pr?.value ?? 0
  const tier = pr?.tier ?? -1
  return h(
    'div',
    { className: 'tr-ladder', 'aria-label': 'Trophy milestones' },
    (c.thresholds || []).map((th, i) => {
      const done = i <= tier || v >= th
      return h('div', { key: i, className: cn(done && 'd', i === tier && 'tr-rank-current'), 'data-tier': i, 'aria-current': i === tier ? 'step' : undefined, style: { '--c': TIERS[i].color } },
        h('span', { className: 'tr-rank-emblem', 'aria-hidden': true }, h(TierGlyph, { tier: i })),
        h('span', { className: 'tr-rank-name' }, TIERS[i].name, i === tier && h('small', null, 'Current')),
        h('span', { className: 'tr-rank-value' }, th.toLocaleString(), done && h('span', { className: 'tr-rank-check', 'aria-label': 'Earned' }, h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('path', { d: 'm3 8 3 3 7-7' }))))
      )
    })
  )
}

function achievementPresentation(c, pr) {
  const progress = progressOf(c, pr)
  const earned = progress.tier >= 0 && pr?.state === 'unlocked'
  const T = TIERS[progress.tier] || null
  const milestone = progress.percent ? null : c.thresholds?.[progress.tier]
  return { ...progress, earned, T, milestone, metric: (c.how || c.description || '').replace(/delegate_task/g, 'delegation') }
}

function wrapShareText(g, text, width) {
  const lines = []
  let line = ''
  for (const word of String(text).trim().split(/\s+/)) {
    if (line && g.measureText(`${line} ${word}`).width > width) {
      lines.push(line)
      line = ''
    }
    if (g.measureText(word).width > width) {
      for (const char of word) {
        if (line && g.measureText(line + char).width > width) {
          lines.push(line)
          line = ''
        }
        line += char
      }
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

// Olympian finish: the sculpture becomes liquid iridescent chrome. The colour follows the metal's own light and
// shade, so the bands flow along the forms instead of lying flat over the picture, and the cobalt ground turns
// royal violet. Works in place on RGBA pixel data.
const PEARL = [[124, 243, 255], [183, 156, 255], [255, 158, 219], [255, 224, 138], [140, 245, 210], [156, 178, 255]]
function olympianGrade(d, w, hh) {
  const ramp = (t, ch) => {
    const f = (((t % 1) + 1) % 1) * PEARL.length
    const i = Math.floor(f), k = f - i
    return (PEARL[i][ch] * (1 - k) + PEARL[(i + 1) % PEARL.length][ch] * k) / 255
  }
  for (let y = 0, i = 0; y < hh; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
      const metal = Math.max(0, Math.min(1, (0.85 * r + 0.85 * g - 0.63 * b - 0.17) / 0.17))
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const bright = Math.min(1, Math.pow(lum, 0.58) * 1.1)
      // broad bands that drift with the metal's own shading; the highlights stay white
      const t = lum * 0.85 + (x / w) * 0.45 + (y / hh) * 0.6
      const k = metal * 0.74 * Math.min(1, 3.6 * lum * (1 - lum) + 0.3)
      const glare = Math.max(0, (lum - 0.72) / 0.28) * metal
      let nr = bright * (1 - k + k * 1.16 * ramp(t, 0))
      let ng = bright * (1 - k + k * 1.16 * ramp(t, 1))
      let nb = bright * (1 - k + k * 1.16 * ramp(t, 2))
      nr += (1 - nr) * glare
      ng += (1 - ng) * glare
      nb += (1 - nb) * glare
      // the ground: brighter cobalt with a soft aurora spreading from behind the subject
      const dx = x / w - 0.5, dy = y / hh - 0.46
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.7)
      const at = Math.atan2(dy, dx) / 6.2832 + fall * 0.4
      const gr = 1 - metal
      const er = r * 1.2 + b * 0.14 + ramp(at, 0) * 0.26 * fall
      const eg = g * 1.15 + ramp(at, 1) * 0.2 * fall
      const eb = b * 1.34 + ramp(at, 2) * 0.26 * fall
      d[i] = Math.max(0, Math.min(255, (nr * metal + er * gr) * 255))
      d[i + 1] = Math.max(0, Math.min(255, (ng * metal + eg * gr) * 255))
      d[i + 2] = Math.max(0, Math.min(255, (nb * metal + eb * gr) * 255))
    }
  }
}

function gradedShareArt(img, tier) {
  const cv = document.createElement('canvas')
  const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight))
  cv.width = Math.max(1, Math.round(img.naturalWidth * scale))
  cv.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const g = cv.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('Canvas unavailable')
  g.drawImage(img, 0, 0, cv.width, cv.height)
  if (tier === 4) {
    const pixels = g.getImageData(0, 0, cv.width, cv.height)
    olympianGrade(pixels.data, cv.width, cv.height)
    g.putImageData(pixels, 0, 0)
    return cv
  }
  const matrix = TIER_ART_MATRICES[tier]?.trim().split(/\s+/).map(Number)
  if (matrix && tier !== 1) {
    const pixels = g.getImageData(0, 0, cv.width, cv.height)
    const d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], green = d[i + 1], b = d[i + 2]
      d[i] = r * matrix[0] + green * matrix[1] + b * matrix[2] + 255 * matrix[4]
      d[i + 1] = r * matrix[5] + green * matrix[6] + b * matrix[7] + 255 * matrix[9]
      d[i + 2] = r * matrix[10] + green * matrix[11] + b * matrix[12] + 255 * matrix[14]
      if (tier === 0) {
        const metal = Math.max(0, Math.min(1, (.85 * r + .85 * green - .63 * b - 43) / 43))
        d[i + 1] *= 1 - .18 * metal
        d[i + 2] *= 1 - .06 * metal
      }
    }
    g.putImageData(pixels, 0, 0)
  }
  return cv
}

// ---------------------------------------------------------------------------
// Trophy cards: every trophy as a collectible card, drawn in code so there are no
// extra pictures to ship. One renderer feeds the detail view, the flip side and
// the share images. Layout units are a 744 x 1040 card (5:7).
// ---------------------------------------------------------------------------

const CARD_W = 744
const CARD_H = 1040
const MONO_FONT = "'JetBrains Mono',ui-monospace,'Cascadia Mono',Consolas,monospace"
// dark, mid, light of each tier's metal; `locked` is the unearned steel.
const CARD_METALS = {
  locked: ['#1E2242', '#5E668C', '#9AA2C4'],
  0: ['#5A2A14', '#C77B4E', '#F6C6A0'],
  1: ['#4A5273', '#C5CADB', '#FFFFFF'],
  2: ['#6E5216', '#E5C36A', '#FFF4C9'],
  3: ['#124A66', '#8FE3FF', '#F2FDFF'],
  4: ['#5B54A6', '#E4D6FF', '#FFFFFF']
}
const IRIS_STOPS = IRIS.split(',').map(s => s.trim().split(' ')[0])
const cardFont = size => `700 ${size}px ${DISPLAY_FONT}`
const monoFont = (size, weight = 600) => `${weight} ${size}px ${MONO_FONT}`
const tracked = (g, px) => guard(() => { g.letterSpacing = `${px}px` })

function chamferPath(g, x, y, w, hh, c) {
  g.beginPath()
  g.moveTo(x + c, y)
  g.lineTo(x + w - c, y)
  g.lineTo(x + w, y + c)
  g.lineTo(x + w, y + hh - c)
  g.lineTo(x + w - c, y + hh)
  g.lineTo(x + c, y + hh)
  g.lineTo(x, y + hh - c)
  g.lineTo(x, y + c)
  g.closePath()
}

function metalFill(g, x0, y0, x1, y1, m) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, m[2])
  gr.addColorStop(0.28, m[1])
  gr.addColorStop(0.5, m[2])
  gr.addColorStop(0.74, m[0])
  gr.addColorStop(1, m[1])
  return gr
}

function irisFill(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  IRIS_STOPS.forEach((c, i) => gr.addColorStop(i / (IRIS_STOPS.length - 1), c))
  return gr
}

const tierFill = (g, key, x0, y0, x1, y1) => (key === 4 ? irisFill(g, x0, y0, x1, y1) : metalFill(g, x0, y0, x1, y1, CARD_METALS[key] || CARD_METALS.locked))

// Text centred on a point, by its real ink box (canvas baselines differ per face).
function centerText(g, text, cx, cy) {
  const mt = g.measureText(text)
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillText(text, cx, cy + ((mt.actualBoundingBoxAscent || 0) - (mt.actualBoundingBoxDescent || 0)) / 2)
}

// Two balanced lines for a title that does not fit on one.
function splitTitle(text) {
  const words = String(text).trim().split(/\s+/)
  let best = null
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const d = Math.abs(a.length - b.length)
    if (!best || d < best.d) best = { d, lines: [a, b] }
  }
  return best ? best.lines : [String(text)]
}

// Largest size at which every line fits the width; returns { size, lines }.
function fitTitle(g, text, width, oneLine, twoLine, min) {
  for (let size = oneLine; size >= twoLine; size -= 2) {
    g.font = cardFont(size)
    if (g.measureText(text).width <= width) return { size, lines: [text] }
  }
  const lines = splitTitle(text)
  for (let size = twoLine; size > min; size--) {
    g.font = cardFont(size)
    if (lines.every(l => g.measureText(l).width <= width)) return { size, lines }
  }
  g.font = cardFont(min)
  return { size: min, lines: lines.flatMap(l => wrapShareText(g, l, width)) }
}

// Greek key along +x from 0 to len, centred on y = 0, with the base line on the +y side.
function meanderRun(g, len, u, hh) {
  const n = Math.max(1, Math.floor(len / u))
  const off = (len - n * u) / 2
  const e = hh / 2
  g.beginPath()
  g.moveTo(0, e)
  g.lineTo(len, e)
  for (let i = 0; i < n; i++) {
    const x = off + i * u
    g.moveTo(x + u * 0.14, e)
    g.lineTo(x + u * 0.14, -e)
    g.lineTo(x + u * 0.82, -e)
    g.lineTo(x + u * 0.82, e * 0.42)
    g.lineTo(x + u * 0.38, e * 0.42)
    g.lineTo(x + u * 0.38, -e * 0.3)
    g.lineTo(x + u * 0.6, -e * 0.3)
  }
  g.stroke()
}

// The same key run all the way round a rounded rectangle, bending through the corners without a break.
// x, y, w, hh and rad describe the centre line; the base line sits on the inside.
function meanderRing(g, x, y, w, hh, rad, unit, depth) {
  const sw = w - 2 * rad, sh = hh - 2 * rad, arc = (Math.PI / 2) * rad
  const legs = [sw, arc, sh, arc, sw, arc, sh, arc]
  const total = 2 * (sw + sh) + 4 * arc
  const n = Math.round(total / unit), u = total / n, e = depth / 2
  const at = (dist, o) => {
    let d = ((dist % total) + total) % total
    let k = 0
    while (k < 7 && d > legs[k]) d -= legs[k++]
    const side = k >> 1
    if (!(k & 1)) {
      const from = [[x + rad, y], [x + w, y + rad], [x + w - rad, y + hh], [x, y + hh - rad]][side]
      const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][side]
      const inn = [[0, 1], [-1, 0], [0, -1], [1, 0]][side]
      return [from[0] + dir[0] * d + inn[0] * o, from[1] + dir[1] * d + inn[1] * o]
    }
    const c = [[x + w - rad, y + rad], [x + w - rad, y + hh - rad], [x + rad, y + hh - rad], [x + rad, y + rad]][side]
    const a = -Math.PI / 2 + (side * Math.PI) / 2 + d / rad
    return [c[0] + Math.cos(a) * (rad - o), c[1] + Math.sin(a) * (rad - o)]
  }
  const shape = [[0.14, e], [0.14, -e], [0.82, -e], [0.82, e * 0.42], [0.38, e * 0.42], [0.38, -e * 0.3], [0.6, -e * 0.3]]
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const b = i * u
    const p0 = at(b + shape[0][0] * u, shape[0][1])
    g.moveTo(p0[0], p0[1])
    for (let j = 1; j < shape.length; j++) {
      const s0 = b + shape[j - 1][0] * u, s1 = b + shape[j][0] * u
      const steps = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 3))
      for (let q = 1; q <= steps; q++) {
        const p = at(s0 + ((s1 - s0) * q) / steps, shape[j - 1][1] + ((shape[j][1] - shape[j - 1][1]) * q) / steps)
        g.lineTo(p[0], p[1])
      }
    }
  }
  g.stroke()
  g.beginPath()
  g.roundRect(x + e, y + e, w - 2 * e, hh - 2 * e, Math.max(1, rad - e))
  g.stroke()
}

// Ordered dither over the band: shade toward both rims and streaks of light across it, so flat colour reads as metal.
function ditherBand(g, strength, glint = 0.62) {
  const W = CARD_W, H = CARD_H
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const de = Math.min(x, y, W - x, H - y)
      if (de > 30) continue
      const b = (BAYER4[(y / 3) & 3][(x / 3) & 3] + 0.5) / 16
      const rim = Math.abs(de - 14) / 14
      const streak = Math.sin((x - y * 0.8) * 0.0125 + 0.9)
      if (b < rim * rim * 0.8 * strength) {
        g.fillStyle = 'rgba(4,4,26,.62)'
        g.fillRect(x, y, 3, 3)
      } else if (streak > 0.45 && b < (streak - 0.45) * 1.5 * strength) {
        g.fillStyle = `rgba(255,255,255,${glint})`
        g.fillRect(x, y, 2, 2)
      }
    }
  }
}

// The outer band: a Greek key in the tier's metal, cut facets for Diamond, iridescent scales for Olympian.
function drawCardBand(g, key, m, seed) {
  const W = CARD_W, H = CARD_H
  g.save()
  g.beginPath()
  g.roundRect(0, 0, W, H, 34)
  g.roundRect(28, 28, W - 56, H - 56, 14)
  g.clip('evenodd')
  const base = g.createLinearGradient(0, 0, W, H)
  base.addColorStop(0, m[0])
  base.addColorStop(0.5, '#0B0C2A')
  base.addColorStop(1, m[0])
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  const r = rng(seed)
  const edge = (x, y) => x < 38 || x > W - 38 || y < 38 || y > H - 38
  // light rolling across the band, the same for every cell so neighbours shade together
  const roll = (x, y) => Math.sin((x + y * 0.62) * 0.021) * 0.6 + Math.sin((x * 0.4 - y) * 0.013 + 2) * 0.4
  if (key === 4) {
    const s = 12, hx = s * Math.sqrt(3)
    for (let row = 0; row * 1.5 * s < H + s; row++) {
      const y = row * 1.5 * s
      for (let x = row & 1 ? hx / 2 : 0; x < W + hx; x += hx) {
        if (!edge(x, y)) continue
        g.beginPath()
        for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos(Math.PI / 6 + (k * Math.PI) / 3) * s * 0.94, y + Math.sin(Math.PI / 6 + (k * Math.PI) / 3) * s * 0.94)
        g.closePath()
        g.fillStyle = `hsl(${((x * 0.5 + y * 0.34 + r() * 26) % 360).toFixed(0)} 92% ${(60 + roll(x, y) * 20 + r() * 8).toFixed(0)}%)`
        g.fill()
        const bev = g.createLinearGradient(x - s * 0.7, y - s, x + s * 0.7, y + s)
        bev.addColorStop(0, 'rgba(255,255,255,.62)')
        bev.addColorStop(0.42, 'rgba(255,255,255,0)')
        bev.addColorStop(1, 'rgba(10,6,60,.5)')
        g.fillStyle = bev
        g.fill()
      }
    }
    ditherBand(g, 1)
  } else if (key === 3) {
    const s = 24, hgt = s * 0.866
    for (let row = 0; row * hgt < H; row++) {
      const y = row * hgt
      for (let i = -1; (i * s) / 2 < W; i++) {
        const x = (i * s) / 2
        if (!edge(x + s / 2, y + hgt / 2)) continue
        const up = (i + row) & 1
        g.beginPath()
        if (up) {
          g.moveTo(x, y + hgt)
          g.lineTo(x + s / 2, y)
          g.lineTo(x + s, y + hgt)
        } else {
          g.moveTo(x, y)
          g.lineTo(x + s, y)
          g.lineTo(x + s / 2, y + hgt)
        }
        g.closePath()
        g.fillStyle = `hsl(${(190 + r() * 18).toFixed(0)} 94% ${Math.max(14, Math.min(94, 54 + roll(x, y) * 26 + (up ? 12 : -12) + (r() - 0.5) * 22)).toFixed(0)}%)`
        g.fill()
      }
    }
    ditherBand(g, 0.9)
  } else {
    ditherBand(g, 0.75, 0.16)
    g.strokeStyle = m[2]
    g.lineWidth = 2
    g.lineJoin = 'miter'
    g.shadowColor = 'rgba(0,0,12,.75)'
    g.shadowOffsetY = 1
    meanderRing(g, 14, 14, W - 28, H - 28, 20, 24, 12)
    g.shadowColor = 'transparent'
    g.shadowOffsetY = 0
  }
  const sheen = g.createLinearGradient(0, 0, W, H * 0.8)
  sheen.addColorStop(0, 'rgba(255,255,255,.3)')
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.62, 'rgba(255,255,255,.14)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = sheen
  g.fillRect(0, 0, W, H)
  g.restore()
  g.lineWidth = 3
  g.strokeStyle = metalFill(g, 0, 0, W, H, m)
  g.beginPath()
  g.roundRect(1.5, 1.5, W - 3, H - 3, 33)
  g.stroke()
  g.lineWidth = 4
  g.strokeStyle = metalFill(g, W, 0, 0, H, m)
  g.beginPath()
  g.roundRect(28, 28, W - 56, H - 56, 14)
  g.stroke()
  g.lineWidth = 1
  g.strokeStyle = 'rgba(4,5,20,.8)'
  g.beginPath()
  g.roundRect(31, 31, W - 62, H - 62, 12)
  g.stroke()
}

// The cobalt field inside the band, with engraved rays behind the subject.
function drawCardPanel(g, dim, focusY) {
  const W = CARD_W, H = CARD_H
  g.save()
  g.beginPath()
  g.roundRect(30, 30, W - 60, H - 60, 13)
  g.clip()
  const bg = g.createRadialGradient(W / 2, focusY, 40, W / 2, focusY, 780)
  const stops = dim ? ['#23264A', '#12142C', '#090A1A'] : ['#1C24C4', '#0D1064', '#070824']
  bg.addColorStop(0, stops[0])
  bg.addColorStop(0.46, stops[1])
  bg.addColorStop(1, stops[2])
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.05
  g.fillStyle = '#fff'
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2
    const b = a + Math.PI / 150
    g.beginPath()
    g.moveTo(W / 2, focusY)
    g.lineTo(W / 2 + Math.cos(a) * 1300, focusY + Math.sin(a) * 1300)
    g.lineTo(W / 2 + Math.cos(b) * 1300, focusY + Math.sin(b) * 1300)
    g.closePath()
    g.fill()
  }
  g.globalAlpha = 1
  g.restore()
}

function drawPlate(g, x, y, w, hh, c, m) {
  chamferPath(g, x, y, w, hh, c)
  const f = g.createLinearGradient(0, y, 0, y + hh)
  f.addColorStop(0, 'rgba(8,9,34,.94)')
  f.addColorStop(1, 'rgba(16,20,74,.94)')
  g.fillStyle = f
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = metalFill(g, x, y, x + w, y + hh, m)
  g.stroke()
  chamferPath(g, x + 5, y + 5, w - 10, hh - 10, Math.max(2, c - 3))
  g.lineWidth = 1
  g.strokeStyle = 'rgba(255,255,255,.13)'
  g.stroke()
}

function drawGloss(g) {
  const gl = g.createLinearGradient(0, 0, CARD_W * 0.7, CARD_H * 0.5)
  gl.addColorStop(0, 'rgba(255,255,255,.1)')
  gl.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = gl
  g.fillRect(0, 0, CARD_W, CARD_H)
}

function drawCardFront(g, { c, p, art, serial }) {
  const W = CARD_W, H = CARD_H
  const earned = p.earned
  const key = earned ? p.tier : 'locked'
  const m = CARD_METALS[key]
  g.save()
  g.beginPath()
  g.roundRect(0, 0, W, H, 34)
  g.clip()
  g.fillStyle = '#070818'
  g.fillRect(0, 0, W, H)
  drawCardBand(g, key, m, hash(c.id))
  drawCardPanel(g, !earned, 480)

  // title plate
  drawPlate(g, 48, 60, W - 96, 88, 16, m)
  const ink = g.createLinearGradient(0, 70, 0, 140)
  ink.addColorStop(0, '#FFFFFF')
  ink.addColorStop(0.5, m[1])
  ink.addColorStop(0.53, m[2])
  ink.addColorStop(1, m[1])
  tracked(g, 1)
  const title = fitTitle(g, String(c.name).toUpperCase(), W - 96 - 48, 58, 38, 18)
  g.shadowColor = 'rgba(0,0,10,.8)'
  g.shadowOffsetY = 2
  g.fillStyle = ink
  const lh = title.size * 0.98
  title.lines.slice(0, 2).forEach((line, i, all) => centerText(g, line, W / 2, 104 + (i - (all.length - 1) / 2) * lh))
  g.shadowColor = 'transparent'
  g.shadowOffsetY = 0

  // rank emblem over the top of the band
  g.beginPath()
  g.arc(W / 2, 36, 22, 0, Math.PI * 2)
  g.fillStyle = '#090A28'
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = tierFill(g, key, W / 2 - 22, 14, W / 2 + 22, 58)
  g.stroke()
  g.save()
  g.translate(W / 2 - 15, 36 - 15)
  g.scale(1.25, 1.25)
  g.lineWidth = 1.5
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = m[2]
  g.stroke(new Path2D(TIER_EMBLEMS[earned ? p.tier : 0]))
  g.restore()

  // category chip and the house line
  const cat = String(c.category).toUpperCase()
  tracked(g, 2)
  let cs = 15
  for (; cs > 10; cs--) {
    g.font = monoFont(cs)
    if (g.measureText(cat).width <= 336) break
  }
  const cw = Math.min(372, g.measureText(cat).width + 34)
  chamferPath(g, 48, 156, cw, 30, 9)
  g.fillStyle = tierFill(g, key, 48, 156, 48 + cw, 186)
  g.fill()
  g.fillStyle = '#080A24'
  centerText(g, cat, 48 + cw / 2 + 1, 171)
  tracked(g, 3)
  g.font = monoFont(13, 500)
  const house = 'HERMES TROPHY ROOM'
  const hw = g.measureText(house).width
  g.fillStyle = m[1]
  g.textAlign = 'right'
  g.textBaseline = 'middle'
  g.fillText(house, W - 48, 172)
  if (W - 48 - hw - 14 > 48 + cw + 14) {
    g.globalAlpha = 0.45
    g.lineWidth = 1
    g.strokeStyle = m[1]
    g.beginPath()
    g.moveTo(48 + cw + 14, 171.5)
    g.lineTo(W - 48 - hw - 14, 171.5)
    g.stroke()
    g.globalAlpha = 1
  }

  // picture window
  const ax = 48, ay = 196, aw = W - 96, ah = 600
  g.save()
  g.beginPath()
  g.roundRect(ax, ay, aw, ah, 10)
  g.clip()
  g.fillStyle = '#0D0D24'
  g.fillRect(ax, ay, aw, ah)
  if (art) {
    // The whole picture, never cropped: a soft blown-up copy fills what is left of the window around it.
    const iw = art.naturalWidth || art.width, ih = art.naturalHeight || art.height
    const dim = earned ? '' : 'grayscale(1) brightness(.5) '
    const cover = Math.max(aw / iw, ah / ih) * 1.08
    g.filter = `${dim}blur(16px)`
    g.drawImage(art, ax + (aw - iw * cover) / 2, ay + (ah - ih * cover) / 2, iw * cover, ih * cover)
    const fit = Math.min(aw / iw, ah / ih)
    // Kept at the picture's own resolution and scaled once, straight onto the card, so a saved card is as sharp as the source.
    const whole = document.createElement('canvas')
    whole.width = iw
    whole.height = ih
    const fw = iw * fit, fh = ih * fit
    const wg = whole.getContext('2d')
    if (wg) {
      wg.drawImage(art, 0, 0, iw, ih)
      // fade the picture's own edges so it melts into the surround with no seam
      const wide = aw - fw > 4, tall = ah - fh > 4
      if (wide || tall) {
        const fade = wide ? wg.createLinearGradient(0, 0, whole.width, 0) : wg.createLinearGradient(0, 0, 0, whole.height)
        const f = 34 / (wide ? fw : fh)
        fade.addColorStop(0, 'rgba(0,0,0,0)')
        fade.addColorStop(f, '#000')
        fade.addColorStop(1 - f, '#000')
        fade.addColorStop(1, 'rgba(0,0,0,0)')
        wg.globalCompositeOperation = 'destination-in'
        wg.fillStyle = fade
        wg.fillRect(0, 0, whole.width, whole.height)
      }
      g.filter = dim || 'none'
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(whole, ax + (aw - fw) / 2, ay + (ah - fh) / 2, fw, fh)
    }
    g.filter = 'none'
  }
  const vg = g.createRadialGradient(W / 2, ay + ah * 0.46, ah * 0.4, W / 2, ay + ah * 0.46, ah * 0.9)
  vg.addColorStop(0, 'rgba(5,6,22,0)')
  vg.addColorStop(1, 'rgba(5,6,22,.42)')
  g.fillStyle = vg
  g.fillRect(ax, ay, aw, ah)
  g.restore()
  g.lineWidth = 3
  g.strokeStyle = metalFill(g, ax, ay, ax + aw, ay + ah, m)
  g.beginPath()
  g.roundRect(ax, ay, aw, ah, 10)
  g.stroke()
  g.strokeStyle = m[2]
  g.lineWidth = 2
  for (const [x, y, dx, dy] of [[ax + 12, ay + 12, 1, 1], [ax + aw - 12, ay + 12, -1, 1], [ax + 12, ay + ah - 12, 1, -1], [ax + aw - 12, ay + ah - 12, -1, -1]]) {
    g.beginPath()
    g.moveTo(x + dx * 26, y)
    g.lineTo(x, y)
    g.lineTo(x, y + dy * 26)
    g.stroke()
  }
  if (!earned) {
    tracked(g, 4)
    g.font = monoFont(15)
    const label = t('notYet').toUpperCase()
    const lw = g.measureText(label).width + 44
    chamferPath(g, W / 2 - lw / 2, ay + ah - 58, lw, 34, 9)
    g.fillStyle = 'rgba(8,9,30,.9)'
    g.fill()
    g.lineWidth = 1.5
    g.strokeStyle = m[1]
    g.stroke()
    g.fillStyle = m[2]
    centerText(g, label, W / 2 + 2, ay + ah - 41)
  }

  // text box: description, the milestone line, the tier ladder
  drawPlate(g, 48, 806, W - 96, 146, 16, m)
  tracked(g, 0)
  const desc = String(c.description || c.how || '')
  let ds = 22
  let dl = []
  for (; ds >= 14; ds--) {
    g.font = `italic 400 ${ds}px Georgia,'Times New Roman',serif`
    dl = wrapShareText(g, desc, W - 96 - 64)
    if (dl.length <= 2) break
  }
  ds = Math.max(ds, 14)
  dl = dl.slice(0, 3)
  g.fillStyle = '#E9EBFA'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  dl.forEach((line, i) => g.fillText(line, W / 2, 840 + (i - (dl.length - 1) / 2) * ds * 1.24))
  g.globalAlpha = 0.6
  g.lineWidth = 1
  g.strokeStyle = m[1]
  g.beginPath()
  g.moveTo(W / 2 - 210, 872.5)
  g.lineTo(W / 2 - 14, 872.5)
  g.moveTo(W / 2 + 14, 872.5)
  g.lineTo(W / 2 + 210, 872.5)
  g.stroke()
  g.globalAlpha = 1
  g.fillStyle = m[2]
  g.beginPath()
  g.moveTo(W / 2, 866)
  g.lineTo(W / 2 + 6.5, 872.5)
  g.lineTo(W / 2, 879)
  g.lineTo(W / 2 - 6.5, 872.5)
  g.closePath()
  g.fill()
  const stat = p.percent
    ? earned ? 'ALL GOALS MET' : `${Math.round(p.v)}% COMPLETE`
    : earned ? `${p.T.name} AT ${Number(p.milestone ?? p.v).toLocaleString()}  ·  NOW ${p.v.toLocaleString()}` : `${p.v.toLocaleString()} OF ${(p.next || 0).toLocaleString()} TO ${TIERS[0].name}`
  tracked(g, 1.5)
  let ss = 15
  for (; ss > 10; ss--) {
    g.font = monoFont(ss)
    if (g.measureText(stat.toUpperCase()).width <= W - 96 - 50) break
  }
  g.fillStyle = m[2]
  centerText(g, stat.toUpperCase(), W / 2, 893)
  tracked(g, 1)
  g.font = monoFont(12.5)
  const span = W - 96 - 36
  if (p.percent) {
    const word = earned ? 'ONE GOAL  ·  COMPLETE' : 'ONE GOAL'
    const ww = g.measureText(word).width + 40
    chamferPath(g, W / 2 - ww / 2, 908, ww, 27, 8)
    g.fillStyle = earned ? tierFill(g, key, W / 2 - ww / 2, 0, W / 2 + ww / 2, 0) : 'rgba(230,232,250,.12)'
    g.fill()
    g.fillStyle = earned ? '#080A24' : 'rgba(230,232,250,.6)'
    centerText(g, word, W / 2, 921.5)
  } else {
    TIERS.forEach((T, i) => {
      const cell = span / 5
      const cx = 48 + 18 + cell * (i + 0.5)
      if (earned && i === p.tier) {
        chamferPath(g, cx - cell / 2 + 4, 908, cell - 8, 27, 8)
        g.fillStyle = tierFill(g, i, cx - cell / 2, 0, cx + cell / 2, 0)
        g.fill()
        g.fillStyle = '#080A24'
      } else g.fillStyle = earned && i < p.tier ? T.color : 'rgba(230,232,250,.3)'
      centerText(g, T.name.toUpperCase(), cx, 921.5)
    })
  }

  // serial tab: the trophy's number in the catalog
  chamferPath(g, W / 2 - 66, H - 77, 132, 34, 9)
  g.fillStyle = '#090A28'
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = tierFill(g, key, W / 2 - 66, H - 77, W / 2 + 66, H - 43)
  g.stroke()
  tracked(g, 2.5)
  g.font = monoFont(15)
  g.fillStyle = m[2]
  centerText(g, serial, W / 2 + 1, H - 60)
  tracked(g, 0)
  drawGloss(g)
  g.restore()
}

// Ordered (Bayer) dither: fills square cells wherever density(x, y) beats the matrix, so a gradient becomes crisp pixels.
function ditherField(g, x0, y0, w, hh, cell, colour, density) {
  g.fillStyle = colour
  for (let y = 0; y * cell < hh; y++) {
    for (let x = 0; x * cell < w; x++) {
      if ((BAYER4[y & 3][x & 3] + 0.5) / 16 < density(x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell)) g.fillRect(x0 + x * cell, y0 + y * cell, cell - 1, cell - 1)
    }
  }
}

// A wreath of two branches tied at the foot: paired leaves with a midrib, tapering toward the tips.
function drawLaurel(g, cx, cy, R, n, len, m) {
  g.lineCap = 'round'
  for (const side of [1, -1]) {
    g.beginPath()
    g.arc(cx, cy, R, ((90 + side * 10) * Math.PI) / 180, ((90 + side * 164) * Math.PI) / 180, side < 0)
    g.lineWidth = Math.max(1.5, len * 0.07)
    g.strokeStyle = m[1]
    g.stroke()
    for (let k = 0; k < n; k++) {
      const phi = ((90 + side * (15 + (k * 147) / (n - 1))) * Math.PI) / 180
      const tan = phi + (side * Math.PI) / 2
      const size = len * (k < 1 ? 0.78 : 1 - 0.42 * Math.pow(k / (n - 1), 1.6))
      for (const [rot, L] of [[tan - side * 0.5, size], [tan + side * 0.62, size * 0.8]]) {
        const w = L * 0.24
        g.save()
        g.translate(cx + R * Math.cos(phi), cy + R * Math.sin(phi))
        g.rotate(rot)
        g.beginPath()
        g.moveTo(0, 0)
        g.quadraticCurveTo(L * 0.42, -w * 1.25, L, 0)
        g.quadraticCurveTo(L * 0.42, w * 1.25, 0, 0)
        const lg = g.createLinearGradient(0, -w, 0, w)
        lg.addColorStop(0, m[2])
        lg.addColorStop(0.48, m[1])
        lg.addColorStop(1, m[0])
        g.fillStyle = lg
        g.fill()
        g.lineWidth = 1
        g.strokeStyle = 'rgba(5,6,30,.7)'
        g.stroke()
        g.beginPath()
        g.moveTo(L * 0.1, 0)
        g.lineTo(L * 0.84, 0)
        g.strokeStyle = 'rgba(5,6,30,.32)'
        g.stroke()
        g.restore()
      }
    }
  }
  // the tie
  const ty = cy + R
  g.fillStyle = m[1]
  g.strokeStyle = 'rgba(5,6,30,.7)'
  g.lineWidth = 1
  for (const side of [1, -1]) {
    g.beginPath()
    g.moveTo(cx, ty)
    g.quadraticCurveTo(cx + side * len * 0.5, ty - len * 0.34, cx + side * len * 0.62, ty + len * 0.1)
    g.quadraticCurveTo(cx + side * len * 0.4, ty + len * 0.22, cx, ty)
    g.fill()
    g.stroke()
  }
  g.beginPath()
  g.arc(cx, ty, len * 0.13, 0, Math.PI * 2)
  g.fillStyle = m[2]
  g.fill()
  g.stroke()
}

// One of Hermes' wings: an arm sweeping out and up, with three rows of feathers hung from it.
function drawWing(g, x, y, dir, len, m, tilt = 0) {
  g.save()
  g.translate(x, y)
  g.scale(dir, 1)
  g.rotate(tilt)
  const arm = t => [len * (0.06 + 0.62 * t), -len * (0.34 * Math.sin(t * 1.35) + 0.02)]
  const feather = (t, ang, L, w, tone) => {
    const [ax, ay] = arm(t)
    g.save()
    g.translate(ax, ay)
    g.rotate(ang)
    g.beginPath()
    g.moveTo(0, -w * 0.5)
    g.bezierCurveTo(L * 0.35, -w * 0.9, L * 0.82, -w * 0.7, L, 0)
    g.bezierCurveTo(L * 0.8, w * 0.75, L * 0.3, w * 0.8, 0, w * 0.5)
    g.closePath()
    const fg = g.createLinearGradient(0, -w, 0, w)
    fg.addColorStop(0, m[2])
    fg.addColorStop(0.5, tone ? m[2] : m[1])
    fg.addColorStop(1, tone ? m[1] : m[0])
    g.fillStyle = fg
    g.fill()
    g.lineWidth = 1
    g.strokeStyle = 'rgba(5,6,30,.78)'
    g.stroke()
    g.beginPath()
    g.moveTo(L * 0.1, 0)
    g.lineTo(L * 0.86, 0)
    g.strokeStyle = 'rgba(5,6,30,.24)'
    g.stroke()
    g.restore()
  }
  // flight feathers from the tip inward, each lying over the one outside it
  for (let i = 0; i < 9; i++) {
    const t = 1 - i / 8.6
    feather(t, 0.08 + (1 - t) * 1.2, len * (0.36 + 0.34 * Math.pow(t, 0.8)), len * 0.075, 0)
  }
  for (let i = 0; i < 8; i++) {
    const t = 0.96 - i / 8.2
    feather(t, 0.22 + (1 - t) * 1.15, len * (0.2 + 0.14 * t), len * 0.066, 1)
  }
  for (let i = 0; i < 7; i++) {
    const t = 0.92 - i / 7.6
    feather(t, 0.4 + (1 - t) * 1.05, len * 0.13, len * 0.058, 1)
  }
  // the arm itself, laid over the roots
  g.beginPath()
  for (let i = 0; i <= 20; i++) {
    const [ax, ay] = arm(i / 20)
    if (i) g.lineTo(ax, ay - len * 0.012)
    else g.moveTo(ax, ay)
  }
  for (let i = 20; i >= 0; i--) {
    const [ax, ay] = arm(i / 20)
    g.lineTo(ax, ay + len * (0.03 + 0.05 * (1 - i / 20)))
  }
  g.closePath()
  const ag = g.createLinearGradient(0, -len * 0.4, 0, len * 0.1)
  ag.addColorStop(0, m[2])
  ag.addColorStop(1, m[1])
  g.fillStyle = ag
  g.fill()
  g.strokeStyle = 'rgba(5,6,30,.78)'
  g.stroke()
  g.restore()
}

// The back is the same for every trophy: the house name on a cut gem, inside a woven ring and a laurel wreath.
function drawCardBack(g, wings = 'none') {
  const W = CARD_W, H = CARD_H
  const m = CARD_METALS[1]
  const cx = W / 2, cy = 498
  g.save()
  g.beginPath()
  g.roundRect(0, 0, W, H, 34)
  g.clip()
  g.fillStyle = '#070818'
  g.fillRect(0, 0, W, H)
  drawCardBand(g, 'back', m, 7)
  drawCardPanel(g, false, cy)
  // halftone rising from the foot of the card
  g.save()
  g.beginPath()
  g.roundRect(31, 31, W - 62, H - 62, 12)
  g.clip()
  const floor = g.createLinearGradient(0, 760, 0, H - 30)
  floor.addColorStop(0, 'rgba(60,72,255,0)')
  floor.addColorStop(1, 'rgba(60,72,255,.42)')
  g.fillStyle = floor
  g.fillRect(30, 760, W - 60, H - 790)
  ditherField(g, 32, 720, W - 64, 290, 4, 'rgba(96,110,255,.3)', (x, y) => Math.pow(Math.max(0, (y - 720) / 290), 2.4) * 0.8)
  g.restore()
  drawLaurel(g, cx, cy, 304, 19, 50, m)
  if (wings !== 'none') {
    const [len, tilt, wy] = wings === 'raised' ? [128, -0.5, 150] : wings === 'small' ? [96, 0, 134] : [150, 0, 128]
    drawWing(g, cx + 10, wy, 1, len, m, tilt)
    drawWing(g, cx - 10, wy, -1, len, m, tilt)
    g.beginPath()
    g.arc(cx, wy - 4, 15, 0, Math.PI * 2)
    g.fillStyle = '#0A0C3A'
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = metalFill(g, cx - 15, wy - 19, cx + 15, wy + 11, m)
    g.stroke()
    g.beginPath()
    g.arc(cx, wy - 4, 6, 0, Math.PI * 2)
    g.fillStyle = m[2]
    g.fill()
  }
  drawPlate(g, cx - 214, 880, 428, 46, 12, m)
  tracked(g, 5)
  g.font = monoFont(13)
  g.fillStyle = '#FFFFFF'
  centerText(g, 'EARNED IN REAL HERMES WORK', cx + 2, 903)
  tracked(g, 0)
  const silver = metalFill(g, cx - 300, cy - 300, cx + 300, cy + 300, m)
  const ring = (rad, width, style) => {
    g.beginPath()
    g.arc(cx, cy, rad, 0, Math.PI * 2)
    g.lineWidth = width
    g.strokeStyle = style
    g.stroke()
  }
  g.beginPath()
  g.arc(cx, cy, 276, 0, Math.PI * 2)
  g.fillStyle = 'rgba(6,7,34,.62)'
  g.fill()
  ring(276, 4, silver)
  ring(266, 1, 'rgba(255,255,255,.35)')
  // two strands woven over and under each other
  const blue = g.createLinearGradient(cx - 260, cy - 260, cx + 260, cy + 260)
  blue.addColorStop(0, '#9FB0FF')
  blue.addColorStop(0.5, '#2B36E6')
  blue.addColorStop(1, '#7C8CFF')
  const strand = (sign, a0, a1, style) => {
    g.beginPath()
    for (let a = a0, first = true; a <= a1 + 1e-6; a += 0.012, first = false) {
      const rad = 236 + sign * 15 * Math.sin(9 * a)
      if (first) g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
      else g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
    }
    g.lineJoin = 'round'
    g.lineWidth = 13
    g.strokeStyle = 'rgba(4,5,26,.92)'
    g.stroke()
    g.lineWidth = 8
    g.strokeStyle = style
    g.stroke()
  }
  strand(1, 0, Math.PI * 2, silver)
  strand(-1, 0, Math.PI * 2, blue)
  for (let k = 0; k < 18; k += 2) strand(1, (k * Math.PI) / 9 - 0.14, (k * Math.PI) / 9 + 0.14, silver)
  ring(204, 3, silver)
  // the gem: a bevelled pentagon lit from the upper left
  const vert = (rad, i) => [cx + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 5) * rad, cy + 6 + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 5) * rad]
  const facet = ['#C9D3FF', '#5E6DCB', '#3A479E', '#7888DE', '#FFFFFF']
  for (let i = 0; i < 5; i++) {
    const a = vert(192, i), b = vert(192, (i + 1) % 5), c = vert(150, (i + 1) % 5), d = vert(150, i)
    g.beginPath()
    g.moveTo(a[0], a[1])
    g.lineTo(b[0], b[1])
    g.lineTo(c[0], c[1])
    g.lineTo(d[0], d[1])
    g.closePath()
    g.fillStyle = facet[i]
    g.fill()
    g.beginPath()
    g.moveTo(a[0], a[1])
    g.lineTo(b[0], b[1])
    g.lineTo(d[0], d[1])
    g.closePath()
    g.fillStyle = 'rgba(255,255,255,.2)'
    g.fill()
    g.lineWidth = 1
    g.strokeStyle = 'rgba(255,255,255,.75)'
    g.stroke()
  }
  g.beginPath()
  for (let i = 0; i < 5; i++) {
    const p = vert(150, i)
    if (i) g.lineTo(p[0], p[1])
    else g.moveTo(p[0], p[1])
  }
  g.closePath()
  const well = g.createLinearGradient(0, cy - 150, 0, cy + 140)
  well.addColorStop(0, '#070824')
  well.addColorStop(1, '#161D78')
  g.fillStyle = well
  g.fill()
  g.lineWidth = 1.5
  g.strokeStyle = '#FFFFFF'
  g.stroke()
  g.beginPath()
  for (let i = 0; i < 5; i++) {
    const p = vert(192, i)
    if (i) g.lineTo(p[0], p[1])
    else g.moveTo(p[0], p[1])
  }
  g.closePath()
  g.lineWidth = 2.5
  g.strokeStyle = silver
  g.stroke()
  // the name
  const ink = g.createLinearGradient(0, cy - 90, 0, cy + 80)
  ink.addColorStop(0, '#FFFFFF')
  ink.addColorStop(0.5, m[1])
  ink.addColorStop(0.54, m[2])
  ink.addColorStop(1, m[1])
  g.fillStyle = ink
  g.shadowColor = 'rgba(0,0,10,.85)'
  g.shadowOffsetY = 2
  tracked(g, 9)
  g.font = cardFont(24)
  centerText(g, 'HERMES', cx + 4, cy - 66)
  tracked(g, 2)
  g.font = cardFont(50)
  centerText(g, 'TROPHY', cx + 1, cy - 14)
  centerText(g, 'ROOM', cx + 1, cy + 36)
  g.shadowColor = 'transparent'
  g.shadowOffsetY = 0
  g.globalAlpha = 0.7
  g.fillStyle = m[1]
  g.fillRect(cx - 62, cy + 74, 124, 1)
  g.globalAlpha = 1
  tracked(g, 4)
  g.font = monoFont(10.5)
  g.fillStyle = m[1]
  centerText(g, 'ACHIEVEMENTS', cx + 2, cy + 92)
  tracked(g, 0)
  drawGloss(g)
  g.restore()
}

const loadImage = uri => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Artwork unavailable'))
  img.src = uri
})

// The trophy's own picture when it has one, else the engraved placeholder.
async function loadTrophyArt(c) {
  let src = placeholderUri(c.id, c.glyph, false)
  let ids = queryClient.getQueryData(KEY_ART_INDEX)?.ids
  if (!ids) ids = await queryClient.fetchQuery({ queryKey: KEY_ART_INDEX, queryFn: () => rest('/art-index'), staleTime: 5 * 60 * 1000 }).then(r => r?.ids).catch(() => null)
  if (ids?.includes(c.id)) {
    try {
      const art = await artFetch(c.id)
      if (art?.uri) src = art.uri
    } catch { /* Keep the engraved placeholder when artwork is unavailable. */ }
  }
  try { return await loadImage(src) } catch { return loadImage(placeholderUri(c.id, c.glyph, false)) }
}

const cardSerial = id => {
  const i = currentState()?.catalog?.findIndex(c => c.id === id) ?? -1
  return `TR-${String(i + 1).padStart(3, '0')}`
}

async function renderTrophyCard(c, pr, { side = 'front', scale = 1, serial, wings } = {}) {
  // The wordmark face is only fetched on first use; ask for it so the canvas does not draw the fallback.
  await Promise.all([guard(() => document.fonts.load(cardFont(40), 'TROPHY')), guard(() => document.fonts.load(monoFont(14), 'TR'))]).catch(() => {})
  const cv = document.createElement('canvas')
  cv.width = Math.round(CARD_W * scale)
  cv.height = Math.round(CARD_H * scale)
  const g = cv.getContext('2d')
  if (!g) throw new Error('Canvas unavailable')
  g.scale(scale, scale)
  if (side === 'back') {
    drawCardBack(g, wings)
    return cv
  }
  const p = achievementPresentation(c, pr)
  const img = await loadTrophyArt(c)
  drawCardFront(g, { c, p, art: p.earned ? gradedShareArt(img, p.tier) : img, serial: serial || cardSerial(c.id) })
  return cv
}

// canvas.toBlob waits for idle time, which a page full of animation rarely has (seconds, not milliseconds).
// An OffscreenCanvas encodes straight away, so copy across when there is one.
const canvasBlob = cv => {
  if (typeof OffscreenCanvas === 'function') {
    const done = guard(() => {
      const off = new OffscreenCanvas(cv.width, cv.height)
      off.getContext('2d').drawImage(cv, 0, 0)
      return off.convertToBlob({ type: 'image/png' })
    })
    if (done) return done
  }
  return new Promise((resolve, reject) => cv.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'))
}

// One shared picture of the back; revoked when the plugin is disposed.
const CARD_BACK = { url: null, pending: null }
function cardBackUrl() {
  if (CARD_BACK.url) return Promise.resolve(CARD_BACK.url)
  if (!CARD_BACK.pending)
    CARD_BACK.pending = renderTrophyCard(null, null, { side: 'back' })
      .then(canvasBlob)
      .then(b => (CARD_BACK.url = URL.createObjectURL(b)))
      .catch(() => null)
      .finally(() => { CARD_BACK.pending = null })
  return CARD_BACK.pending
}
function disposeCardBack() {
  if (CARD_BACK.url) guard(() => URL.revokeObjectURL(CARD_BACK.url))
  CARD_BACK.url = null
}

// The post image: the card on a cobalt stage beside the facts, sized for a timeline.
function drawSharePost(g, c, pr, p, card) {
  const W = 1600, H = 900
  const m = CARD_METALS[p.tier]
  const accent = (x0, x1) => tierFill(g, p.tier, x0, 0, x1, 0)
  const ch = 760, cw = (ch * CARD_W) / CARD_H, cx = 118, cy = 70
  const mx = cx + cw / 2, my = cy + ch / 2
  g.fillStyle = '#060716'
  g.fillRect(0, 0, W, H)
  const bg = g.createRadialGradient(mx, my, 80, mx, my, 1250)
  bg.addColorStop(0, '#1A22B8')
  bg.addColorStop(0.4, '#0B0E50')
  bg.addColorStop(1, '#060716')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // a dithered halo in the tier's colour behind the card, and a dithered floor
  const halo = p.tier === 4 ? '#B79CFF' : m[1]
  ditherField(g, 0, 0, 1000, H, 6, `${halo}66`, (x, y) => Math.pow(Math.max(0, 1 - Math.hypot(x - mx, (y - my) * 0.86) / 600), 1.7) * 0.9)
  ditherField(g, 0, H - 220, W, 220, 6, 'rgba(128,140,255,.3)', (x, y) => Math.pow(Math.max(0, (y - (H - 220)) / 220), 1.8) * 0.85)
  // frame: the key runs all the way round
  g.save()
  g.globalAlpha = 0.85
  g.strokeStyle = tierFill(g, p.tier, 0, 0, W, H)
  g.lineWidth = 2
  g.lineJoin = 'miter'
  meanderRing(g, 30, 30, W - 60, H - 60, 30, 30, 15)
  g.beginPath()
  g.roundRect(14, 14, W - 28, H - 28, 40)
  g.stroke()
  g.restore()

  g.save()
  g.shadowColor = 'rgba(0,0,14,.8)'
  g.shadowBlur = 50
  g.shadowOffsetY = 24
  g.drawImage(card, cx, cy, cw, ch)
  g.restore()

  const x = 760, w = 760
  tracked(g, 5)
  g.font = monoFont(21)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = accent(x, x + 420)
  g.fillText('TROPHY UNLOCKED', x, 136)
  tracked(g, 2)
  g.font = monoFont(16, 500)
  g.fillStyle = '#B9C2DE'
  g.textAlign = 'right'
  g.fillText((pr?.unlocked_at ? `Earned ${fmtDate(pr.unlocked_at)}` : 'Earned with Hermes').toUpperCase(), x + w, 136)
  g.textAlign = 'left'
  tracked(g, 1)
  const title = fitTitle(g, String(c.name).toUpperCase(), w, 96, 68, 30)
  g.fillStyle = '#F8F9FF'
  let y = 156
  for (const line of title.lines) {
    y += title.size * 0.94
    g.fillText(line, x, y)
  }
  y += 34
  // tier line
  g.save()
  g.translate(x, y)
  g.lineWidth = 2
  g.strokeStyle = accent(x, x + 60)
  g.fillStyle = 'rgba(8,9,34,.8)'
  chamferPath(g, 0, 0, 60, 60, 10)
  g.fill()
  g.stroke()
  g.translate(9, 9)
  g.scale(1.75, 1.75)
  g.lineWidth = 1.5
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = m[2]
  g.stroke(new Path2D(TIER_EMBLEMS[p.tier]))
  g.restore()
  tracked(g, 2)
  g.font = cardFont(44)
  g.fillStyle = accent(x + 80, x + 420)
  g.textBaseline = 'middle'
  g.fillText(p.T.name.toUpperCase(), x + 80, y + 24)
  tracked(g, 3)
  g.font = monoFont(15, 500)
  g.fillStyle = '#AEB9D6'
  g.fillText(p.percent ? 'ONE GOAL' : `TIER ${['I', 'II', 'III', 'IV', 'V'][p.tier]} OF V`, x + 82, y + 54)
  y += 96
  // description, shrunk until it clears the stat plate
  tracked(g, 0)
  const boxY = 596
  let ds = 27
  let dl = []
  for (; ds >= 16; ds--) {
    g.font = `400 ${ds}px "Segoe UI",system-ui,Arial,sans-serif`
    dl = wrapShareText(g, String(c.description || ''), w)
    if (y + dl.length * ds * 1.4 <= boxY - 24) break
  }
  g.fillStyle = '#D3D9F0'
  g.textBaseline = 'top'
  dl.forEach((line, i) => g.fillText(line, x, y + i * Math.max(ds, 16) * 1.4))

  // stat plate, framed like the plates on the card
  drawPlate(g, x, boxY, w, 150, 18, m)
  tracked(g, 3)
  g.font = monoFont(15)
  g.fillStyle = '#AEB9D6'
  g.textBaseline = 'alphabetic'
  g.fillText(p.percent ? 'ACHIEVEMENT COMPLETE' : 'UNLOCKED AT', x + 34, boxY + 44)
  tracked(g, 1)
  const big = p.percent ? 'ALL GOALS MET' : Number(p.milestone ?? p.v).toLocaleString()
  let bs = 78
  for (; bs > 30; bs -= 2) {
    g.font = cardFont(bs)
    if (g.measureText(big).width <= (p.percent ? w - 70 : w * 0.52)) break
  }
  g.fillStyle = '#FFFFFF'
  g.fillText(big, x + 34, boxY + 118)
  if (!p.percent) {
    g.globalAlpha = 0.4
    g.fillStyle = m[1]
    g.fillRect(x + w * 0.6, boxY + 26, 1, 98)
    g.globalAlpha = 1
    tracked(g, 3)
    g.font = monoFont(15)
    g.fillStyle = '#AEB9D6'
    g.fillText('CURRENT TOTAL', x + w * 0.6 + 28, boxY + 44)
    tracked(g, 1)
    const now = p.v.toLocaleString()
    let ns = 50
    for (; ns > 22; ns -= 2) {
      g.font = cardFont(ns)
      if (g.measureText(now).width <= w * 0.4 - 62) break
    }
    g.fillStyle = '#DDE3F8'
    g.fillText(now, x + w * 0.6 + 28, boxY + 112)
  }
  // tier ladder
  tracked(g, 1.5)
  g.font = monoFont(14)
  if (!p.percent)
    TIERS.forEach((T, i) => {
      const sx = x + i * (w / 5)
      g.fillStyle = i <= p.tier ? tierFill(g, i, sx, 0, sx + w / 5 - 12, 0) : 'rgba(255,255,255,.14)'
      g.fillRect(sx, 782, w / 5 - 12, 5)
      g.fillStyle = i === p.tier ? '#FFFFFF' : i < p.tier ? '#B9C2DE' : '#5F6A8C'
      g.fillText(T.name.toUpperCase(), sx, 812)
    })
  tracked(g, 0)
}

// kind 'post' is the 1600 x 900 timeline image; 'card' is the card alone at twice its layout size.
async function createShareImage(c, pr, kind = 'post') {
  const p = achievementPresentation(c, pr)
  if (!p.earned || !p.T) throw new Error('Only earned trophies can be shared')
  const card = await renderTrophyCard(c, pr, { scale: kind === 'card' ? 2 : 1 })
  let cv = card
  if (kind !== 'card') {
    cv = document.createElement('canvas')
    cv.width = 1600
    cv.height = 900
    const g = cv.getContext('2d')
    if (!g) throw new Error('Canvas unavailable')
    drawSharePost(g, c, pr, p, card)
  }
  const blob = await canvasBlob(cv)
  return { blob, filename: `${c.id}-${p.T.name.toLowerCase()}${kind === 'card' ? '-card' : ''}.png`, width: cv.width, height: cv.height }
}

function SharePreview({ c, pr, onBack }) {
  const [kind, setKind] = useState('post')
  const [image, setImage] = useState(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false, url
    setImage(null)
    setStatus('')
    createShareImage(c, pr, kind).then(result => {
      if (disposed) return
      url = URL.createObjectURL(result.blob)
      setImage({ ...result, url })
    }).catch(() => { if (!disposed) setStatus(t('shareFailed')) })
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [c.id, c.name, c.description, pr?.state, pr?.tier, pr?.value, pr?.unlocked_at, attempt, kind])
  const file = image && new File([image.blob], image.filename, { type: 'image/png' })
  // Hermes Desktop refuses image writes to the clipboard for its own window (only text goes through its bridge),
  // so ask first and leave the button out where it could never work. Browsers, the web app included, allow it.
  const [copyDenied, setCopyDenied] = useState(false)
  useEffect(() => {
    let dead = false
    guard(() => navigator.permissions?.query({ name: 'clipboard-write' }).then(p => { if (!dead && p.state === 'denied') setCopyDenied(true) }, () => {}))
    return () => { dead = true }
  }, [])
  const canCopy = !copyDenied && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  const canShare = !!file && typeof navigator.share === 'function' && !!guard(() => navigator.canShare?.({ files: [file] }))
  const copy = async () => {
    if (!image || busy) return
    setBusy(true)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })])
      setStatus(t('imageCopied'))
    } catch { setStatus(t('imageCopyFailed')); setCopyDenied(true) } finally { setBusy(false) }
  }
  const share = async () => {
    if (!file || busy) return
    setBusy(true)
    try {
      await navigator.share({ files: [file], title: c.name, text: `${c.name} - ${TIERS[pr.tier].name}. Hermes Trophy Room.` })
      setStatus(t('imageShared'))
    } catch (error) { setStatus(t(error?.name === 'AbortError' ? 'shareCanceled' : 'imageShareFailed')) } finally { setBusy(false) }
  }
  return h('div', { className: 'tr-share-pane' },
    h('div', { className: 'tr-share-head' }, h('div', null, h('h4', null, t('sharePreview')), h('p', null, c.name)), h(Button, { variant: 'ghost', size: 'sm', onClick: onBack }, t('backToTrophy'))),
    h('div', { className: 'tr-share-kind' }, h(SegmentedControl, { sizing: 'content', value: kind, onChange: setKind, options: [{ id: 'post', label: t('shareKindPost') }, { id: 'card', label: t('shareKindCard') }] })),
    h('div', { className: 'tr-share-frame', 'data-kind': kind },
      image ? h('img', { className: 'tr-share-image', src: image.url, alt: `${c.name}, ${TIERS[pr.tier].name} trophy share image`, width: image.width, height: image.height }) : h('div', { className: 'tr-share-loading', role: 'status' }, status || t('sharePreparing'))),
    h('div', { className: 'tr-share-actions' },
      h(Button, { variant: 'default', size: 'sm', disabled: !image || busy, onClick: () => {
        if (!image) return
        const link = document.createElement('a')
        link.href = image.url
        link.download = image.filename
        link.click()
        setStatus(t('downloadRequested'))
      } }, t('savePNG')),
      canCopy && h(Button, { variant: 'outline', size: 'sm', disabled: !image || busy, onClick: copy }, t('copyImage')),
      canShare && h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: share }, t('shareImage')),
      !image && status && h(Button, { variant: 'outline', size: 'sm', onClick: () => setAttempt(n => n + 1) }, t('retry')),
      h('span', { className: 'tr-share-format' }, image ? `PNG / ${image.width} x ${image.height}` : 'PNG')
    ),
    h('p', { className: 'tr-share-status', role: 'status', 'aria-live': 'polite' }, status || t('shareReady'))
  )
}

// The card in the detail view: tilts and shimmers under the pointer, and turns over on click.
function TrophyCard({ c, pr, secret, flipped, onFlip, onReady, dither = true }) {
  const [front, setFront] = useState(null)
  const [back, setBack] = useState(null)
  const [shown, setShown] = useState({})
  const frontRef = useRef(null)
  const backRef = useRef(null)
  const tier = pr?.state === 'unlocked' ? pr.tier ?? -1 : -1
  // Redraw only when what the card shows changes (a state refetch hands us new objects with the same content),
  // and keep the old picture up until the new one is ready.
  const frontUrl = useRef(null)
  useEffect(() => {
    let dead = false
    if (secret) return undefined
    renderTrophyCard(c, pr)
      .then(canvasBlob)
      .then(b => {
        if (dead) return
        const old = frontUrl.current
        frontUrl.current = URL.createObjectURL(b)
        setFront(frontUrl.current)
        if (old) URL.revokeObjectURL(old)
      })
      .catch(() => {})
    return () => {
      dead = true
    }
  }, [c.id, c.name, c.description, secret, pr?.state, pr?.tier, pr?.value])
  useEffect(() => () => {
    if (frontUrl.current) URL.revokeObjectURL(frontUrl.current)
  }, [])
  useEffect(() => {
    let dead = false
    void cardBackUrl().then(u => { if (!dead) setBack(u) })
    return () => { dead = true }
  }, [])
  const ready = !!front && !!back && shown.front === front && shown.back === back
  useEffect(() => { if (ready) onReady?.() }, [ready, onReady])
  const face = (side, src, ref, live) =>
    h('div', { className: `tr-tc-face tr-tc-${side}`, 'aria-hidden': live ? undefined : true },
      h('div', { className: 'tr-tc-tilt' },
        src
          ? h('img', { ref, className: 'tr-tc-img', src, alt: side === 'back' ? t('cardBackAlt') : t('cardAlt', c.name, tier >= 0 ? TIERS[tier].name : t('notYet')), draggable: false, onLoad: () => setShown(s => ({ ...s, [side]: src })) })
          : h('div', { className: 'tr-tc-wait' }),
        src && live && shown[side] === src && h(TrophyFxCanvas, { src, imgRef: ref, tier: side === 'back' && tier < 0 ? 1 : tier, holo: tier >= 3, contain: true, pregraded: true, burstOnMount: dither && side === 'front' && tier >= 0, dither, seed: hash(c.id) })
      )
    )
  const key = e => {
    if (!onFlip || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onFlip()
  }
  return h('div', { className: 'tr-tc', 'data-flipped': flipped ? '' : undefined, 'data-tier': tier >= 0 ? tier : undefined, role: onFlip ? 'button' : undefined, tabIndex: onFlip ? 0 : undefined, 'aria-label': onFlip ? t(flipped ? 'showFront' : 'flipCard') : undefined, onClick: onFlip, onKeyDown: key },
    h('div', { className: 'tr-tc-inner' }, face('front', front, frontRef, !flipped), face('back', back, backRef, !!flipped))
  )
}

function useTrophyModalPause(galleryRef) {
  useLayoutEffect(() => {
    FX_ENGINE.modalDepth++
    for (const slot of [...FX_ENGINE.slots]) if (!slot.priority) parkFxSlot(slot)
    const pages = galleryRef?.current ? [galleryRef.current] : [...GALLERY_ROOTS]
    const animations = pages.flatMap(page => page.getAnimations?.({ subtree: true }) || [])
      .filter(a => a.playState === 'running' && a.effect?.target?.closest?.('.tr-head, .tr-grid'))
    for (const animation of animations) {
      MODAL_ANIMATIONS.add(animation)
      animation.pause()
    }
    for (const page of pages) page.setAttribute('data-modal-paused', '')
    return () => {
      FX_ENGINE.modalDepth = Math.max(0, FX_ENGINE.modalDepth - 1)
      if (!FX_ENGINE.modalDepth) {
        for (const page of GALLERY_ROOTS) page.removeAttribute('data-modal-paused')
        for (const animation of MODAL_ANIMATIONS) if (animation.playState === 'paused') animation.play()
        MODAL_ANIMATIONS.clear()
      }
      wakeFxEngine()
    }
  }, [])
}

function useTrophyReveal(ids, initial = {}, animate = true) {
  const [flipped, setFlipped] = useState(() => {
    const reveal = animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return Object.fromEntries(ids.map(id => [id, initial[id] ?? reveal]))
  })
  const queue = useRef({ order: ids, pending: new Set(ids.filter(id => animate && flipped[id] && initial[id] !== true)), ready: new Set(), timer: null, active: null, nextAt: 0, started: false, disposed: false })
  const advance = useCallback(() => {
    const q = queue.current
    if (q.disposed || q.timer !== null) return
    const id = q.order.find(key => q.pending.has(key))
    if (!id || !q.ready.has(id)) return
    q.active = id
    q.timer = setTimeout(() => {
      q.timer = null
      q.active = null
      if (q.disposed) return
      q.pending.delete(id)
      q.ready.delete(id)
      q.started = true
      q.nextAt = performance.now() + 800
      setFlipped(old => ({ ...old, [id]: false }))
      advance()
    }, q.started ? Math.max(0, q.nextAt - performance.now()) : 360)
  }, [])
  const stop = useCallback(id => {
    const q = queue.current
    q.pending.delete(id)
    q.ready.delete(id)
    if (q.active === id) {
      clearTimeout(q.timer)
      q.timer = null
      q.active = null
    }
    advance()
  }, [advance])
  const onReady = useCallback(id => {
    queue.current.ready.add(id)
    advance()
  }, [advance])
  const toggle = useCallback(id => {
    stop(id)
    setFlipped(old => ({ ...old, [id]: !old[id] }))
  }, [stop])
  useEffect(() => {
    const q = queue.current
    q.disposed = false
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reduce = () => {
      if (!media?.matches) return
      const waiting = [...q.pending]
      waiting.forEach(stop)
      if (waiting.length) setFlipped(old => ({ ...old, ...Object.fromEntries(waiting.map(id => [id, false])) }))
    }
    reduce()
    advance()
    media?.addEventListener('change', reduce)
    return () => {
      q.disposed = true
      clearTimeout(q.timer)
      q.timer = null
      q.active = null
      media?.removeEventListener('change', reduce)
    }
  }, [stop, advance])
  return [flipped, toggle, onReady, stop]
}

function AwayTile({ item, flipped, onFlip, onFull, onReady }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (ready || !ref.current) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setReady(true)
        observer.disconnect()
      }
    }, { rootMargin: '100px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ready])
  const { c, pr } = item
  return h('article', { className: 'tr-away-tile', 'data-away-id': c.id, 'data-tier': pr.tier },
    h('div', { ref, className: 'tr-dlg-col tr-away-card-col' }, ready && h(TrophyCard, { c, pr, flipped, onFlip, onReady })),
    h('div', { className: 'tr-away-caption' }, h('h5', null, c.name), h('span', { style: { '--c': TIERS[pr.tier].color } }, h(TierGlyph, { tier: pr.tier }), TIERS[pr.tier].name)),
    h('div', { className: 'tr-away-actions' },
      h('button', { type: 'button', className: 'tr-flip-btn', onClick: onFull }, t('fullView')),
      h('button', { type: 'button', className: 'tr-flip-btn', 'aria-pressed': flipped, onClick: onFlip }, t(flipped ? 'showFront' : 'flipCard'))
    )
  )
}

function TrophyDialogClose({ onClose }) {
  return h(Button, { variant: 'ghost', size: 'sm', className: 'tr-dialog-close', 'aria-label': t('close'), onClick: onClose },
    h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M6 6l12 12M18 6 6 18' }))
  )
}

function AwayCollection({ view }) {
  const [selected, setSelected] = useState(null)
  const [flipped, toggleFlip, revealReady, stopReveal] = useTrophyReveal(view.items.map(item => item.c.id))
  useTrophyModalPause()
  useEffect(() => {
    if (!view.markSeen || view.acknowledged || view.scope !== awayScope()) return
    view.acknowledged = true
    for (const { pr } of view.items) R.delivered.add(dkey(pr))
    const ctx = R.ctx
    void post('/seen', { ids: view.items.map(item => item.c.id) }).then(() => {
      if (R.ctx === ctx && view.scope === awayScope()) void queryClient.invalidateQueries({ queryKey: KEY_STATE })
    })
  }, [view])
  const close = () => $awayView.set(null)
  const chosen = view.items.find(item => item.c.id === selected)
  if (chosen) return h(Detail, { key: chosen.c.id, ...chosen, initialFull: true, initialFlipped: !!flipped[chosen.c.id], onBack: () => setSelected(null), onClose: () => setSelected(null) })
  const body = h('div', { className: 'tr-away-shell' },
    h(Css),
    h('header', { className: 'tr-away-heading' },
      h('div', { className: 'tr-eyebrow' }, t(view.recent ? 'recentEyebrow' : 'awayTitle')),
      h('h4', null, view.recent ? t('recentTitle') : view.items.length ? t('awayCount', view.items.length) : t('awayEmpty')),
      h('p', null, t(view.items.length ? 'awayHelp' : 'awayEmptyHelp'))
    ),
    h('div', { className: 'tr-away-grid' }, view.items.map(item => h(AwayTile, {
      key: item.c.id, item, flipped: !!flipped[item.c.id],
      onFlip: () => toggleFlip(item.c.id),
      onReady: () => revealReady(item.c.id),
      onFull: () => { stopReveal(item.c.id); setSelected(item.c.id) }
    }))),
    h('footer', { className: 'tr-away-footer' },
      !view.items.length && recentTrophies(currentState() || {}).length > 0 && h(Button, { variant: 'outline', size: 'sm', onClick: () => openAway(recentTrophies(currentState() || {}), false, true) }, t('viewRecent')),
      h(Button, { variant: 'outline', size: 'sm', className: 'tr-away-close', onClick: close }, t('close'))
    )
  )
  if (!Dialog || !DialogContent) return h('div', { className: 'tr-inline tr-away-inline', role: 'dialog', 'aria-label': t(view.recent ? 'recentTitle' : 'awayTitle') }, body)
  const head = DialogHeader && DialogTitle && DialogDescription ? h(DialogHeader, { className: 'sr-only' }, h(DialogTitle, null, t(view.recent ? 'recentTitle' : 'awayTitle')), h(DialogDescription, null, t('awayHelp'))) : null
  return h(Dialog, { open: true, onOpenChange: open => !open && close() }, h(DialogContent, { className: 'tr-dialog tr-away-dialog', bodyClassName: 'tr-dialog-body p-0 gap-0', showCloseButton: false, chrome: h(TrophyDialogClose, { onClose: close }), style: { width: 1040, maxWidth: '94vw', padding: 0, overflow: 'hidden' } }, head, body))
}

function AwayHost({ inline = false }) {
  const id = useRef(0)
  if (!id.current) id.current = ++MOUNT_N
  const view = useValue($awayView)
  const hosts = useValue($awayHosts)
  useLayoutEffect(() => {
    if ((!Dialog || !DialogContent) && !inline) return undefined
    $awayHosts.set([...$awayHosts.get(), id.current])
    return () => $awayHosts.set($awayHosts.get().filter(x => x !== id.current))
  }, [inline])
  return view && hosts[0] === id.current ? h(AwayCollection, { key: view.key, view }) : null
}

function Detail({ c, pr, onClose, galleryRef, initialFull = false, initialFlipped = false, onBack }) {
  usePageVisit('gallery-detail')
  const [entering, setEntering] = useState(true)
  const [closing, setClosing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [faces, toggleFlip, revealReady] = useTrophyReveal([c.id], initialFlipped ? { [c.id]: true } : {}, !onBack && pr?.state !== 'secret')
  const flipped = faces[c.id]
  const [saving, setSaving] = useState(false)
  const [full, setFull] = useState(initialFull)
  const [dither, setDither] = useState(true)
  // The card on its own, straight to a PNG file, without going through the share preview.
  const saveCard = () => {
    if (saving) return
    setSaving(true)
    createShareImage(c, pr, 'card')
      .then(r => {
        const url = URL.createObjectURL(r.blob)
        const link = document.createElement('a')
        link.href = url
        link.download = r.filename
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }
  const closeTimer = useRef(null)
  useTrophyModalPause(galleryRef)
  useLayoutEffect(() => {
    const enterId = setTimeout(() => setEntering(false), 255)
    return () => {
      clearTimeout(enterId)
      clearTimeout(closeTimer.current)
    }
  }, [])
  const closeDetail = () => {
    if (closeTimer.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return onClose()
    setClosing(true)
    closeTimer.current = setTimeout(onClose, 185)
  }
  const secret = pr?.state === 'secret'
  const { v, tier, next, pct, percent, milestone, metric } = achievementPresentation(c, pr)
  const unlocked = pr?.state === 'unlocked'
  const T = tier >= 0 ? TIERS[tier] : null
  const stageColor = T ? T.color : 'var(--ui-accent,#8585F9)'
  // Full view: the card alone, as large as the window allows, still tilting and flipping; the hover dither can be switched off.
  const fullBody = h('div', { className: 'tr-dlg tr-dlg-full' },
    h('div', { className: 'tr-dlg-col tr-full', 'data-tier': T ? tier : undefined, style: { '--stage-c': stageColor } },
      h(TrophyCard, { c, pr, secret, flipped: secret || flipped, onFlip: secret ? undefined : () => toggleFlip(c.id), onReady: () => revealReady(c.id), dither }),
      h('div', { className: 'tr-full-bar' },
        h('button', { type: 'button', className: 'tr-flip-btn', onClick: onBack || (() => setFull(false)) }, t(onBack ? 'backToCollection' : 'backToTrophy')),
        !secret && h('button', { type: 'button', className: 'tr-flip-btn', onClick: () => toggleFlip(c.id) }, t(flipped ? 'showFront' : 'flipCard')),
        h('button', { type: 'button', className: 'tr-flip-btn', 'aria-pressed': dither, onClick: () => setDither(d => !d) }, t(dither ? 'ditherOn' : 'ditherOff')),
        unlocked && tier >= 0 && h('button', { type: 'button', className: 'tr-flip-btn', disabled: saving, onClick: saveCard }, t(saving ? 'savingCard' : 'saveCard'))
      )
    )
  )
  const body = full ? fullBody : sharing ? h(SharePreview, { c, pr, onBack: () => setSharing(false) }) : secret
    ? h(
        'div',
        { className: 'tr-dlg' },
        h('div', { className: 'tr-dlg-col' }, h(TrophyCard, { c, pr, secret: true, flipped: true }), h('div', { className: 'tr-dlg-plinth' }, h('div', { className: 'tr-dlg-stamp' }, t('secretHidden')))),
        h('div', { className: 'tr-dlg-in' }, h('div', { className: 'tr-eyebrow' }, t('secretHidden')), h('h4', null, t('secretName')), h('p', { className: 'tr-muted' }, t('secretBody')))
      )
    : h(
        'div',
        { className: 'tr-dlg' },
        h(
          'div',
          { className: 'tr-dlg-col', 'data-tier': T ? tier : undefined, style: { '--stage-c': stageColor } },
          h(TrophyCard, { c, pr, flipped, onFlip: () => toggleFlip(c.id), onReady: () => revealReady(c.id) }),
          h(
            'div',
            { className: 'tr-dlg-plinth' },
            h('div', { className: 'tr-dlg-stamp' }, pr?.unlocked_at ? t('firstEarned', fmtDate(pr.unlocked_at)) : t('notEarned')),
            h('button', { type: 'button', className: 'tr-flip-btn', onClick: () => setFull(true) },
              h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' })),
              t('fullView')),
            h('button', { type: 'button', className: 'tr-flip-btn', 'aria-pressed': flipped, onClick: () => toggleFlip(c.id) },
              h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M4 9a8 8 0 0 1 14.5-3.5L20 7M20 3v4h-4M20 15a8 8 0 0 1-14.5 3.5L4 17M4 21v-4h4' })),
              t(flipped ? 'showFront' : 'flipCard'))
          )
        ),
        h(
          'div',
          { className: 'tr-dlg-in', style: { '--detail-c': stageColor } },
          h('div', { className: 'tr-eyebrow' }, `${c.category}${c.source === 'new' ? ` · ${t('newTag')}` : ''}`),
          h('h4', null, c.name),
          T && h('div', { className: 'tr-dlg-tier', style: { '--c': T.color } }, h(TierGlyph, { tier }), `${T.name}${tier >= 4 ? ` · ${t('topTier')}` : ''}`),
          h('p', { className: 'tr-dlg-description' }, c.description),
          h('div', { className: 'tr-dlg-milestone' },
            h('span', { className: 'tr-dlg-milestone-label' }, percent ? (unlocked ? 'Every goal completed' : 'Requirements completed') : unlocked ? `${T?.name || 'Trophy'} unlocked at` : 'Progress so far'),
            h('strong', null, percent ? `${Math.round(v)}%` : Number(unlocked ? milestone ?? v : v).toLocaleString()),
            h('span', { className: 'tr-dlg-milestone-context' }, percent ? (unlocked ? 'Achievement complete' : 'Complete every requirement to earn Gold') : unlocked ? `Current total: ${v.toLocaleString()}` : metric)
          ),
          !percent && (next
            ? h('div', { className: 'tr-dlg-next' },
                h('span', null, `Next: ${TIERS[tier + 1]?.name || TIERS[0].name}`),
                h('strong', null, `${Math.max(0, next - v).toLocaleString()} to go`),
                h('span', { className: 'tr-dlg-next-track', role: 'progressbar', 'aria-label': 'Progress to next trophy tier', 'aria-valuemin': 0, 'aria-valuemax': next, 'aria-valuenow': Math.min(v, next) }, h('i', { style: { width: `${pct}%` } }))
              )
            : h('div', { className: 'tr-dlg-complete' }, h(TierGlyph, { tier: 4 }), h('span', null, 'All five milestones earned'))),
          !c.requirements && (c.thresholds || []).length > 0 && h(Ladder, { c, pr }),
          h('section', { className: 'tr-dlg-rule' },
            h('h5', null, c.requirements ? t('requirements') : t('whatCounts')),
            c.requirements
              ? h('ul', { className: 'tr-req' }, c.requirements.map((r, i) => h('li', { key: i }, h('span', null, r.label), h('strong', null, r.gte.toLocaleString()))))
              : h('p', null, metric)
          ),
          h(
            'div',
            { className: 'tr-acts' },
            tier >= 0 && h(Button, { variant: 'default', size: 'sm', onClick: () => setSharing(true) }, t('share')),
            tier >= 0 && unlocked && h(Button, { variant: 'outline', size: 'sm', disabled: saving, onClick: saveCard }, t(saving ? 'savingCard' : 'saveCard')),
            tier >= 0 && h(Button, { variant: 'outline', size: 'sm', onClick: () => replay(c.id, tier) }, t('replay'))
          )
        )
      )
  // No Dialog in the SDK: show the same content inline at the end of the page instead of failing to render.
  if (!Dialog || !DialogContent) return h('div', { className: cn('tr-inline', entering && 'tr-entering', closing && 'tr-exiting'), 'data-tier': !secret && T ? tier : undefined, role: 'dialog' }, h(Button, { variant: 'outline', size: 'sm', onClick: closeDetail }, t('close')), body)
  const head = DialogHeader && DialogTitle && DialogDescription ? h(DialogHeader, { className: 'sr-only' }, h(DialogTitle, null, secret ? t('secretName') : c.name), h(DialogDescription, null, secret ? t('secretBody') : c.description)) : null
  return h(Dialog, { open: true, onOpenChange: o => !o && closeDetail() }, h(DialogContent, { className: cn('tr-dialog', full && 'tr-full-dialog', entering && 'tr-entering', closing && 'tr-exiting'), bodyClassName: 'tr-dialog-body p-0 gap-0', showCloseButton: false, chrome: h(TrophyDialogClose, { onClose: closeDetail }), 'data-tier': !secret && T ? tier : undefined, style: { width: 840, maxWidth: '94vw', padding: 0, overflow: 'hidden' } }, head, body))
}

function TrophyRoom() {
  const q = useTrophyState()
  const [refreshStatus, setRefreshStatus] = useState('')
  const refreshTimer = useRef(null)
  useEffect(() => () => clearTimeout(refreshTimer.current), [])
  const refreshGallery = async () => {
    clearTimeout(refreshTimer.current)
    setRefreshStatus('refreshing')
    try {
      guard(() => queryClient.removeQueries({ queryKey: [ID, KEY_ART] }))
      const result = await q.refetch()
      setRefreshStatus(result.isError ? 'refreshFailed' : 'refreshed')
    } catch {
      setRefreshStatus('refreshFailed')
    }
    refreshTimer.current = setTimeout(() => setRefreshStatus(''), 3000)
  }
  const [cat, setCat] = useState('All')
  const [filter, setFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(null)
  const galleryRef = useRef(null)
  const setGalleryRoot = useCallback(root => {
    if (galleryRef.current) GALLERY_ROOTS.delete(galleryRef.current)
    galleryRef.current = root
    if (root) {
      GALLERY_ROOTS.add(root)
      if (FX_ENGINE.modalDepth) root.setAttribute('data-modal-paused', '')
    }
  }, [])
  const focus = useValue($focus)
  const tabsRef = useRef(null)
  const [tabEdges, setTabEdges] = useState({ left: false, right: false })
  const updateTabEdges = useCallback(() => {
    const el = tabsRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setTabEdges(prev => prev.left === left && prev.right === right ? prev : { left, right })
  }, [])

  usePageVisit('gallery')
  useEffect(() => {
    signal('trophy_room_open')
    void post('/seen', {}).then(() => queryClient.invalidateQueries({ queryKey: KEY_STATE }))
    setBadge(0)
    const warmId = setTimeout(prewarmFxSlot, 120)
    return () => clearTimeout(warmId)
  }, [])
  // Keep the chosen category tab on screen when the tab strip is wider than the page.
  useEffect(() => {
    guard(() => tabsRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' }))
  }, [cat, q.data])
  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    updateTabEdges()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateTabEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [q.data, updateTabEdges])
  const scrollTabs = direction => {
    const el = tabsRef.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * .75), behavior: reduced ? 'auto' : 'smooth' })
  }
  const onTabKeyDown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const buttons = [...(tabsRef.current?.querySelectorAll('[role=tab]') || [])]
    const current = buttons.indexOf(e.target)
    if (current < 0 || !buttons.length) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
    buttons[next].click()
  }
  useEffect(() => {
    if (focus) {
      setOpen(focus)
      $focus.set(null)
    }
  }, [focus])

  const st = q.data
  const cats = useMemo(() => ['All', ...(st?.meta?.categories || [...new Set((st?.catalog || []).map(c => c.category))])], [st])
  const list = useMemo(() => {
    if (!st) return []
    const needle = text.trim().toLowerCase()
    return st.catalog.filter(c => {
      const pr = st.progress?.[c.id]
      if (cat !== 'All' && c.category !== cat) return false
      if (tierFilter !== null && (pr?.state !== 'unlocked' || pr.tier !== tierFilter)) return false
      if (filter === 'unlocked' && pr?.state !== 'unlocked') return false
      if (filter === 'progress' && pr?.state !== 'discovered') return false
      if (filter === 'locked' && !(pr?.state === 'locked' || pr?.state === 'secret')) return false
      if (filter === 'new' && c.source !== 'new') return false
      if (needle && pr?.state !== 'secret') {
        const hay = [c.name, c.description, c.category].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [st, cat, filter, text, tierFilter])

  // A detail selection must not rebuild every card and its artwork subscriptions.
  const cards = useMemo(() => list.map(c => h(Card, { key: c.id, c, pr: st.progress?.[c.id], onOpen: setOpen })), [list, st?.progress])
  const total = st?.totals?.total || 0
  const unlocked = st?.totals?.unlocked || 0
  const frac = total ? Math.max(0, Math.min(1, unlocked / total)) : 0
  const openC = open && st?.catalog?.find(c => c.id === open)

  if (q.isLoading) return h('div', { className: 'tr-page' }, h(Css), h('div', { className: 'tr-empty' }, t('loading')))
  if (!st)
    return h('div', { className: 'tr-page' }, h(Css), h('div', { className: 'tr-empty' }, h('h3', null, t('errorTitle')), h('p', null, t('errorBody')), h(Button, { variant: 'outline', size: 'sm', onClick: () => q.refetch() }, t('retry'))))

  return h(
    'div',
    { ref: setGalleryRoot, className: 'tr-page', 'data-tr': 'page', 'data-detail-open': openC ? 'true' : undefined },
    (!Dialog || !DialogContent) && h(AwayHost, { inline: true }),
    h(Css),
    h('div', { className: 'tr-body' },
    h(
      'div',
      { className: 'tr-head' },
      h('div', { className: 'tr-overview' },
        h(Medallion, { frac }),
        h('div', { className: 'tr-hero' },
          h('div', { className: 'tr-eyebrow' }, t('eyebrow')),
          h('h1', { className: 'tr-wordmark' }, t('title')),
          h('p', { className: 'tr-h1' }, t('unlockedOf', unlocked, total))
        )
      ),
      h('div', { className: 'tr-pips', role: 'group', 'aria-label': 'Unlocked trophies by tier' }, TIERS.map((T, i) => {
        const cnt = st.totals?.by_tier?.[i] ?? 0
        const share = unlocked > 0 ? Math.min(100, Math.round((cnt / unlocked) * 100)) : 0
        return h('button', { key: i, type: 'button', className: 'tr-tier-stat', 'data-tier': i, 'aria-pressed': tierFilter === i, 'aria-label': `${T.name}: ${cnt} unlocked`, onClick: () => { const next = tierFilter === i ? null : i; setTierFilter(next); setFilter(next === null ? 'all' : 'unlocked'); setCat('All'); setText('') }, style: { '--c': T.color } },
          h('span', { className: 'tr-tier-sheen', 'aria-hidden': true }),
          h('div', { className: 'tr-tier-top' },
            h('span', { className: 'tr-tier-emblem', 'aria-hidden': true }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: TIER_EMBLEMS[i] }))),
            h('span', { className: 'tr-tier-count' }, cnt),
            h('span', { className: 'tr-tier-rank', 'aria-hidden': true }, ['I', 'II', 'III', 'IV', 'V'][i])
          ),
          h('div', { className: 'tr-tier-foot' },
            h('span', { className: 'tr-tier-label' }, T.name)
          ),
          h('div', { className: 'tr-tier-meter', 'aria-hidden': true }, h('i', { style: { width: `${ cnt > 0 ? Math.max(10, share) : 0 }%` } }))
        )
      }))
    ),
    h('div', { className: 'tr-meander', 'aria-hidden': true }),
    h('div', { className: 'tr-tools' }, h(SegmentedControl, { sizing: 'content', value: filter, onChange: value => { setFilter(value); setTierFilter(null) }, options: [{ id: 'all', label: t('fAll') }, { id: 'unlocked', label: t('fUnlocked') }, { id: 'progress', label: t('fProgress') }, { id: 'locked', label: t('fLocked') }, { id: 'new', label: t('fNew') }] }),
      h('div', { className: 'tr-search-tools' },
        h('span', { className: 'tr-refresh-status', role: 'status', 'aria-live': 'polite' }, refreshStatus ? t(refreshStatus) : ''),
        h('div', { className: 'tr-search' }, h(SearchField, { placeholder: t('search'), value: text, onChange: setText })),
        h(Button, { variant: 'ghost', size: 'sm', className: 'tr-refresh-btn', 'aria-label': t('rescan'), title: t('rescan'), disabled: refreshStatus === 'refreshing', 'data-refreshing': refreshStatus === 'refreshing', onClick: refreshGallery },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M3 12a9 9 0 0 1 15.36-6.36L21 8' }), h('path', { d: 'M21 3v5h-5' }),
            h('path', { d: 'M21 12a9 9 0 0 1-15.36 6.36L3 16' }), h('path', { d: 'M3 21v-5h5' })
          )
        ),
        h(Button, { variant: 'ghost', size: 'sm', className: 'tr-refresh-btn', 'aria-label': t('viewRecent'), title: t('viewRecent'), onClick: () => openAway(recentTrophies(currentState() || {}), false, true) },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2' })
          )
        ),
        h(Button, { variant: 'ghost', size: 'sm', className: 'tr-refresh-btn', 'aria-label': t('openSettings'), title: t('openSettings'), onClick: openSettings },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('circle', { cx: 12, cy: 12, r: 3 }),
            h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z' })
          )
        )
      )
    ),
    h('div', { className: 'tr-category-nav', 'data-more-left': tabEdges.left ? '' : undefined, 'data-more-right': tabEdges.right ? '' : undefined },
      h('button', { type: 'button', className: 'tr-tab-arrow', 'aria-label': t('categoriesPrevious'), disabled: !tabEdges.left, onClick: () => scrollTabs(-1) }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M15 18 9 12l6-6' }))),
      h('div', { className: 'tr-tabs', role: 'tablist', 'aria-label': t('categories'), ref: tabsRef, onScroll: updateTabEdges, onKeyDown: onTabKeyDown }, cats.map(c => h('button', { key: c, type: 'button', role: 'tab', tabIndex: c === cat ? 0 : -1, 'aria-selected': c === cat, onClick: () => setCat(c) }, c === 'All' ? t('all') : c))),
      h('button', { type: 'button', className: 'tr-tab-arrow', 'aria-label': t('categoriesNext'), disabled: !tabEdges.right, onClick: () => scrollTabs(1) }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'm9 18 6-6-6-6' })))
    ),
    list.length ? h('div', { className: 'tr-grid' }, cards) : h('div', { className: 'tr-empty' }, t('none'))
    ),
    openC && h(Detail, { c: openC, pr: st.progress?.[openC.id], onClose: () => setOpen(null), galleryRef })
  )
}

// ---------------------------------------------------------------------------
// Settings pages
// ---------------------------------------------------------------------------

function Row({ title, help, children }) {
  return h('div', { className: 'tr-row' }, h('div', null, h('b', null, title), help && h('span', { className: 'h' }, help)), h('div', null, children))
}

function useSettings() {
  return [useValue($settings), saveSettings]
}

function TestRow() {
  return h(
    Row,
    { title: t('setTest'), help: t('setTestHelp') },
    h('div', { className: 'tr-test' }, TIERS.map((T, i) => h(Button, { key: i, variant: 'outline', size: 'sm', onClick: () => testTier(i), 'data-test-tier': i }, T.name)))
  )
}

// Small drawings of the three pop-up looks, so the choice does not have to be imagined. Each one is also a button.
const LOOK_SKETCH = {
  tile: [h('rect', { key: 'a', x: 30, y: 22, width: 22, height: 22, rx: 2, className: 'art' }), h('rect', { key: 'b', x: 52, y: 22, width: 46, height: 22, rx: 2, className: 'box' }), h('path', { key: 'c', d: 'M58 30h26M58 37h16', className: 'ln' })],
  podium: [h('rect', { key: 'a', x: 12, y: 18, width: 104, height: 30, rx: 2, className: 'box' }), h('rect', { key: 'b', x: 16, y: 22, width: 22, height: 22, rx: 2, className: 'art' }), h('path', { key: 'c', d: 'M44 27h22M44 34h56M44 41h40', className: 'ln' })],
  card: [h('rect', { key: 'a', x: 42, y: 4, width: 44, height: 58, rx: 2, className: 'box' }), h('rect', { key: 'b', x: 46, y: 8, width: 36, height: 30, rx: 2, className: 'art' }), h('path', { key: 'c', d: 'M48 44h20M48 50h32M48 56h24', className: 'ln' })]
}

function LookPicker({ value, onPick }) {
  return h('div', { className: 'tr-looks', role: 'group', 'aria-label': t('lookPick') },
    ['tile', 'podium', 'card'].map(id =>
      h('button', { key: id, type: 'button', className: 'tr-look', 'aria-pressed': value === id, onClick: () => onPick(id) },
        h('svg', { viewBox: '0 0 128 66', 'aria-hidden': true }, LOOK_SKETCH[id]),
        h('span', null, t(id === 'tile' ? 'lookTile' : id === 'podium' ? 'lookPodium' : 'lookCard'))
      )
    ),
    h('p', { className: 'tr-look-note', 'data-on': value === 'auto' ? '' : undefined }, t('lookAutoNote'))
  )
}

function GeneralPage() {
  usePageVisit('settings')
  const [s, set] = useSettings()
  return h(
    'div',
    { className: 'tr-set' },
    h(Css),
    h('h3', null, t('setGeneral')),
    h('div', { className: 'tr-muted' }, t('setGeneralBlurb')),
    h(Row, { title: t('setLook'), help: t('setLookHelp') }, h(SegmentedControl, { sizing: 'content', value: s.style, onChange: v => set({ style: v }), options: [{ id: 'auto', label: t('lookAuto') }, { id: 'podium', label: t('lookPodium') }, { id: 'tile', label: t('lookTile') }, { id: 'card', label: t('lookCard') }] })),
    h(LookPicker, { value: s.style, onPick: v => set({ style: v }) }),
    h(Row, { title: t('setPlace'), help: t('setPlaceHelp') }, h(SegmentedControl, { sizing: 'content', value: s.place, onChange: v => set({ place: v }), options: [{ id: 'top-left', label: t('placeTopLeft') }, { id: 'top-center', label: t('placeTopCenter') }, { id: 'top-right', label: t('placeTopRight') }, { id: 'bottom-right', label: t('placeBottomRight') }, { id: 'bottom-left', label: t('placeBottomLeft') }] })),
    h(Row, { title: t('setMinTier'), help: t('setMinTierHelp') }, h(SegmentedControl, { sizing: 'content', value: String(s.minTier), onChange: v => set({ minTier: Number(v) }), options: TIERS.map((T, i) => ({ id: String(i), label: T.name })) })),
    h(TestRow)
  )
}

function Toggle({ k, title, help }) {
  const [s, set] = useSettings()
  return h(Row, { title, help }, h(Switch, { checked: !!s[k], onCheckedChange: v => set({ [k]: !!v }), 'aria-label': title }))
}

function NotificationsPage() {
  usePageVisit('settings-notifications')
  return h('div', { className: 'tr-set' }, h(Css), h('h3', null, t('setNotif')), h(Toggle, { k: 'inApp', title: t('nInApp'), help: t('nInAppHelp') }), h(Toggle, { k: 'onWindow', title: t('nWindow'), help: t('nWindowHelp') }), h(Toggle, { k: 'os', title: t('nOs'), help: t('nOsHelp') }), h(Toggle, { k: 'quiet', title: t('nQuiet'), help: t('nQuietHelp') }), h(TestRow))
}

function SoundPage() {
  usePageVisit('settings-sound')
  const [s, set] = useSettings()
  return h(
    'div',
    { className: 'tr-set' },
    h(Css),
    h('h3', null, t('setSound')),
    h(Toggle, { k: 'sound', title: t('sSound'), help: t('sSoundHelp') }),
    h(Row, { title: t('sVolume'), help: t('sVolumeHelp') }, h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volume * 100), disabled: !s.sound, onChange: e => set({ volume: Number(e.target.value) / 100 }), 'aria-label': t('sVolume') })),
    h(Row, { title: t('setTest') }, h('div', { className: 'tr-test' }, TIERS.map((T, i) => h(Button, { key: i, variant: i === 4 ? 'default' : 'outline', size: 'sm', onClick: () => playSound(i, true), 'data-play-tier': i }, T.name))))
  )
}

function DataPage() {
  usePageVisit('settings-data')
  const q = useTrophyState()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const st = q.data
  const doImport = async () => {
    setBusy(true)
    try {
      const r = await rest('/import-legacy', { method: 'POST', body: {} })
      if (r && r.ok === false) setMsg(`${t('dImportFail')}${r.error ? ` (${r.error})` : ''}`)
      else {
        setMsg(t('dImported', r.imported ?? 0, r.already ?? 0))
        await queryClient.invalidateQueries({ queryKey: KEY_STATE })
      }
    } catch {
      setMsg(t('dImportFail'))
    }
    setBusy(false)
  }
  const doReset = async () => {
    try {
      await rest('/reset', { method: 'POST', body: { confirm: 'reset' } })
      resetRuntime()
      await queryClient.invalidateQueries({ queryKey: KEY_STATE })
      setMsg(t('dResetDone'))
    } catch {
      setMsg(t('dResetFail'))
    }
  }
  const imp = st?.meta?.legacy_import
  return h(
    'div',
    { className: 'tr-set' },
    h(Css),
    h('h3', null, t('setData')),
    (!Dialog || !DialogContent) && h(AwayHost, { inline: true }),
    h('div', { className: 'tr-muted' }, st ? t('dCounts', st.totals?.unlocked ?? 0, st.totals?.total ?? 0, st.unseen?.length ?? 0) : t('loading')),
    h(Row, { title: t('dImport'), help: imp && !imp.available ? `${t('dImportHelp')} ${t('dImportNone')}` : t('dImportHelp') }, h(Button, { variant: 'outline', size: 'sm', disabled: busy || (imp && !imp.available), onClick: doImport }, t('dImportBtn'))),
    h(Row, { title: t('dReplay'), help: t('dReplayHelp') }, h(Button, { variant: 'outline', size: 'sm', disabled: replaying, onClick: () => { setReplaying(true); void awaySummary(true).finally(() => setReplaying(false)) } }, t('dReplayBtn'))),
    h(Row, { title: t('dReset'), help: t('dResetHelp') }, h(Button, { variant: 'destructive', size: 'sm', onClick: () => setConfirm(true) }, t('dResetBtn'))),
    msg && h('div', { className: 'tr-note', role: 'status' }, msg),
    confirm &&
      !ConfirmDialog &&
      h(
        'div',
        { className: 'tr-note', role: 'alertdialog' },
        h('b', null, t('dResetTitle')),
        ` ${t('dResetBody')}`,
        h(
          'div',
          { className: 'tr-acts' },
          h(Button, { variant: 'outline', size: 'sm', onClick: () => setConfirm(false) }, t('cancel')),
          h(Button, { variant: 'destructive', size: 'sm', onClick: () => { setConfirm(false); void doReset() } }, t('dResetConfirm'))
        )
      ),
    ConfirmDialog && h(ConfirmDialog, { open: confirm, onClose: () => setConfirm(false), onConfirm: doReset, title: t('dResetTitle'), description: t('dResetBody'), confirmLabel: t('dResetConfirm'), destructive: true })
  )
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default {
  id: ID,
  name: 'Trophy Room',

  register(ctx) {
    R.ctx = ctx
    R.n = 0
    R.queue = []
    R.held = []
    R.seen = new Set()
    R.delivered = new Set()
    R.timer = null
    R.watch = null
    R.shown = 0
    R.booted = false
    R.ac = null
    R.awayEpoch++
    R.awayRequest++
    R.lastAway = null
    $awayView.set(null)
    $awayHosts.set([])
    $current.set(null)
    $anchors.set({})
    loadSettings(ctx)

    guard(() => ctx.i18n.register({ en: Object.fromEntries(Object.entries(EN).filter(([, v]) => typeof v === 'string')) }))

    ctx.register({ id: 'title-anchor', area: sdk.TITLEBAR_AREAS.center, render: () => h(TitleAnchor) })
    ctx.register({ id: 'chip', area: sdk.STATUSBAR_AREAS.right, order: 120, render: () => h(StatusChip) })
    ctx.register({ id: 'left-anchor', area: sdk.STATUSBAR_AREAS.left, order: 990, render: () => h(StatusLeftAnchor) })
    ctx.register({ id: 'page', area: sdk.ROUTES_AREA, data: { path: ROUTE }, render: () => h(TrophyRoom) })
    ctx.register({ id: 'nav', area: sdk.SIDEBAR_NAV_AREA, data: { path: ROUTE, label: t('nav'), codicon: 'star-full' } })
    ctx.register({
      id: 'open',
      area: sdk.PALETTE_AREA,
      data: { id: `${ID}.open`, label: t('palette'), keywords: ['trophy', 'achievements', 'trophies'], run: () => openTrophy(null) }
    })
    ctx.register({
      id: 'open-key',
      area: sdk.KEYBINDS_AREA,
      data: { id: `${ID}.open-key`, label: t('keybind'), category: 'Trophy Room', defaults: ['mod+alt+t'], run: () => openTrophy(null) }
    })

    ctx.registerSettingsPage?.({
      id: 'settings',
      title: t('setGeneral'),
      icon: 'star-full',
      render: () => h(GeneralPage),
      children: [
        { id: 'notifications', title: t('setNotif'), render: () => h(NotificationsPage) },
        { id: 'sound', title: t('setSound'), render: () => h(SoundPage) },
        { id: 'data', title: t('setData'), render: () => h(DataPage) }
      ]
    })

    ctx.onEvent(EVENT, onUnlockEvent)

    guard(() => {
      const off = host.state.busy.subscribe(b => {
        if (!b) releaseHeld()
      })
      ctx.onDispose(off)
    })
    guard(() => {
      // Signal only on a real change. The last profile sent is remembered on this device, so a plain relaunch is not a
      // switch (profile_seen also bumps the switch counter); the very first launch sends once to seed the distinct set.
      let last = guard(() => ctx.storage.get('lastProfile', null)) ?? null
      const off = host.state.profile.subscribe(p => {
        if (!p || p === last) return
        R.awayEpoch++
        R.awayRequest++
        $awayView.set(null)
        last = p
        guard(() => ctx.storage.set('lastProfile', p))
        signal('profile_seen', p)
      })
      ctx.onDispose(off)
    })
    guard(() => {
      // host.pluginDecisions is this window's explicit enable/disable choices (id -> enabled); count the enabled ones.
      let sent = -1
      const push = dec => {
        const n = Object.values(dec || {}).filter(Boolean).length
        if (n > 0 && n !== sent) {
          sent = n
          signal('plugin_count', n)
        }
      }
      if (host.pluginDecisions?.subscribe) ctx.onDispose(host.pluginDecisions.subscribe(push))
    })

    ctx.addEventListener(window, 'pointerdown', resumeAudio, { passive: true })
    ctx.addEventListener(window, 'keydown', resumeAudio, { passive: true })
    ctx.addEventListener(window, 'focus', () => setBadge(currentState()?.unseen?.length || 0))

    ctx.setTimeout(() => void awaySummary(false), 2500)
    // Invalidate cached art queries on plugin hot-reload so updated artworks appear immediately in open windows.
    guard(() => {
      queryClient.removeQueries({ queryKey: [ID, 'art'] })
      void queryClient.invalidateQueries({ queryKey: [ID, KEY_ART] })
    })
    ctx.onDispose(() => {
      R.awayEpoch++
      R.awayRequest++
      $awayView.set(null)
      R.timer?.()
      R.watch?.()
      $current.set(null)
      setBadge(0)
      disposeFxEngine()
      disposeCardBack()
      disposeOlympianArt()
      guard(() => R.ac && R.ac.close())
    })
  }
}
