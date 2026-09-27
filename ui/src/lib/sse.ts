/**
 * Minimal SSE (text/event-stream) line reader over a fetch body stream.
 * Yields each non-empty trimmed line; the `data:` prefix is left for the
 * parser (`StreamParser.parseLine` handles it).
 */
export async function* readSSELines(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield line;
      idx = buffer.indexOf('\n');
    }
  }
  const rest = buffer.trim();
  if (rest) yield rest;
}