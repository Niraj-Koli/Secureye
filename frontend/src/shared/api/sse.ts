import { authorizedFetch } from "./client";
import { apiErrorFromResponse } from "./errors";

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/**
 * Server-Sent Events over fetch. `EventSource` can't send an Authorization header, so the
 * stream is read and parsed here instead. There is no automatic reconnect: the API's streams
 * end by themselves when the job finishes, and callers decide whether to open another.
 */
export async function* streamEvents(
  path: string,
  { signal }: { signal?: AbortSignal } = {},
): AsyncGenerator<SseMessage> {
  const response = await authorizedFetch(path, {
    headers: { Accept: "text/event-stream" },
    signal: signal ?? null,
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  if (response.body === null) return;
  yield* parseSse(response.body);
}

/** Parse an event stream as the HTML standard specifies ("Interpreting an event stream"). */
export async function* parseSse(stream: ReadableStream<BufferSource>): AsyncGenerator<SseMessage> {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let lastId = "";

  function processLine(line: string): SseMessage | null {
    if (line === "") {
      const message: SseMessage | null =
        data.length > 0 ? { event: event || "message", data: data.join("\n") } : null;
      if (message && lastId) message.id = lastId;
      event = "";
      data = [];
      return message;
    }
    if (line.startsWith(":")) return null; // comment, used as a keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id" && !value.includes("\0")) lastId = value;
    return null;
  }

  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    for (;;) {
      const end = /\r\n|\r|\n/.exec(buffer);
      // A trailing "\r" may be the first half of "\r\n": wait for the next chunk.
      if (end === null || (end[0] === "\r" && end.index === buffer.length - 1)) break;
      const message = processLine(buffer.slice(0, end.index));
      buffer = buffer.slice(end.index + end[0].length);
      if (message) yield message;
    }
  }
  // An event that isn't followed by a blank line before the stream ends is discarded.
}
