import { test } from 'node:test';
import assert from 'node:assert/strict';
import scoreAgent from '../src/scoreAgent.js';

const TIERS = ['unproven', 'bronze', 'silver', 'gold'];

test('shape: score in range, tier valid, reasons are strings', () => {
  const out = scoreAgent({ accepted: 3, rejected: 1, admission_test: 'pass',
    aiax_ready: true, acp_score: 70, listing_age_days: 120 });
  assert.ok(Number.isFinite(out.score));
  assert.ok(out.score >= 0 && out.score <= 100);
  assert.ok(TIERS.includes(out.tier));
  assert.ok(Array.isArray(out.reasons) && out.reasons.length >= 5);
  for (const r of out.reasons) assert.equal(typeof r, 'string');
});

test('tier boundaries table driven', () => {
  const rows = [
    { name: 'exactly 40 is bronze',
      rec: { accepted: 6, rejected: 6, admission_test: 'pass' }, want: 'bronze', wantScore: 40 },
    { name: 'just under 40 is unproven',
      rec: { accepted: 2, rejected: 2, admission_test: 'pass', acp_score: 44 },
      want: 'unproven', wantScore: 39.93 },
    { name: 'exactly 60 is silver',
      rec: { accepted: 6, rejected: 0, admission_test: 'pass' }, want: 'silver', wantScore: 60 },
    { name: 'just under 60 is bronze',
      rec: { accepted: 6, rejected: 1, admission_test: 'pass', acp_score: 38 },
      want: 'bronze', wantScore: 59.99 },
    { name: 'just over 60 is silver',
      rec: { accepted: 6, rejected: 1, admission_test: 'pass', acp_score: 39 },
      want: 'silver', wantScore: 60.14 },
    { name: 'exactly 80 is gold',
      rec: { accepted: 6, rejected: 0, admission_test: 'pass', acp_score: 66.6667, listing_age_days: 180 },
      want: 'gold', wantScore: 80 },
    { name: 'just under 80 is silver',
      rec: { accepted: 6, rejected: 0, admission_test: 'pass', acp_score: 66, listing_age_days: 180 },
      want: 'silver', wantScore: 79.9 },
    { name: 'just over 80 is gold',
      rec: { accepted: 6, rejected: 0, admission_test: 'pass', acp_score: 67, listing_age_days: 180 },
      want: 'gold', wantScore: 80.05 },
  ];
  for (const row of rows) {
    const out = scoreAgent(row.rec);
    assert.equal(out.tier, row.want, row.name);
    assert.equal(out.score, row.wantScore, row.name);
  }
});

test('an unproven agent is never refused, even with a high score', () => {
  const high = scoreAgent({ accepted: 0, rejected: 0, admission_test: 'pass',
    aiax_ready: true, acp_score: 100, listing_age_days: 400 });
  assert.ok(high.score >= 60, 'score stays high, got ' + high.score);
  assert.equal(high.tier, 'unproven');
  for (const bad of [null, undefined, {}, { accepted: -5, acp_score: 'x' }]) {
    const out = scoreAgent(bad);
    assert.ok(TIERS.includes(out.tier));
    assert.ok(out.score >= 0 && out.score <= 100);
  }
});

test('an outside score moves the tier by at most one step', () => {
  const records = [
    { accepted: 6, rejected: 6, admission_test: 'pass' },
    { accepted: 2, rejected: 2, admission_test: 'pass', acp_score: 44 },
    { accepted: 6, rejected: 1, admission_test: 'pass', acp_score: 38 },
    { accepted: 6, rejected: 1, admission_test: 'pass', acp_score: 39 },
    { accepted: 6, rejected: 0, admission_test: 'pass', acp_score: 66 },
    { accepted: 6, rejected: 0, admission_test: 'pass', acp_score: 67 },
    { accepted: 0, acp_score: 100, admission_test: 'pass' },
    { accepted: 10, rejected: 10, admission_test: 'fail', aiax_ready: 'partial' },
  ];
  for (const rec of records) {
    const base = TIERS.indexOf(scoreAgent(rec).tier);
    for (const outside of [0, 25, 50, 75, 100]) {
      const withOut = TIERS.indexOf(scoreAgent(rec, outside).tier);
      const step = Math.abs(withOut - base);
      assert.ok(step <= 1, 'moved ' + step + ' steps for ' + JSON.stringify(rec) +
        ' outside ' + outside);
    }
  }
});

test('the outside score blends as 80 percent record and 20 percent outside', () => {
  const rec = { accepted: 6, rejected: 0, admission_test: 'pass' };
  assert.equal(scoreAgent(rec).score, 60);
  assert.equal(scoreAgent(rec, 50).score, 58);
  assert.equal(scoreAgent(rec, 100).score, 68);
  assert.equal(scoreAgent(rec, 0).score, 48);
});

test('clamps and determinism', () => {
  const rec = { accepted: 6, rejected: 0, admission_test: 'pass',
    acp_score: 150, listing_age_days: 9999 };
  const a = scoreAgent(rec, 150);
  const b = scoreAgent(rec, 150);
  assert.deepEqual(a, b);
  assert.ok(a.score <= 100);
  const low = scoreAgent({ accepted: 0, acp_score: -20, listing_age_days: -100 }, -30);
  assert.ok(low.score >= 0);
  assert.equal(low.tier, 'unproven');
});
