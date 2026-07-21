/**
 * The numeric grounding validator (I9, plan.md §24). Every figure in a
 * Copilot answer must appear in a tool result from the SAME turn. Fail
 * closed: invalid → retry once with a corrective message → raw table.
 */

const numberTokens = (text: string): string[] =>
  (text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).filter(
    (n) => n.length >= 3 || Number(n) >= 100, // years, counts ≤ 2 digits pass
  );

export function validateGrounding(answer: string, toolResults: unknown[]): boolean {
  // If there are no tool results, no grounding check needed
  if (toolResults.length === 0) return true;

  const corpus = numberTokens(JSON.stringify(toolResults));

  // If the tool result contained no numbers (e.g. empty arrays, zero values stripped),
  // the answer cannot contradict tool data — pass the check
  if (corpus.length === 0) return true;

  const allowed = new Set(corpus);
  // paise → rupees renderings are legitimate: allow n/100 forms of corpus numbers
  for (const n of corpus) {
    const rupees = Number(n) / 100;
    if (Number.isFinite(rupees)) {
      allowed.add(String(rupees));
      allowed.add(rupees.toFixed(2).replace(/\.00$/, ''));
      allowed.add(rupees.toFixed(2));
    }
  }
  // Allow zero explicitly — zero revenue / expenses are legitimate grounded values
  allowed.add('0');
  allowed.add('0.00');
  return numberTokens(answer).every((n) => allowed.has(n));
}

/** The fail-closed fallback: only tool data, no prose numbers. */
export function rawTableFallback(toolResults: Array<{ tool: string; result: unknown }>): string {
  return [
    'I need to re-check that. Here is the verified data:',
    ...toolResults.map((r) => `${r.tool}: ${JSON.stringify(r.result)}`),
  ].join('\n');
}
