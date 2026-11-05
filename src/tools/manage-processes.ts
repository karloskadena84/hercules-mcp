import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";

export function registerManageProcessesTool(server: McpServer) {
  server.registerTool(
    "manage_heavy_processes",
    {
      description:
        "Lista los procesos que más RAM consumen y permite cerrarlos de forma segura y guiada. Primero muestra el ranking. Solo cierra procesos cuando se indica el nombre exacto y confirm=true. Funciona en Windows y macOS.",
      inputSchema: z.object({
        action: z
          .enum(["list", "kill"])
          .default("list")
          .describe("list = solo mostrar los que más consumen RAM. kill = intentar cerrar un proceso concreto"),
        processName: z
          .string()
          .optional()
          .describe("Nombre exacto del proceso a cerrar (solo cuando action=kill). Ejemplo: chrome, Discord, SpotLight"),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe("Debe ser true para cerrar realmente el proceso. Por seguridad."),
      }),
    },
    async ({ action, processName, confirm }) => {
      const platform = detectPlatform();
      const lines: string[] = [];

      lines.push(`Plataforma: ${platform}`);
      lines.push(`Acción: ${action}`);
      lines.push("");

      // ===== LISTAR =====
      if (action === "list") {
        if (platform === "windows") {
          const top = safeExec(
            `powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 Name,Id,@{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress"`
          );
          if (top) {
            try {
              const list = JSON.parse(top);
              const arr = Array.isArray(list) ? list : [list];
              lines.push("Top procesos por consumo de RAM:");
              lines.push("");
              arr.forEach((p: any, i: number) => {
                lines.push(`${i + 1}. ${p.Name} (PID ${p.Id}) → ${p.RAM_MB} MB`);
              });
              lines.push("");
              lines.push("Para cerrar uno, dime el nombre exacto (ejemplo: chrome) y confirma.");
            } catch {
              lines.push("No se pudo obtener la lista detallada. Usa el Administrador de tareas.");
            }
          } else {
            lines.push("No se pudo listar procesos (error de PowerShell).");
          }
        } else if (platform === "macos") {
          const top = safeExec(`ps -eo pid,rss,comm -r | head -13`);
          if (top) {
            lines.push("Top procesos por consumo de RAM (RSS en KB):");
            lines.push("");
            lines.push(top);
            lines.push("");
            lines.push("Para cerrar uno, dime el nombre del proceso (columna COMMAND) y confirma.");
          } else {
            lines.push("No se pudo listar procesos.");
          }
        } else {
          const top = safeExec(`ps -eo pid,rss,comm --sort=-rss | head -13`);
          if (top) {
            lines.push("Top procesos por RAM:");
            lines.push(top);
          }
        }

        lines.push("");
        lines.push("⚠️  No cierres procesos del sistema (ejemplo: System, kernel_task, csrss, winlogon, WindowServer).");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // ===== KILL =====
      if (action === "kill") {
        if (!processName || processName.trim().length < 2) {
          return {
            content: [{ type: "text", text: "Debes indicar el nombre del proceso (processName). Ejemplo: chrome, Discord, Slack." }],
          };
        }

        const name = processName.trim();

        // Lista negra básica de procesos críticos
        const critical = [
          "system", "csrss", "winlogon", "services", "lsass", "svchost",
          "explorer", "dwm", "fontdrvhost", "kernel_task", "launchd",
          "WindowServer", "loginwindow", "UserEventAgent", "systemstats"
        ];
        if (critical.some((c) => name.toLowerCase().includes(c.toLowerCase()))) {
          return {
            content: [{
              type: "text",
              text: `⚠️  "${name}" parece un proceso crítico del sistema. Hércules no lo cerrará por seguridad.`,
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: "text",
              text: `Modo seguro: para cerrar "${name}" debes llamar de nuevo con confirm=true.\n\nEsto cerrará todas las ventanas de ese programa. ¿Estás seguro?`,
            }],
          };
        }

        // Ejecutar cierre
        let result: string | null = null;
        if (platform === "windows") {
          result = safeExec(
            `powershell -NoProfile -Command "Get-Process -Name '${name.replace(/'/g, "")}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; if ($?) { 'closed' } else { 'not_found_or_failed' }"`
          );
        } else if (platform === "macos") {
          // Primero intento amable, luego force
          result = safeExec(`pkill -x "${name}" 2>/dev/null && echo closed || pkill -f "${name}" 2>/dev/null && echo closed || echo not_found_or_failed`);
        } else {
          result = safeExec(`pkill -f "${name}" 2>/dev/null && echo closed || echo not_found_or_failed`);
        }

        if (result && result.includes("closed")) {
          lines.push(`✅ Proceso "${name}" cerrado correctamente.`);
          lines.push("La RAM que ocupaba debería liberarse en unos segundos.");
          lines.push("Puedes volver a ejecutar evaluate_system para ver la mejora.");
        } else {
          lines.push(`No se pudo cerrar "${name}". Posibles causas:`);
          lines.push("• El nombre no es exacto (prueba con list primero)");
          lines.push("• El proceso requiere permisos de administrador");
          lines.push("• Ya no estaba en ejecución");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      return { content: [{ type: "text", text: "Acción no reconocida." }] };
    }
  );
}
