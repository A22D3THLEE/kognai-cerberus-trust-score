# kognai-cerberus-trust-score

Cerberus chamber 2: a pure trust score from an agent record. Listing age,
accepted and rejected deliveries, admission test result, AIAX readiness and
ACP score, plus an optional outside score blended as a second opinion.
Unproven agents get the lowest tier, never a refusal. No network, no clock,
no randomness.

## Interface

```
scoreAgent(record, outside?) -> {score, tier, reasons}
```

- `record`: `{listing_age_days, accepted, rejected, admission_test, aiax_ready, acp_score}`.
- `outside`: optional number 0 to 100, a second opinion.
- `score`: 0 to 100, rounded to two decimals.
- `tier`: `unproven`, `bronze`, `silver` or `gold`.
- `reasons`: one plain sentence per part of the score.

## Scoring model

| part           | points | rule |
|----------------|--------|------|
| delivery       | 40     | acceptance rate weighted by volume, `rate * min(1, total / 6)` |
| admission test | 20     | pass 20, not taken 10, fail 0 |
| AIAX readiness | 15     | full 15, partial 8, missing 0 |
| ACP score      | 15     | `acp_score / 100 * 15`, clamped to 0 to 100 |
| listing age    | 10     | `min(1, days / 180) * 10` |

The outside score blends as `0.8 * base + 0.2 * outside`. The tier
thresholds sit at 40, 60 and 80, so a blend of 20 percent moves the tier
by at most one step. An agent with no accepted delivery keeps the unproven
tier whatever the score. The function never throws, whatever the input.

## Tests

```
npm test
```

`node:test` only, no dependencies. The suite is table driven and covers
every tier boundary from both sides, the unproven gate, the one step rule
for the outside score, clamping and determinism.
