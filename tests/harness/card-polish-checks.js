// Run with api=fixture&bare=1&route=/trophy-room&unseen=0.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const collection = () => document.querySelector('.tr-away-dialog,.tr-away-inline')
const until = async fn => {
  for (let i = 0; i < 80; i++) {
    if (fn()) return true
    await sleep(50)
  }
  return false
}
export async function run(t, reduced = false) {
  const results = []
  const add = (name, ok) => results.push({ name, ok: !!ok })
  t.failPaths.add('/signal')
  await sleep(3000)
  t.navigate('/trophy-room')
  await until(() => document.querySelector('.tr-search-tools'))
  const toolbar = [...document.querySelectorAll('.tr-search-tools button')]
  const recent = toolbar.find(b => b.getAttribute('aria-label') === 'View recent trophies')
  add('recent trophies has a labeled toolbar icon', recent && recent.querySelector('svg'))
  add('recent trophies sits between Refresh and Settings', recent && recent.previousElementSibling?.getAttribute('aria-label') === 'Refresh' && recent.nextElementSibling?.getAttribute('aria-label') === 'Trophy Room settings')
  if (!recent) return results
  recent.click()
  await until(() => collection()?.querySelectorAll('.tr-tc').length === 3)
  add('recent icon opens the real three-card collection directly', collection()?.querySelector('h4')?.textContent === 'Recent trophies' && collection().querySelectorAll('[data-away-id]').length === 3)
  add(reduced ? 'reduced motion starts with the fronts' : 'new collection starts with the card backs', collection()?.querySelectorAll('.tr-tc[data-flipped]').length === (reduced ? 0 : 3))
  if (!reduced) {
    const steps = []
    for (let i = 0; i < 250; i++) {
      const sides = [...collection().querySelectorAll('.tr-tc')].map(c => c.hasAttribute('data-flipped') ? '1' : '0').join('')
      if (steps.at(-1)?.sides !== sides) steps.push({ sides, at: performance.now() })
      if (sides === '000') break
      await sleep(20)
    }
    add('cards reveal strictly from left to right', steps.map(s => s.sides).join(',') === '111,011,001,000')
    const turns = steps.slice(1)
    add('each flip finishes before the next card starts', turns.length === 3 && turns.slice(1).every((s, i) => s.at - turns[i].at >= 700))
  }
  add('collection card shadows cannot obscure the trophy captions', [...collection().querySelectorAll('.tr-tc-tilt')].every(c => getComputedStyle(c).boxShadow === 'none'))
  await until(() => collection()?.querySelectorAll('.tr-tc-front img').length === 3 && [...collection().querySelectorAll('.tr-tc-front img')].every(i => i.naturalWidth))
  await until(() => collection()?.querySelectorAll('.tr-tc[data-flipped]').length === 0)
  add('ready cards automatically reveal their fronts', collection()?.querySelectorAll('.tr-tc[data-flipped]').length === 0)
  collection().querySelector('.tr-away-close').click()
  await until(() => !collection())
  if (!reduced) {
    recent.click()
    await until(() => collection()?.querySelector('.tr-tc[data-flipped]'))
    const card = collection().querySelector('.tr-tc')
    card.click()
    await sleep(40)
    card.click()
    await sleep(1300)
    add('manual flipping cancels the pending reveal instead of fighting the user', card.hasAttribute('data-flipped'))
    collection().querySelector('.tr-away-close').click()
    await until(() => !collection())
    recent.click()
    await until(collection)
    collection().querySelector('.tr-away-close').click()
    await sleep(1200)
    add('closing during the reveal cannot reopen the collection', !collection())
  }
  return results
}
