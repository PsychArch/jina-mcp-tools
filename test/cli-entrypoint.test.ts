import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const cliPath = resolve("dist/cli.js");
const indexUrl = pathToFileURL(resolve("dist/index.js")).href;

const cleanEnvironment = (): Record<string, string> => Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[0] !== "JINA_API_KEY" && entry[1] !== undefined
  )
);

const runHelp = (entrypoint: string) => spawnSync(
  process.execPath,
  [entrypoint, "--help"],
  {
    encoding: "utf8",
    env: cleanEnvironment(),
    timeout: 5000
  }
);

const createCliSymlink = (): { directory: string; path: string } => {
  const directory = mkdtempSync(join(tmpdir(), "jina-mcp-tools-bin-"));
  const path = join(directory, "jina-mcp-tools");
  symlinkSync(relative(directory, cliPath), path);
  return { directory, path };
};

describe("compiled CLI entrypoint", () => {
  it("runs directly", () => {
    const result = runHelp(cliPath);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage: jina-mcp-tools [options]");
  });

  it.skipIf(process.platform === "win32")("runs through an npm-style symlink", () => {
    const fixture = createCliSymlink();

    try {
      const result = runHelp(fixture.path);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Usage: jina-mcp-tools [options]");
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "serves MCP over stdio through an npm-style symlink",
    async () => {
      const fixture = createCliSymlink();
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fixture.path],
        env: cleanEnvironment(),
        stderr: "pipe"
      });
      const client = new Client({ name: "cli-entrypoint-test", version: "1.0.0" });

      try {
        await client.connect(transport, { timeout: 5000 });
        const result = await client.listTools(undefined, { timeout: 5000 });

        expect(result.tools.map((tool) => tool.name)).toContain("jina_reader");
      } finally {
        await client.close();
        rmSync(fixture.directory, { force: true, recursive: true });
      }
    },
    10000
  );

  it("keeps the compiled library entrypoint import-safe", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(indexUrl)})`],
      {
        encoding: "utf8",
        env: cleanEnvironment(),
        timeout: 5000
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
