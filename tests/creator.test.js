import test from 'node:test'
import assert from 'node:assert/strict'
import { creatorTags } from '../src/CreatorCard.jsx'
import { getCreatorHistory } from '../src/api.js'

const labels = (data) => creatorTags(data).map(t => t.label)

test('creator tags describe history without calling anything safe', () => {
  assert.deepEqual(labels({ launches: 1, graduated: 0 }), ['First launch seen'])
  assert.deepEqual(labels({ launches: 4, graduated: 1 }), ['1 graduated'])
  assert.deepEqual(labels({ launches: 3, graduated: 0 }), ['None graduated yet'])
  assert.deepEqual(labels({ launches: 12, graduated: 0, firstLaunchAt: '2026-11-26T01:00:00Z', lastLaunchAt: '2026-11-26T20:00:00Z' }), ['Serial launcher', '12 launches in under a day', 'None graduated yet'])
  assert.deepEqual(labels({ launches: 12, graduated: 2, firstLaunchAt: '2026-11-01T00:00:00Z', lastLaunchAt: '2026-11-26T00:00:00Z' }), ['2 graduated', 'Serial launcher'])
})

test('creator history requests validate chain and token', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let target
  globalThis.fetch = async (url) => { target = new URL(String(url)); return new Response(JSON.stringify({ found: false }), { status: 200 }) }
  const token = '0x' + 'a'.repeat(40)
  await getCreatorHistory('https://service.example', 'rhc', token)
  assert.equal(target.pathname, '/v1/events/creator')
  assert.equal(target.searchParams.get('token'), token)
  await assert.rejects(getCreatorHistory('https://service.example', 'solana', token), /supported chain/)
  await assert.rejects(getCreatorHistory('https://service.example', 'rhc', 'nope'), /supported chain/)
})
