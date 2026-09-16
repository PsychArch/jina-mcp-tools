// Only loaded by the E2E child processes. Keep production URLs and request
// construction intact, but send upstream traffic to an isolated local fixture.
const nativeFetch = globalThis.fetch;
const fixtureOrigin = process.env.JINA_TEST_UPSTREAM;
if (!fixtureOrigin || new URL(fixtureOrigin).hostname !== "127.0.0.1") {
  throw new Error("A loopback JINA_TEST_UPSTREAM is required");
}
globalThis.fetch = (input, init) => {
  const original = new Request(input, init);
  const headers = new Headers(original.headers);
  headers.set("x-test-original-url", original.url);
  return nativeFetch(new Request(fixtureOrigin, original), { headers });
};
