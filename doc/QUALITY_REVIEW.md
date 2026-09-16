# Project quality review — 2026-09-16

The in-progress MCP SDK v2 migration passes local verification, with substantially
stronger transport coverage added during this review. This is evidence for the
tested application flows, not a claim of complete protocol conformance or live
provider compatibility. Existing uncommitted migration changes were preserved.

## Fixed findings

1. **Tool schemas allowed invalid numeric inputs.** Reader page numbers and search
   result counts accepted fractions and non-positive values. Negative reader
   timeouts could also succeed on cache hits without validation. The new E2E
   matrix initially failed in all eight authenticated scenarios. Page and count
   schemas now require positive integers; custom timeout requires whole seconds
   from 1 through 2147483, avoiding Node timer overflow after conversion to
   milliseconds. Invalid calls return tool errors before upstream requests.
2. **Direct markdown negotiation accepted HTML.** The reader previously treated
   any non-empty successful response from an allowlisted host as markdown. It
   now checks for `text/markdown` (including media-type parameters) and otherwise
   falls back to Jina. All four anonymous transport/protocol cases exercise a
   successful HTML response followed by fallback.
3. **Compiled tool execution lacked broad coverage.** Existing stdio tests
   covered discovery, while HTTP covered one reader call with a global fetch
   mock. Twelve new E2E scenarios exercise compiled servers in child processes,
   actual MCP transport and local upstream HTTP traffic. Tests now participate
   in TypeScript verification as well as Vitest execution.

## Validation

| Check | Local result |
|---|---|
| Baseline verification | 48 tests passed |
| Final `pnpm verify` | Source/test typechecks, build, 60 tests passed in 7 files |
| New compiled E2E matrix | 12 scenarios passed |
| `pnpm pack --dry-run` | Passed |
| `git diff --check` | Passed |
| `pnpm audit --prod --json` | 5 moderate; 0 high/critical |
| Runtime used locally | Node v26.5.0 |

The existing Node 20 CI job discovers the new tests automatically. It was not run
remotely during this review. No live Jina requests, publish, commit or push were
performed. A package dry run does not establish successful installation in a
fresh consumer project.

## Remaining findings and priorities

**Dependency maintenance:** the current production lockfile contains `qs@6.15.3`
and `hono@4.13.1`. The audit reports two qs advisories and three Hono advisories;
the reported fixed versions covering all five are qs 6.16.0 and Hono 4.13.5.
Resolve compatible versions through the existing dependency-age policy, inspect
the resulting lockfile diff, and rerun the transport matrix. This review did not
change dependency resolution. The audit identifies vulnerable package versions;
it does not demonstrate reachability in this application.

**Network lifecycle:** search and Jina reader fetches do not set a local abort
deadline. The reader sends `X-Timeout` to Jina, but that does not bound the local
request itself; direct GitHub reads also omit the supplied timeout. A future
change should define a common deadline/cancellation policy and test a stalled
upstream through both transports. Client test timeouts currently bound the test
request, not production upstream work.

**Library configuration:** `createMcpServer({ apiKey })` controls whether search
is registered, but outgoing authentication is read independently from the
environment by `createHeaders`. An embedding caller supplying a key different
from the environment can get mismatched registration and credentials. The CLI
uses the environment consistently, so this does not invalidate the tested CLI
path. Follow up by injecting one explicit credential configuration into handlers.

**Coverage boundaries:** cancellation, malformed upstream payloads, concurrent
requests, graceful shutdown, real browser CORS, HTTP CLI listener wiring and
fresh tarball installation still deserve focused tests. The HTTP fixture uses
the compiled application factory with an ephemeral port; it does not launch the
HTTP CLI. Deterministic fixtures cannot establish live API availability or
account-specific VIP access.

## Testing approach and sources

Use fast unit tests for pure pagination/cache logic, real SDK clients and actual
transports for application E2E, and small separately invoked live-provider
checks. The official [SDK client guide](https://ts.sdk.modelcontextprotocol.io/v2/clients/connect)
describes child-process stdio and HTTP transports as well as in-memory pairs.
The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
provides the protocol-error versus tool-error distinction asserted by this suite.
The [official Inspector](https://github.com/modelcontextprotocol/inspector) remains
useful for interactive cross-client debugging.

The suite isolates the upstream fetch boundary only, retaining real registration,
wire serialization, schemas, handlers, tokenization, pagination and cache.
It uses dummy keys and explicit child environments, ephemeral ports, bounded
startup/request waits and cleanup. Details and reproducible commands are in
[TEST_PLAN.md](TEST_PLAN.md).
