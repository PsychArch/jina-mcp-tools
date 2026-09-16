# Live Jina MCP test — 2026-09-16

Tested the current compiled working tree with the real `JINA_API_KEY` from the
process environment. No credentials were printed or written into the report.
Completed at 12:09 UTC using Node v26.5.0.

| Transport / protocol | Discovery | Reader and pagination | Search |
|---|---|---|---|
| stdio / legacy / standard | Pass | Pass, 6 pages | Pass, 2 results |
| HTTP / modern / standard | Pass | Pass, 6 pages | Pass, 2 results |
| stdio / modern / VIP | Pass | Not repeated | Initial upstream timeout; retry passed, 2 results |
| HTTP / legacy / VIP | Pass | Not repeated | Pass, 2 results |

The initial run passed 9 checks and failed 1. A single targeted retry passed both
discovery and VIP search. This establishes successful live calls for every tested
case, with one observed transient failure; the initial run was not a clean pass.

The failed VIP response was an MCP tool error containing `timeout of 5000ms
exceeded`, received after approximately 6.4 seconds. The smoke client's own
deadline was 45 seconds. The same stdio/modern/VIP case succeeded on retry in
1.6 seconds, consistent with a transient upstream failure rather than a persistent
transport incompatibility. No automatic production retry behavior was added.

The reader fetched the MCP tools specification through Jina with a 256-token
page budget. First, second and last pages were checked; repeated first-page
content matched exactly and the final page had no next-page hint. Search checked
non-empty titles, HTTP(S) result URLs and a maximum of two results.

HTTP additionally rejected unauthenticated requests with 401 and authenticated
unsupported GET requests with 405. HTTP used the compiled application factory
on a real loopback listener; stdio launched the compiled production CLI.

The run made seven intended provider requests including the one VIP retry.
Follow-up reader page calls used the application's cache. Billing amounts were
not measured. Results establish a small live smoke, not availability guarantees,
all test-plan URLs, every page's content, or full MCP conformance.

Reproduce with an exported `JINA_API_KEY`:

```sh
pnpm build
node scripts/live-mcp.mjs
# One-case retry:
node scripts/live-mcp.mjs stdio/modern/vip
```

The script prints redacted JSON summaries and returns nonzero on failed checks.
It is opt-in and excluded from normal tests and CI.
