import test from 'node:test'
import assert from 'node:assert/strict'
import { candleIndexAt, buildMarkers } from '../src/PriceChart.jsx'

const rows = [[1000, 1, 2, .5, 1.5, 10], [1060, 1.5, 2, 1, 1.2, 5], [1120, 1.2, 1.4, 1, 1.3, 7]]

test('candle lookup finds the bucket containing a time and rejects times outside the range', () => {
  assert.equal(candleIndexAt(rows, 1000, 60), 0)
  assert.equal(candleIndexAt(rows, 1059, 60), 0)
  assert.equal(candleIndexAt(rows, 1061, 60), 1)
  assert.equal(candleIndexAt(rows, 1179, 60), 2)
  assert.equal(candleIndexAt(rows, 1180, 60), -1)
  assert.equal(candleIndexAt(rows, 999, 60), -1)
  assert.equal(candleIndexAt([], 1000, 60), -1)
})

test('markers include graduation, a separate pool creation, and only the connected wallet trades', () => {
  const me = '0x' + 'a'.repeat(40)
  const trades = [{ side: 'Buy', wallet: me.toUpperCase().replace('0X', '0x'), at: '2026-11-26T21:00:00Z', usd: 50, hash: '0x1' }, { side: 'Sell', wallet: '0x' + 'b'.repeat(40), at: '2026-11-26T21:05:00Z', usd: 9, hash: '0x2' }]
  const markers = buildMarkers({ graduatedAt: '2026-11-26T18:33:18Z', poolCreatedAt: '2026-11-20T10:00:00Z', trades, wallet: me })
  assert.deepEqual(markers.map(m => m.kind), ['graduated', 'pool', 'buy'])
  assert.equal(markers[0].at, Date.parse('2026-11-26T18:33:18Z') / 1000)
})

test('pool creation right at graduation is not shown twice; no wallet means no trade markers', () => {
  const markers = buildMarkers({ graduatedAt: '2026-11-26T18:33:18Z', poolCreatedAt: '2026-11-26T18:33:30Z', trades: [{ side: 'Buy', wallet: '0x1', at: '2026-11-26T21:00:00Z' }], wallet: '' })
  assert.deepEqual(markers.map(m => m.kind), ['graduated'])
})
