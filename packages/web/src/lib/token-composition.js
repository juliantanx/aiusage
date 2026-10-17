/**
 * Shares of the home page's token composition bar, in percent.
 *
 * Thinking (reasoning) tokens are stored apart from output tokens, so a bar
 * built from input, output and cache alone would leave them out. They are
 * generated tokens billed at the output price, so they are shown in the
 * output segment and the four segments add up to the whole total.
 */
export function tokenComposition(data) {
  const input = Number(data?.inputTokens) || 0
  const output = (Number(data?.outputTokens) || 0) + (Number(data?.thinkingTokens) || 0)
  const cacheRead = Number(data?.cacheReadTokens) || 0
  const cacheWrite = Number(data?.cacheWriteTokens) || 0
  const total = input + output + cacheRead + cacheWrite
  const pct = (part) => (total > 0 ? (part / total) * 100 : 0)
  return {
    inputPct: pct(input),
    outputPct: pct(output),
    cacheReadPct: pct(cacheRead),
    cacheWritePct: pct(cacheWrite),
  }
}
