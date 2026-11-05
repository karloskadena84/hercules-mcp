import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";

export function registerPowerPlanTool(server: McpServer) {
  server.registerTool(
    "set_power_plan",
    {
      description:
        "Consulta o cambia el plan de energía de Windows (Equilibrado, Alto rendimiento, Ahorro de energía). En macOS solo informa el estado. Por defecto solo muestra el plan actual; con apply=true intenta cambiarlo.",
      inputSchema: z.object({
        plan: z
          .enum(["high", "balanced", "saver", "status"])
          .optional()
          .default("status")
          .describe("high = Alto rendimiento, balanced = Equilibrado, saver = Ahorro, status = solo consultar"),
        apply: z
          .boolean()
          .optional()
          .default(false)
          .describe("Debe ser true para cambiar realmente el plan. Por defecto solo informa."),
      }),
    },
    async ({ plan, apply }) => {
      const platform = detectPlatform();
      const lines: string[] = [];

      if (platform === "macos") {
        lines.push("=== Energía en macOS ===");
        lines.push("");
        const pm = safeExec("pmset -g 2>/dev/null | head -20");
        if (pm) {
          lines.push("Estado actual (pmset):");
          lines.push(pm);
        }
        lines.push("");
        lines.push("En Mac se recomienda usar: Ajustes del Sistema → Batería / Ahorro de energía.");
        lines.push("Para máximo rendimiento conecta el cargador y desactiva 'Optimización de batería' temporalmente.");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      if (platform !== "windows") {
        return {
          content: [{ type: "text", text: "Cambio de plan de energía solo está implementado en Windows." }],
        };
      }

      lines.push("=== Plan de energía de Windows ===");
      lines.push("");

      // Listar planes y el activo
      const list = safeExec(`powercfg /list`);
      if (list) {
        lines.push("Planes disponibles:");
        lines.push(list);
        lines.push("");
      }

      const active = safeExec(`powercfg /getactivescheme`);
      if (active) {
        lines.push("Plan activo ahora:");
        lines.push(active.trim());
        lines.push("");
      }

      if (plan === "status" || !apply) {
        lines.push("Para cambiar a Alto rendimiento llama con plan=\"high\" y apply=true.");
        lines.push("Otros valores: balanced, saver.");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // GUIDs estándar de Windows
      const guids: Record<string, string> = {
        high: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",      // Alto rendimiento
        balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",  // Equilibrado
        saver: "a1841308-3541-4fab-bc81-f71556f20b4a",     // Ahorro de energía
      };

      const guid = guids[plan];
      if (!guid) {
        lines.push("Plan no reconocido.");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      const result = safeExec(`powercfg /setactive ${guid}`);
      // powercfg no siempre devuelve texto; comprobamos el activo de nuevo
      const newActive = safeExec(`powercfg /getactivescheme`);

      lines.push(`Solicitud: cambiar a plan "${plan}"`);
      if (newActive && newActive.toLowerCase().includes(guid.toLowerCase().slice(0, 8))) {
        lines.push("✅ Plan de energía cambiado correctamente.");
        lines.push(newActive.trim());
      } else if (newActive) {
        lines.push("Resultado después del intento:");
        lines.push(newActive.trim());
        lines.push("");
        lines.push("Si no cambió, prueba a ejecutar Claude/Hércules como administrador.");
      } else {
        lines.push("No se pudo verificar el cambio. Prueba manualmente:");
        lines.push("Configuración → Sistema → Energía y batería → Modo de energía");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
