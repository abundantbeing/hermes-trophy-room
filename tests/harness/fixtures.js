// In-browser fixture backend implementing docs/CONTRACT.md, used when the Python dev server is not running.
// [id, name, category, glyph, source, thresholds, how, value, secret]
const T5 = [200, 500, 1200, 3000, 8000]
const E = [
  ['let_him_cook', 'Let Him Cook', 'Agent Autonomy', 'flame', 'legacy', T5, 'Tool calls in one session', 2100],
  ['toolchain_maxxer', 'Toolchain Maxxer', 'Agent Autonomy', 'nodes', 'legacy', [18, 28, 45, 70, 100], 'Distinct tools used in one session', 31],
  ['cron_necromancer', 'Cron Necromancer', 'Agent Autonomy', 'clock', 'legacy', [1000, 3000, 8000, 20000, 50000], 'Scheduled-job operations', 21400],
  ['subagent_commander', 'Subagent Commander', 'Agent Autonomy', 'branch', 'legacy', [5, 40, 100, 1000, 5000], 'Delegated agent tasks', 12],
  ['red_text', 'Red Text Connoisseur', 'Debugging Chaos', 'bug', 'legacy', [1500, 4000, 10000, 25000, 75000], 'Errors encountered', 4400],
  ['stack_sommelier', 'Stack Trace Sommelier', 'Debugging Chaos', 'scroll', 'legacy', [300, 1000, 3000, 8000, 20000], 'Tracebacks seen', 320],
  ['port_taken', 'Port 3000 Is Taken', 'Debugging Chaos', 'plug', 'legacy', [15, 40, 100, 300, 1000], 'Dev-server port conflicts', 0, true],
  ['forgot_env', 'Forgot The Env Var', 'Debugging Chaos', 'key', 'legacy', [5, 15, 40, 100, 250], 'Missing environment variables', 3, true],
  ['one_more_change', 'One More Small Change', 'Vibe Coding', 'hammer', 'legacy', [150, 400, 1000, 3000, 8000], 'File tool calls in one session', 410],
  ['pixel_goblin', 'Pixel Goblin', 'Vibe Coding', 'image', 'legacy', [20, 50, 120, 300, 800], 'Frontend activity', 8],
  ['skillsmith', 'Skillsmith', 'Hermes Native', 'book', 'legacy', [50, 150, 400, 1000, 2500], 'Skill activity', 180],
  ['memory_keeper', 'Memory Keeper', 'Hermes Native', 'crystal', 'legacy', [100, 300, 1000, 3000, 8000], 'Durable memory writes', 140],
  ['config_surgeon', 'Config Surgeon', 'Hermes Native', 'cog', 'legacy', [100, 300, 1000, 3000, 10000], 'Config and manifest activity', 4100],
  ['rollback_wizard', 'Rollback Wizard', 'Hermes Native', 'wing', 'legacy', [5, 15, 40, 100, 250], 'Rollbacks and checkpoints', 0, true],
  ['rabbit_hole', 'Rabbit Hole Certified', 'Research/Web', 'compass', 'legacy', [400, 1200, 3000, 8000, 20000], 'Web searches and extractions', 1500],
  ['browser_possession', 'Browser Possession', 'Research/Web', 'globe', 'legacy', [75, 200, 600, 1500, 4000], 'Browser automation calls', 90],
  ['terminal_goblin', 'Terminal Goblin', 'Tool Mastery', 'term', 'legacy', [750, 2000, 6000, 15000, 50000], 'Terminal calls', 8800],
  ['voice_machine', 'Voice Of The Machine', 'Tool Mastery', 'mic', 'legacy', [10, 30, 100, 300, 800], 'Text-to-speech calls', 12],
  ['multi_model', 'Multi-Model Mage', 'Model Lore', 'cube', 'legacy', [10, 20, 40, 80, 160], 'Distinct models used', 18],
  ['claude_confidant', 'Claude Confidant', 'Model Lore', 'brain', 'legacy', [50, 150, 500, 1500, 4000], 'Claude-flavoured sessions', 0],
  ['night_shift', 'Night Shift Operator', 'Lifestyle', 'moon', 'legacy', [25, 75, 200, 600, 1500], 'Sessions started late at night', 1500],
  ['weekend_warrior', 'Weekend Warrior', 'Lifestyle', 'hourglass', 'legacy', [25, 75, 200, 600, 1500], 'Weekend sessions', 60],
  ['forge_apprentice', 'Forge Apprentice', 'Skills & Learning', 'hammer', 'new', [1, 5, 15, 40, 100], 'Skills you created with skill_manage', 7],
  ['elephant', 'Elephant Never Forgets', 'Memory', 'brain', 'new', [25, 100, 300, 800, 2000], 'Memory writes that survived a compaction', 30],
  ['many_hats', 'Many Hats', 'Profiles & Bots', 'hand', 'new', [2, 3, 5, 8, 12], 'Distinct profiles you have used', 2],
  ['overnight_shift', 'Overnight Shift', 'Cron & Automation', 'bell', 'new', [1, 10, 30, 80, 200], 'Cron runs that finished between 00:00 and 05:00', 0],
  ['plugin_hand', 'Plugin Hand', 'Plugins & MCP', 'puzzle', 'new', [1, 3, 6, 10, 20], 'Plugins you have switched on', 3],
  ['trophy_visits', 'Trophy Room', 'Desktop', 'star', 'new', [1, 10, 40, 100, 300], 'Times you opened the trophy room', 4],
  ['everywhere', 'Everywhere At Once', 'Messaging', 'chat', 'new', [2, 3, 5, 7, 10], 'Platforms Hermes has run on', 5],
  ['hive_mind', 'Hive Mind', 'Kanban & Subagents', 'nodes', 'new', [1, 5, 20, 60, 150], 'Three or more subagents at the same time', 0],
  ['task_force', 'Task Force', 'Kanban & Subagents', 'board', 'new', [], 'Kanban tasks completed >= 25; distinct boards >= 2', 100],
  ['full_send', 'Full Send', 'Agent Autonomy', 'rocket', 'legacy', [], 'terminal calls in one session >= 180; file calls in one session >= 120', 60],
  ['ghost_browser', 'Ghost In The Browser', 'Browser & Computer Use', 'eye', 'new', [1, 20, 100, 400, 1500], 'Computer-use actions you let run', 0],
  ['directors_cut', "Director's Cut", 'Media & Voice', 'film', 'new', [1, 5, 15, 40, 100], 'Videos you generated', 0],
  ['gallery_owner', 'Gallery Owner', 'Media & Voice', 'image', 'new', [1, 10, 40, 120, 400], 'Images you generated', 52],
  ['sound_check', 'Sound Check', 'Media & Voice', 'speaker', 'new', [1, 10, 30, 100, 300], 'Audio files generated', 1],
  ['lockdown', 'Lockdown', 'Plugins & MCP', 'lock', 'new', [1, 3, 8, 20, 50], 'Tool approvals you denied', 0],
  ['shield_up', 'Shield Up', 'Hermes Native', 'shield', 'new', [1, 5, 20, 80, 250], 'Approvals you granted', 6],
  ['bolt_round', 'Lightning Round', 'Agent Autonomy', 'bolt', 'new', [5, 10, 25, 60, 150], 'Tool calls inside one minute', 14],
  ['launch_day', 'Launch Day', 'Vibe Coding', 'rocket', 'new', [1, 3, 8, 20, 50], 'Releases tagged', 0],
  ['compaction_cadet', 'Compaction Cadet', 'Memory', 'container', 'new', [1, 5, 20, 60, 150], 'Context compactions survived', 3],
  ['feather_light', 'Feather Light', 'Lifestyle', 'feather', 'new', [1, 5, 15, 40, 100], 'Sessions that finished in under a minute', 0],
  ['laurel_wreath', 'Laurel Wreath', 'Meta', 'laurel', 'new', [10, 25, 50, 75, 100], 'Total achievements unlocked', 28],
  ['cloud_nine', 'Cloud Nine', 'Model Lore', 'cloud', 'new', [1, 3, 5, 8, 12], 'Distinct providers used', 3],
  ['wrench_work', 'Wrench Work', 'Tool Mastery', 'wrench', 'new', [10, 50, 200, 800, 2500], 'Patch calls', 260]
]

