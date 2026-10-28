import { HttpResponse } from "msw/http";

/** A server-sent event stream a test can push events into, then close. */
export function eventStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<BufferSource> | undefined;
  const body = new ReadableStream<BufferSource>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: () => new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } }),
    send(event: string, data: unknown) {
      controller?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    close() {
      controller?.close();
    },
  };
}
