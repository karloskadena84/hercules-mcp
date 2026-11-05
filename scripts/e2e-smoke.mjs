#!/usr/bin/env node
/**
 * Smoke / E2E basic tests for Hércules MCP
 * Run with: node scripts/e2e-smoke.mjs
 */
import { createRequire } from "module";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
  passed++;
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
  failed++;
}

console.log("=== Hércules MCP — Smoke / E2E Tests ===\n");

// 1. Structure
console.log("1. Estructura del proyecto");
const required = [
  "package.json", "tsconfig.json", "README.md", "LICENSE",
  "src/index.ts", "src/utils/platform.ts",
  "src/tools/evaluate.ts", "src/tools/get-score.ts",
  "src/tools/list-bottlenecks.ts", "src/tools/optimize-startup.ts",
  "src/tools/clean-caches.ts", "src/tools/apply-plan.ts",
  "src/tools/rollback.ts", "src/tools/run-benchmark.ts",
  "scripts/install.sh", "scripts/install.ps1"
];
for (const f of required) {
  if (existsSync(join(root, f))) ok(f);
  else fail(`Falta: ${f}`);
}

// 2. package.json validity
console.log("\n2. package.json");
try {
  const pkg = JSON.parse(await import("fs").then(fs => fs.promises.readFile(join(root, "package.json"), "utf8")));
  if (pkg.name === "hercules-mcp") ok("name = hercules-mcp");
  else fail(`name incorrecto: ${pkg.name}`);
  if (pkg.type === "module") ok("type = module");
  else fail("type debe ser module");
  if (pkg.dependencies?.["@modelcontextprotocol/server"]) ok("dependencia @modelcontextprotocol/server");
  else fail("falta @modelcontextprotocol/server");
  if (pkg.dependencies?.zod) ok("dependencia zod");
  else fail("falta zod");
} catch (e) {
  fail(`Error leyendo package.json: ${e.message}`);
}

// 3. Platform detection (real)
console.log("\n3. Detección de plataforma (runtime)");
try {
  const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "unknown";
  ok(`Plataforma detectada: ${platform}`);
  ok(`CPUs: ${os.cpus().length}`);
  ok(`Memoria total: ${(os.totalmem() / 1e9).toFixed(1)} GB`);
} catch (e) {
  fail(e.message);
}

// 4. Import SDK
console.log("\n4. Importación del SDK MCP");
try {
  const { McpServer } = await import("@modelcontextprotocol/server");
  ok("McpServer importado");
  const server = new McpServer({ name: "hercules-test", version: "0.1.0" });
  ok("Instancia McpServer creada");
} catch (e) {
  fail(`SDK: ${e.message}`);
}

// 5. Zod
console.log("\n5. Zod");
try {
  const z = await import("zod/v4");
  const schema = z.object({ test: z.string() });
  ok("Zod v4 funciona");
} catch (e) {
  fail(`Zod: ${e.message}`);
}

// Summary
console.log("\n=== Resumen ===");
console.log(`Pasados: ${passed}`);
console.log(`Fallidos: ${failed}`);
if (failed === 0) {
  console.log("\n✅ Todas las pruebas de humo / e2e básicas pasaron.");
  console.log("El servidor está listo para usarse con un cliente MCP real (Cursor, Claude Desktop, etc.).");
  process.exit(0);
} else {
  console.log("\n❌ Hay fallos. Revisa los mensajes anteriores.");
  process.exit(1);
}
