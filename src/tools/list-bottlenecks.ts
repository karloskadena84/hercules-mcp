import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import os from "node:os";
import { getPlatformInfo, detectPlatform, safeExec } from "../utils/platform.js";

export function registerListBottlenecksTool(server: McpServer) {
  server.registerTool(
    "list_bottlenecks",
    {
      description: "Lista los cuellos de botella de rendimiento ordenados por impacto estimado. Solo lectura.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().default(8),
      }),
    },
    async ({ limit }) => {
      const info = getPlatformInfo();
      const platform = detectPlatform();
      const bottlenecks: { severity: string; title: string; detail: string }[] = [];

      const memUsedPct = Math.round(((info.totalMemoryGB - info.freeMemoryGB) / info.totalMemoryGB) * 100);

      if (memUsedPct > 85) {
        bottlenecks.push({ severity: "alto", title: "Presión de memoria", detail: `${memUsedPct}% de RAM en uso (${info.freeMemoryGB} GB libres)` });
      } else if (memUsedPct > 70) {
        bottlenecks.push({ severity: "medio", title: "Uso elevado de memoria", detail: `${memUsedPct}% de RAM en uso` });
      }

      if (platform !== "windows") {
        const load1 = os.loadavg()[0];
        if (load1 > info.cpus * 1.2) {
          bottlenecks.push({
            severity: load1 > info.cpus * 1.8 ? "alto" : "medio",
            title: "Carga de CPU",
            detail: `Promedio 1 min: ${load1.toFixed(2)} en ${info.cpus} núcleos`,
          });
        }
      }

      if (info.uptimeHours > 24 * 10) {
        bottlenecks.push({
          severity: "bajo",
          title: "Tiempo de actividad largo",
          detail: `El sistema lleva ${info.uptimeHours} horas encendido. Pueden haberse acumulado archivos temporales.`,
        });
      }

      if (platform === "macos") {
        const login = safeExec(`osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null || true`);
        if (login) {
          const count = login.split(", ").filter(Boolean).length;
          if (count > 6) {
            bottlenecks.push({ severity: "medio", title: "Muchos elementos de inicio", detail: `${count} elementos se inician al arrancar` });
          }
        }
      }

      const limited = bottlenecks.slice(0, limit);
      if (limited.length === 0) {
        return { content: [{ type: "text", text: "No se detectaron cuellos de botella significativos. El sistema parece saludable." }] };
      }

      const text = limited.map((b, i) => `${i + 1}. [${b.severity.toUpperCase()}] ${b.title}\n   ${b.detail}`).join("\n\n");
      return { content: [{ type: "text", text: `Cuellos de botella detectados:\n\n${text}` }] };
    }
  );
}
