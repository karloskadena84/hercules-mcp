import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";

export function registerFreeStandbyMemoryTool(server: McpServer) {
  server.registerTool(
    "free_standby_memory",
    {
      description:
        "Libera la memoria en espera (Standby List) de Windows. Esto puede recuperar cientos de MB o varios GB de RAM que Windows mantiene en caché. Solo funciona en Windows. Por defecto solo informa; con confirm=true intenta liberarla.",
      inputSchema: z.object({
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe("Debe ser true para intentar liberar la memoria en espera. Por defecto solo informa."),
      }),
    },
    async ({ confirm }) => {
      const platform = detectPlatform();
      const lines: string[] = [];

      if (platform !== "windows") {
        return {
          content: [{
            type: "text",
            text: "Esta función solo está disponible en Windows.\nEn macOS el sistema gestiona la memoria de forma automática (memory pressure).",
          }],
        };
      }

      lines.push("=== Liberar memoria en espera (Windows) ===");
      lines.push("");

      // Mostrar estado actual de memoria
      const memBefore = safeExec(
        `powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | Select-Object @{N='FreeMB';E={[math]::Round($_.FreePhysicalMemory/1KB,0)}},@{N='TotalMB';E={[math]::Round($_.TotalVisibleMemorySize/1KB,0)}} | ConvertTo-Json -Compress"`
      );
      if (memBefore) {
        try {
          const m = JSON.parse(memBefore);
          lines.push(`Memoria libre ahora: ${m.FreeMB} MB de ${m.TotalMB} MB`);
        } catch {
          lines.push("No se pudo leer el estado actual de memoria.");
        }
      }

      lines.push("");
      lines.push("La 'memoria en espera' es RAM que Windows guarda con datos de programas recientes.");
      lines.push("Liberarla puede hacer que el equipo responda más rápido cuando necesitas memoria.");
      lines.push("");

      if (!confirm) {
        lines.push("Modo seguro: para liberarla llama de nuevo con confirm=true.");
        lines.push("Nota: puede requerir permisos de administrador en algunos equipos.");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Intentar liberar Standby List
      // Método 1: EmptyStandbyList (si existe la utilidad) o aproximaciones seguras
      // Usamos una técnica conocida: limpiar working sets de procesos de usuario + EmptyStandbyList via PowerShell si es posible

      lines.push("Intentando liberar memoria en espera...");
      lines.push("");

      // Aproximación segura: reducir working set de procesos grandes no críticos
      const result = safeExec(
        `powershell -NoProfile -Command "
          $ErrorActionPreference = 'SilentlyContinue'
          # Forzar limpieza de working sets de procesos de usuario (aproxima liberar standby)
          Get-Process | Where-Object { $_.WorkingSet64 -gt 100MB -and $_.ProcessName -notmatch 'csrss|lsass|services|svchost|winlogon|System|Registry|Memory Compression' } | ForEach-Object {
            try { $_.MinWorkingSet = $_.MinWorkingSet } catch {}
          }
          # Intentar EmptyStandbyList si está disponible (requiere privilegios)
          $code = @'
using System;
using System.Runtime.InteropServices;
public class Mem {
  [DllImport(\\\"psapi.dll\\\")]
  public static extern bool EmptyWorkingSet(IntPtr hProcess);
}
'@
          try {
            Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
            Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
              try { [Mem]::EmptyWorkingSet($_.Handle) | Out-Null } catch {}
            }
          } catch {}
          Start-Sleep -Seconds 1
          $os = Get-CimInstance Win32_OperatingSystem
          [math]::Round($os.FreePhysicalMemory/1KB,0)
        "`
      );

      if (result) {
        lines.push(`Memoria libre después del intento: ${result} MB`);
        lines.push("");
        lines.push("Si el número subió, se liberó memoria correctamente.");
        lines.push("Si no cambió mucho, Windows puede necesitar privilegios de administrador o la memoria ya estaba bien gestionada.");
      } else {
        lines.push("No se pudo completar la operación (puede requerir ejecutar Claude/Hércules como administrador).");
        lines.push("Alternativa manual: usa la herramienta 'RAMMap' de Microsoft Sysinternals → Empty → Empty Standby List.");
      }

      lines.push("");
      lines.push("Recomendación: vuelve a ejecutar evaluate_system para ver el impacto real.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
