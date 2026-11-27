import test from 'node:test'
import assert from 'node:assert/strict'
import { ponsEstimate, orbitEstimate, fmt } from '../src/LaunchCostCalculator.jsx'

test('Pons estimate uses the live fee, creator share and graduation threshold', () => {
  const e = ponsEstimate({ curveFeeBps: 100, creatorShareBps: 7000, graduationThreshold: '4.2', launchFee: '0.0005' })
  assert.equal(e.feePct, 1)
  assert.ok(Math.abs(e.creatorPct - 0.7) < 1e-9)
  assert.ok(Math.abs(e.earnedAtGraduation - 0.0294) < 1e-9)
  assert.equal(e.upfront, 0.0005)
})

test('Orbit opening buy matches the backend constant-product estimate', () => {
  const costs = { baseFeeBps: 100, maxCreatorFeeBps: 1000, supply: '1000000000', virtualReserve: '1000', launchFee: '0' }
  const e = orbitEstimate(costs, '10', 100)
  const net = 10 * 0.98
  assert.ok(Math.abs(e.tokens - (net * 1e9) / (1000 + net)) < 1e-3)
  assert.ok(Math.abs(e.tradeFeePct - 2) < 1e-9)
  assert.equal(e.upfront, 10)
  assert.ok(e.priceImpactPct > 0)
  assert.equal(orbitEstimate(costs, '', 0).tokens, 0)
  assert.equal(orbitEstimate(costs, '10', 5000).creatorPct, 10)
})

test('formatting stays readable', () => {
  assert.equal(fmt(0), '0')
  assert.equal(fmt(0.0294), '0.0294')
  assert.equal(fmt(Number.NaN), '—')
})
