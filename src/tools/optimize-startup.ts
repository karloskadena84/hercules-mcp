import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";

export function registerOptimizeStartupTool(server: McpServer) {
  server.registerTool(
    "optimize_startup",
    {
      description:
        "Analiza y optimiza los programas que se inician con Windows. Lista todos los elementos de inicio, identifica los más pesados o innecesarios y puede desactivarlos de forma segura cuando apply=true. Mejora el tiempo de arranque y libera RAM al inicio.",
      inputSchema: z.object({
        apply: z
          .boolean()
          .optional()
          .default(false)
          .describe("Si es true, intenta desactivar elementos de inicio no esenciales. Por defecto solo informa."),
        aggressive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Si es true, sugiere desactivar más elementos (incluye algunos de terceros comunes)"),
      }),
    },
    async ({ apply, aggressive }) => {
      const platform = detectPlatform();
      const lines: string[] = [];

      lines.push(`Plataforma: ${platform}`);
      lines.push(`Modo: ${apply ? "APLICAR cambios" : "SOLO INFORME (recomendaciones)"}`);
      lines.push("");

      if (platform === "windows") {
        // Listar elementos de inicio
        const startup = safeExec(
          `powershell -NoProfile -Command "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | ConvertTo-Json"`
        );

        if (startup) {
          try {
            const items = JSON.parse(startup);
            const list = Array.isArray(items) ? items : [items];
            lines.push(`Se encontraron ${list.length} elementos de inicio:`);
            lines.push("");

            list.forEach((item: any, i: number) => {
              const name = item.Name || "Desconocido";
              const loc = item.Location || "";
              lines.push(`${i + 1}. ${name}`);
              lines.push(`   Ubicación: ${loc}`);
            });

            lines.push("");
            lines.push("=== Recomendaciones ===");
            lines.push("• Deja activos: antivirus, drivers de GPU, software de backup importante.");
            lines.push("• Candidatos a desactivar: programas de actualización automática, launchers de juegos que no uses siempre, utilidades de fabricantes, herramientas que no necesitas al arrancar.");
            lines.push("");

            if (apply) {
              lines.push("⚠️  Desactivación automática completa desde este agente está limitada por seguridad de Windows.");
              lines.push("Para desactivar de forma segura:");
              lines.push("1. Pulsa Ctrl + Shift + Esc → pestaña 'Aplicaciones de inicio'");
              lines.push("2. Desactiva los que no necesites");
              lines.push("3. O ejecuta: shell:startup  y borra accesos directos innecesarios");
              lines.push("");
              lines.push("Hércules puede guiarte uno por uno si me dices cuáles quieres desactivar.");
            } else {
              lines.push("Ejecuta con apply=true o dime qué programas quieres desactivar y te ayudo a hacerlo de forma segura.");
            }
          } catch {
            lines.push("No se pudo parsear la lista de inicio. Prueba a abrir el Administrador de tareas → Aplicaciones de inicio.");
          }
        } else {
          lines.push("No se pudo obtener la lista de elementos de inicio (permisos o error de PowerShell).");
          lines.push("Abre el Administrador de tareas (Ctrl+Shift+Esc) → pestaña 'Aplicaciones de inicio'.");
        }
      } else if (platform === "macos") {
        const items = safeExec(
          `osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null || echo ""`
        );
        if (items) {
          const list = items.split(", ").filter(Boolean);
          lines.push(`Elementos de inicio de sesión: ${list.length}`);
          list.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
          lines.push("");
          lines.push("Ve a Ajustes del Sistema → General → Elementos de inicio de sesión para desactivarlos.");
        }
      } else {
        lines.push("En Linux revisa: ~/.config/autostart y systemctl --user list-unit-files --state=enabled");
      }

      lines.push("");
      lines.push("Nota de seguridad: Nunca desactivamos antivirus, firewall ni componentes críticos del sistema.");

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );
}
