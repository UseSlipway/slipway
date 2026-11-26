import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTrades, summarize } from '../src/RecentTrades.jsx'

const TOKEN = '0x' + 'a'.repeat(40), QUOTE = '0x' + 'b'.repeat(40)
const trade = (kind, extra = {}) => ({ id: kind + (extra.t || ''), type: 'trade', attributes: {
  block_number: 1, block_timestamp: extra.at || '2026-11-26T21:00:00Z', tx_hash: '0x' + '1'.repeat(64), tx_from_address: extra.wallet || '0x' + 'c'.repeat(40), kind,
  from_token_address: kind === 'buy' ? QUOTE : TOKEN, to_token_address: kind === 'buy' ? TOKEN : QUOTE,
  from_token_amount: kind === 'buy' ? '0.5' : '1000', to_token_amount: kind === 'buy' ? '2000' : '0.25',
  price_from_in_usd: kind === 'buy' ? '3000' : '0.0007', price_to_in_usd: kind === 'buy' ? '0.00075' : '3000',
  volume_in_usd: extra.usd || '1500', is_anomalous: extra.anomalous || false } })

test('trades read amounts and prices from the viewed token side, newest first', () => {
  const rows = parseTrades({ data: [trade('buy', { at: '2026-11-26T20:00:00Z' }), trade('sell', { at: '2026-11-26T21:00:00Z' }), { attributes: { kind: 'swap' } }] }, TOKEN.toUpperCase().replace('0X', '0x'))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].side, 'Sell')
  assert.equal(rows[0].amount, '1000')
  assert.equal(rows[0].price, 0.0007)
  assert.equal(rows[1].side, 'Buy')
  assert.equal(rows[1].amount, '2000')
  assert.equal(rows[1].price, 0.00075)
})

test('summary counts buys, sells, volume and unique traders, skipping flagged trades', () => {
  const rows = parseTrades({ data: [trade('buy', { t: 1, usd: '100' }), trade('buy', { t: 2, usd: '50', wallet: '0x' + 'd'.repeat(40) }), trade('sell', { t: 3, usd: '30' }), trade('sell', { t: 4, usd: '9999', anomalous: true })] }, TOKEN)
  assert.deepEqual(summarize(rows), { buys: 2, sells: 1, buyUsd: 150, sellUsd: 30, traders: 2 })
})
