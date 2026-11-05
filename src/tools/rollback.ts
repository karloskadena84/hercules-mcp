import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export function registerRollbackTool(server: McpServer) {
  server.registerTool(
    "rollback_last_changes",
    {
      description: "Intenta deshacer el último conjunto de optimizaciones aplicadas por Hércules. Usa la instantánea de rollback creada durante apply_optimization_plan.",
      inputSchema: z.object({
        token: z.string().optional().describe("Token de rollback específico. Si se omite, usa el más reciente."),
      }),
    },
    async ({ token }) => {
      const lines: string[] = [];
      lines.push("=== Rollback (Hércules) ===");
      lines.push(`Token: ${token ?? "(más reciente)"}`);
      lines.push("");
      lines.push("En esta implementación de referencia aún no existen instantáneas persistentes. Una versión de producción restauraría:");
      lines.push("  • Elementos de inicio previamente desactivados");
      lines.push("  • Ajustes del plan de energía");
      lines.push("  • Cualquier cambio en el tipo de inicio de servicios");
      lines.push("");
      lines.push("Estado: No se encontraron datos de rollback activos (o ya está limpio).");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
