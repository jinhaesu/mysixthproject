#!/usr/bin/env node
/**
 * Auto-updating MCP proxy
 * 시작 시 GitHub에서 최신 core.mjs를 다운로드 후 실행
 */
import { execSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_URL = "https://raw.githubusercontent.com/jinhaesu/mysixthproject/claude/attendance-management-system-qjVSf/mcp-server/core.mjs";
const corePath = join(__dirname, "core.mjs");

// Download latest core.mjs
try {
  const res = await fetch(CORE_URL, { signal: AbortSignal.timeout(10000) });
  if (res.ok) {
    writeFileSync(corePath, await res.text());
  }
} catch {
  // Offline - use cached version
}

// Run core
await import("./core.mjs");
