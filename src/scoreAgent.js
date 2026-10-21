/**
 * @typedef {Object} AgentRecord
 * @property {number} [listing_age_days] days since the listing went live
 * @property {number} [accepted] accepted deliveries
 * @property {number} [rejected] rejected deliveries
 * @property {string} [admission_test] 'pass' or 'fail', anything else means not taken
 * @property {boolean|string} [aiax_ready] true, 'partial' or false
 * @property {number} [acp_score] outside trust input from ACP, 0 to 100
 *
 * @typedef {Object} ScoreResult
 * @property {number} score 0 to 100
 * @property {'unproven'|'bronze'|'silver'|'gold'} tier
 * @property {string[]} reasons plain sentences, one per part
 */

const TIERS = ['unproven', 'bronze', 'silver', 'gold'];

function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function deliveryPart(record) {
  const accepted = Math.max(0, Number(record.accepted) || 0);
  const rejected = Math.max(0, Number(record.rejected) || 0);
  const total = accepted + rejected;
  if (total === 0) return { points: 0, accepted: 0, rejected: 0, total: 0, rate: 0 };
  const rate = accepted / total;
  const volume = Math.min(1, total / 6);
  return { points: 40 * rate * volume, accepted, rejected, total, rate: round2(rate) };
}

function admissionPart(record) {
  const v = record.admission_test;
  if (v === true || v === 'pass' || v === 'passed') return 20;
  if (v === false || v === 'fail' || v === 'failed') return 0;
  return 10;
}

function aiaxPart(record) {
  const v = record.aiax_ready;
  if (v === true) return 15;
  if (v === 'partial') return 8;
  return 0;
}

function acpPart(record) {
  return clamp(Number(record.acp_score), 0, 100) / 100 * 15;
}

function agePart(record) {
  const age = Number(record.listing_age_days);
  if (!Number.isFinite(age) || age <= 0) return 0;
  return Math.min(1, age / 180) * 10;
}

function tierFor(score) {
  if (score < 40) return 'unproven';
  if (score < 60) return 'bronze';
  if (score < 80) return 'silver';
  return 'gold';
}

/**
 * Cerberus chamber 2: a pure trust score from an agent record.
 *
 * Parts: delivery 40, admission test 20, AIAX readiness 15,
 * ACP score 15, listing age 10. An optional outside score blends as a
 * second opinion with 80 percent record and 20 percent outside, which
 * moves the tier by at most one step. An agent with no accepted delivery
 * is always unproven, never refused. Never throws.
 *
 * @param {AgentRecord|null|undefined} record
 * @param {number} [outside] optional second opinion, 0 to 100
 * @returns {ScoreResult}
 */
export function scoreAgent(record, outside) {
  const r = record && typeof record === 'object' ? record : {};
  const reasons = [];

  const delivery = deliveryPart(r);
  reasons.push('delivery: ' + delivery.accepted + ' accepted and ' + delivery.rejected +
    ' rejected give ' + round2(delivery.points) + ' of 40');

  const admission = admissionPart(r);
  const admissionText = admission === 20 ? 'pass' : admission === 0 ? 'fail' : 'not taken';
  reasons.push('admission test ' + admissionText + ' gives ' + admission + ' of 20');

  const aiax = aiaxPart(r);
  reasons.push('aiax readiness ' + (aiax === 15 ? 'full' : aiax === 8 ? 'partial' : 'missing') +
    ' gives ' + aiax + ' of 15');

  const acp = acpPart(r);
  reasons.push('acp score ' + round2(clamp(Number(r.acp_score), 0, 100)) + ' gives ' +
    round2(acp) + ' of 15');

  const age = agePart(r);
  const ageDays = Math.max(0, Math.round(Number(r.listing_age_days) || 0));
  reasons.push('listing age ' + ageDays + ' days gives ' + round2(age) + ' of 10');

  let score = delivery.points + admission + aiax + acp + age;
  if (Number.isFinite(Number(outside))) {
    const out = clamp(Number(outside), 0, 100);
    const before = tierFor(clamp(score, 0, 100));
    score = 0.8 * score + 0.2 * out;
    const after = tierFor(clamp(score, 0, 100));
    reasons.push('outside score ' + round2(out) + ' blends 20 percent into the total and moves ' +
      'the tier from ' + before + ' to ' + after);
  }

  score = round2(clamp(score, 0, 100));

  let tier = tierFor(score);
  if (delivery.accepted <= 0) {
    tier = 'unproven';
    reasons.push('no accepted delivery yet, the tier stays unproven whatever the score');
  }

  if (TIERS.indexOf(tier) === -1) tier = 'unproven';

  return { score, tier, reasons };
}

export default scoreAgent;
