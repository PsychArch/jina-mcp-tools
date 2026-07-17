#!/usr/bin/env node

import { runCli } from "./index.js";

void runCli().catch((error: Error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
