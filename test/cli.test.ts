import { describe, expect, it } from "vitest";
import { CliUsageError, DEFAULT_CONFIG, parseArgs } from "../src/index.js";

describe("parseArgs", () => {
  it("accepts valid flags", () => {
    expect(parseArgs([
      "--transport", "http",
      "--host", "0.0.0.0",
      "--port", "8787",
      "--tokens-per-page", "1234",
      "--search-endpoint", "vip",
      "--cache-size", "9"
    ])).toEqual({
      ...DEFAULT_CONFIG,
      transport: "http",
      host: "0.0.0.0",
      port: 8787,
      tokensPerPage: 1234,
      searchEndpoint: "vip",
      cacheSize: 9
    });
  });

  it.each([
    [["--port"], "Missing value"],
    [["--port", "--host"], "Expected a value"],
    [["--bogus"], "Unknown argument"],
    [["--port", "0"], "Expected a positive integer"],
    [["--port", "65536"], "Maximum allowed value"],
    [["--transport", "sse"], "Expected stdio or http"],
    [["--search-endpoint", "premium"], "Expected standard or vip"]
  ])("rejects invalid args %j", (args, expectedMessage) => {
    expect(() => parseArgs(args)).toThrow(CliUsageError);
    expect(() => parseArgs(args)).toThrow(expectedMessage);
  });

  it("binds localhost by default", () => {
    expect(parseArgs([]).host).toBe("127.0.0.1");
  });
});
