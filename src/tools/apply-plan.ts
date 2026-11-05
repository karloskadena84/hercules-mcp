import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform } from "../utils/platform.js";

export function registerApplyPlanTool(server: McpServer) {
  server.registerTool(
    "apply_optimization_plan",
    {
      description: "Aplica un plan de optimización. Siempre hace dry-run primero a menos que confirm=true. Crea una instantánea de rollback de las acciones realizadas.",
      inputSchema: z.object({
        planId: z.string().optional().describe("Identificador opcional del plan de una evaluación anterior"),
        confirm: z.boolean().optional().default(false).describe("Debe ser true para aplicar cambios reales. Por defecto es simulación."),
        include: z.array(z.enum(["startup", "caches", "power", "services"])).optional().default(["startup", "caches"]).describe("Categorías a incluir"),
      }),
    },
    async ({ planId, confirm, include }) => {
      const platform = detectPlatform();
      const lines: string[] = [];
      lines.push("=== Aplicación del Plan de Optimización (Hércules) ===");
      lines.push(`Plataforma: ${platform}`);
      lines.push(`Plan ID: ${planId ?? "(último / por defecto)"}`);
      lines.push(`Confirmar: ${confirm}`);
      lines.push(`Categorías: ${include.join(", ")}`);
      lines.push("");

      if (!confirm) {
        lines.push("MODO SIMULACIÓN — no se realizarán cambios.");
        lines.push("");
        lines.push("Acciones propuestas:");
        if (include.includes("startup")) lines.push("  • Revisar y sugerir desactivar elementos de inicio no esenciales");
        if (include.includes("caches")) lines.push("  • Limpiar cachés y archivos temporales seguros del usuario");
        if (include.includes("power")) lines.push("  • Sugerir perfil de energía / rendimiento óptimo");
        if (include.includes("services")) lines.push("  • Listar servicios de terceros que se pueden desactivar con seguridad");
        lines.push("");
        lines.push("Para aplicar, vuelve a llamar con confirm=true después de revisar.");
      } else {
        lines.push("MODO APLICAR solicitado.");
        lines.push("");
        lines.push("En esta implementación de referencia las mutaciones del sistema se simulan y solo se registran. Una versión de producción:");
        lines.push("  1. Guardaría el estado actual");
        lines.push("  2. Aplicaría solo cambios reversibles y aprobados por el usuario");
        lines.push("  3. Escribiría un script de rollback");
        lines.push("  4. Volvería a evaluar la puntuación después de los cambios");
        lines.push("");
        lines.push("Token de rollback (simulado): rollback_" + Date.now());
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
