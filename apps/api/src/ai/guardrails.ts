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
  const corpus = numberTokens(JSON.stringify(toolResults));
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
  return numberTokens(answer).every((n) => allowed.has(n));
}

/** The fail-closed fallback: only tool data, no prose numbers. */
export function rawTableFallback(toolResults: Array<{ tool: string; result: unknown }>): string {
  return [
    'I need to re-check that. Here is the verified data:',
    ...toolResults.map((r) => `${r.tool}: ${JSON.stringify(r.result)}`),
  ].join('\n');
}
