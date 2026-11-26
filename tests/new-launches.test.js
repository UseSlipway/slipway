import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launchesFromEvents } from '../src/NewLaunchFeed.jsx'

const A = '0x' + 'a'.repeat(40)
const B = '0x' + 'b'.repeat(40)

test('new launch feed maps Pons and Clanker launch events newest first', () => {
  const rows = launchesFromEvents([
    { type: 'token.launched', chain: 'rhc', indexedAt: '2026-11-27T10:00:00Z', payload: { args: { token: A, deployer: B, pairToken: '0x0000000000000000000000000000000000000000' } } },
    { type: 'token.launched', chain: 'base', indexedAt: '2026-11-27T11:00:00Z', payload: { args: { tokenAddress: B, msgSender: A, pairedToken: '0x0000000000000000000000000000000000000000', tokenName: 'Base Cat', tokenSymbol: 'BCAT', tokenImage: 'https://images.example/cat.png' } } },
    { type: 'token.launched', chain: 'base', indexedAt: '2026-11-27T09:00:00Z', payload: { args: { tokenAddress: B, tokenName: 'Duplicate' } } },
    { type: 'pool.graduated', chain: 'rhc', indexedAt: '2026-11-27T12:00:00Z', payload: { args: { token: A } } },
  ])
  assert.deepEqual(rows.map(row => row.token), [B, A])
  assert.equal(rows[0].venue, 'Clanker')
  assert.equal(rows[0].name, 'Base Cat')
  assert.equal(rows[0].symbol, 'BCAT')
  assert.equal(rows[0].creator, A)
  assert.equal(rows[0].image, 'https://images.example/cat.png')
  assert.equal(rows[1].venue, 'Pons')
  assert.equal(rows[1].pair, 'ETH')
  assert.equal(rows[1].creator, B)
})
