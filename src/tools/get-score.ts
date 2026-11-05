import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import os from "node:os";
import { getPlatformInfo, detectPlatform } from "../utils/platform.js";

export function registerGetScoreTool(server: McpServer) {
  server.registerTool(
    "get_performance_score",
    {
      description: "Devuelve una puntuación rápida de salud del rendimiento (0-100). Más rápida que evaluate_system.",
      inputSchema: z.object({}),
    },
    async () => {
      const info = getPlatformInfo();
      const platform = detectPlatform();
      const memUsedPct = Math.round(((info.totalMemoryGB - info.freeMemoryGB) / info.totalMemoryGB) * 100);

      let score = 100;
      if (memUsedPct > 90) score -= 25;
      else if (memUsedPct > 75) score -= 12;

      if (platform !== "windows") {
        const load1 = os.loadavg()[0];
        if (load1 > info.cpus * 1.5) score -= 20;
        else if (load1 > info.cpus) score -= 10;
      }

      if (info.uptimeHours > 24 * 14) score -= 5;
      score = Math.max(0, Math.min(100, score));

      const label = score >= 85 ? "Excelente" : score >= 70 ? "Bueno" : score >= 50 ? "Aceptable" : "Necesita atención";

      return {
        content: [{
          type: "text",
          text: `Puntuación de rendimiento: ${score}/100 (${label})\nMemoria usada: ${memUsedPct}%\nPlataforma: ${info.platform} | Tiempo activo: ${info.uptimeHours}h`,
        }],
      };
    }
  );
}