// multi_condition entries have thresholds [] and a percent value; they unlock once at Gold (tier 2).
const tierOf = (v, th) => (th.length ? th.reduce((t, x, i) => (v >= x ? i : t), -1) : v >= 100 ? 2 : -1)

export function makeFixture({ unseen = 0, legacyAvailable = true, artAll = false } = {}) {
  const mem = { seen: false, signals: [], imported: false, resets: 0, unseen: [] }
  const base = E.map(([id, name, category, glyph, source, thresholds, how, value, secret]) => ({ id, name, category, glyph, source, thresholds, how, value, secret: !!secret }))
  const best = base.filter(c => tierOf(c.value, c.thresholds) >= 0)
  for (let i = 0; i < unseen; i++) {
    const c = best[(i * 3) % best.length]
    mem.unseen.push({ id: c.id, tier: tierOf(c.value, c.thresholds), at: 1782510295 + i })
  }
  const state = () => {
    const catalog = base.map(c => ({
      id: c.id,
      name: c.secret && c.value === 0 ? 'Secret trophy' : c.name,
      description: c.secret && c.value === 0 ? 'Hidden until the first related signal.' : `${c.how}. Earned from real Hermes work.`,
      category: c.category,
      glyph: c.secret && c.value === 0 ? 'star' : c.glyph,
      secret: c.secret,
      kind: 'lifetime',
      thresholds: c.thresholds,
      how: c.secret && c.value === 0 ? 'Hidden until you trigger it' : c.how,
      source: c.source,
      requirements: c.thresholds.length ? null : [{ metric: 'a', label: 'terminal calls in one session', gte: 180 }, { metric: 'b', label: 'file calls in one session', gte: 120 }]
    }))
    const progress = {}
    const by = [0, 0, 0, 0, 0]
    let unlocked = 0
    for (const c of base) {
      const tier = mem.imported || c.source === 'new' || true ? tierOf(c.value, c.thresholds) : -1
      const stt = c.secret && c.value === 0 ? 'secret' : tier >= 0 ? 'unlocked' : c.value > 0 ? 'discovered' : 'locked'
      progress[c.id] = { value: c.value, tier, state: stt, first_tier: tier, unlocked_at: tier >= 0 ? 1782510295 - c.value : null, next: c.thresholds.length ? (tier >= 4 ? null : c.thresholds[tier + 1]) : tier >= 0 ? null : 100 }
      if (tier >= 0) {
        by[tier]++
        unlocked++
      }
    }
    return {
      version: 1,
      catalog,
      progress,
      totals: { unlocked, total: base.length, by_tier: by },
      unseen: mem.unseen,
      meta: { legacy_import: { available: legacyAvailable, done: mem.imported }, categories: [...new Set(base.map(c => c.category))] }
    }
  }
  const realArt = id =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><radialGradient id="r"><stop offset="0" stop-color="#4a3a10"/><stop offset="1" stop-color="#0D0D24"/></radialGradient></defs><rect width="128" height="128" fill="url(#r)"/><circle cx="64" cy="64" r="34" fill="none" stroke="#E5C36A" stroke-width="3"/><path d="M64 28L72 52L98 54L78 70L84 96L64 82L44 96L50 70L30 54L56 52Z" fill="none" stroke="#FAFAFF" stroke-width="2.5"/><text x="64" y="120" font-size="9" text-anchor="middle" fill="#E5C36A" font-family="monospace">REAL ART ${id}</text></svg>`)}`
  const REAL = artAll ? new Set(base.map(c => c.id)) : new Set(['night_shift', 'memory_keeper'])
  const handler = async (method, path, body) => {
    await new Promise(r => setTimeout(r, 30))
    if (method === 'GET' && path === '/state') return state()
    if (method === 'GET' && path === '/art-index') return { ids: [...REAL] }
    if (method === 'GET' && path.startsWith('/art/')) {
      const id = decodeURIComponent(path.slice(5))
      return REAL.has(id) ? { uri: realArt(id), icon_path: `C:\\fixture\\art\\icons\\${id}.png` } : { uri: null, icon_path: null }
    }
    if (method === 'POST' && path === '/seen') {
      mem.seen = true
      mem.unseen = body?.ids ? mem.unseen.filter(u => !body.ids.includes(u.id)) : []
      return { ok: true }
    }
    if (method === 'POST' && path === '/signal') {
      mem.signals.push(body)
      return { ok: true }
    }
    if (method === 'POST' && path === '/import-legacy') {
      mem.imported = true
      return legacyAvailable ? { ok: true, imported: 55, already: 0, source: 'fixture' } : { ok: false, error: 'no dashboard data found' }
    }
    if (method === 'POST' && path === '/reset') {
      mem.resets++
      return { ok: true }
    }
    throw new Error(`fixture: no route ${method} ${path}`)
  }
  handler.applyUnlock = p => {
    const c = base.find(x => x.id === p.id)
    if (c) c.value = c.thresholds.length ? Math.max(c.value, c.thresholds[p.tier] ?? c.value) : 100
  }
  // A trophy unlocked by another process (cron, hermes chat): a row exists, no event is broadcast.
  handler.addUnseen = (id, tier) => {
    const c = base.find(x => x.id === id)
    if (c) c.value = Math.max(c.value, c.thresholds.length ? c.thresholds[tier] : 100)
    mem.unseen.push({ id, tier, at: Math.floor(Date.now() / 1000) })
  }
  handler.mem = mem
  handler.catalog = base
  handler.tierOf = tierOf
  return handler
}
