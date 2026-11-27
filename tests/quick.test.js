import test from 'node:test'
import assert from 'node:assert/strict'
import { presetGroup, parsePresets, presetsFor, shareOfBalance, defaultQuickBuy } from '../src/QuickAmounts.jsx'

test('quote assets map to preset groups', () => {
  assert.equal(presetGroup('WETH'), 'ETH')
  assert.equal(presetGroup('eth'), 'ETH')
  assert.equal(presetGroup('USDG'), 'USD')
  assert.equal(presetGroup('SPCX'), 'SPCX')
  assert.equal(presetGroup('PONS'), null)
})

test('presets parse, dedupe, sort and cap at four', () => {
  assert.deepEqual(parsePresets('0.1, 0.01 0.05,0.05, -1, abc, 1, 2'), [0.01, 0.05, 0.1, 1])
  assert.deepEqual(parsePresets(''), [])
})

test('saved presets win over defaults; unknown assets get none', () => {
  assert.deepEqual(presetsFor('ETH', {}), defaultQuickBuy.ETH)
  assert.deepEqual(presetsFor('WETH', { quickBuy: { ETH: [0.2] } }), [0.2])
  assert.deepEqual(presetsFor('ETH', { quickBuy: { ETH: [] } }), defaultQuickBuy.ETH)
  assert.deepEqual(presetsFor('PONS', {}), [])
})

test('balance shares never exceed the balance', () => {
  assert.equal(shareOfBalance('100', 0.25), '25')
  assert.equal(shareOfBalance('0.333333333333', 0.5), '0.1666666666')
  assert.equal(shareOfBalance('12.5', 1), '12.5')
  assert.equal(shareOfBalance('0', 0.5), '')
  assert.ok(Number(shareOfBalance('1.0000009', 0.5)) <= 0.50000045)
})
