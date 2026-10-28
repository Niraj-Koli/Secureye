import "@testing-library/jest-dom/vitest";

import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { queryClient } from "@/app/queryClient";
import { useSession } from "@/shared/auth/store";

import { server } from "./server";

const initialSession = useSession.getState();

// jsdom has no layout; React Router's scroll restoration calls this on every navigation.
window.scrollTo = () => undefined;
// Nor CSS Houdini, which react-compare-slider uses for its smooth transitions.
if (typeof CSS.registerProperty !== "function") CSS.registerProperty = () => undefined;

// Uploads: Vitest's bridge from jsdom's File/FormData to Node's fetch (which MSW intercepts)
// sends a wrong Content-Length with jsdom 30, so multipart requests fail in tests only. Tests
// use Node's own classes instead, as the real app uses the browser's own.
const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor;
for (const [name, value] of Object.entries({
  FormData: NodeFormData,
  File: NodeFile,
  Blob: NodeBlob,
})) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

// Nor object URLs (file previews).
URL.createObjectURL = (blob: Blob) => `blob:test/${blob instanceof File ? blob.name : "blob"}`;
URL.revokeObjectURL = () => undefined;

// Pages are lazy-loaded; the first import of a page compiles it, which takes seconds on a busy
// machine (seen locally under load; CI runners can be slower still).
configure({ asyncUtilTimeout: 10_000 });

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  useSession.setState(initialSession, true);
  queryClient.clear();
});

afterAll(() => {
  server.close();
});
