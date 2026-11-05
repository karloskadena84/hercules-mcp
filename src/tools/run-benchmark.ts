import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import os from "node:os";

export function registerRunBenchmarkTool(server: McpServer) {
  server.registerTool(
    "run_benchmark",
    {
      description: "Ejecuta micro-benchmarks ligeros (CPU, memoria, latencia del event-loop) y devuelve resultados para comparar antes/después.",
      inputSchema: z.object({
        durationMs: z.number().int().min(200).max(5000).optional().default(800).describe("Duración de la parte de CPU (ms)"),
      }),
    },
    async ({ durationMs }) => {
      const start = Date.now();
      let ops = 0;
      const end = start + durationMs;
      while (Date.now() < end) {
        Math.sqrt(Math.random() * 1000000);
        ops++;
      }
      const cpuTime = Date.now() - start;
      const opsPerSec = Math.round(ops / (cpuTime / 1000));

      const memStart = process.memoryUsage().heapUsed;
      const arr: number[] = [];
      for (let i = 0; i < 200000; i++) arr.push(Math.random());
      const memDelta = process.memoryUsage().heapUsed - memStart;

      const lagStart = Date.now();
      await new Promise((r) => setImmediate(r));
      const lag = Date.now() - lagStart;

      const result = {
        timestamp: new Date().toISOString(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        cpu: { durationMs: cpuTime, operations: ops, opsPerSecond: opsPerSec },
        memory: { heapDeltaBytes: memDelta, heapDeltaMB: Math.round((memDelta / 1024 / 1024) * 100) / 100 },
        eventLoop: { sampleLagMs: lag },
        note: "Estos son micro-benchmarks relativos, no puntuaciones de estándares de la industria.",
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
