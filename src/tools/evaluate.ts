import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import os from "node:os";
import { getPlatformInfo, detectPlatform, safeExec } from "../utils/platform.js";

export function registerEvaluateTool(server: McpServer) {
  server.registerTool(
    "evaluate_system",
    {
      description:
        "Análisis profundo del sistema: memoria RAM (procesos que más consumen), espacio en disco, elementos de inicio, carga de CPU y puntuación de salud 0-100. Devuelve datos reales y recomendaciones prioritarias. Solo lectura.",
      inputSchema: z.object({
        detailed: z
          .boolean()
          .optional()
          .default(true)
          .describe("Incluir top de procesos por memoria y detalles de disco"),
      }),
    },
    async ({ detailed }) => {
      const info = getPlatformInfo();
      const platform = detectPlatform();
      const memUsedPct = Math.round(
        ((info.totalMemoryGB - info.freeMemoryGB) / info.totalMemoryGB) * 100
      );

      let score = 100;
      const issues: string[] = [];
      const recommendations: string[] = [];
      const details: Record<string, unknown> = {};

      // === MEMORIA ===
      if (memUsedPct > 90) {
        score -= 30;
        issues.push(`Memoria crítica: ${memUsedPct}% en uso (${info.freeMemoryGB} GB libres)`);
        recommendations.push("Cerrar procesos pesados y limpiar memoria en espera");
      } else if (memUsedPct > 75) {
        score -= 15;
        issues.push(`Memoria elevada: ${memUsedPct}% en uso`);
        recommendations.push("Revisar programas que consumen mucha RAM en segundo plano");
      } else if (memUsedPct > 60) {
        score -= 5;
      }

      // Top procesos por memoria (Windows)
      if (platform === "windows") {
        const topMem = safeExec(
          `powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 8 Name,@{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress"`
        );
        if (topMem) {
          try {
            details.topMemoryProcesses = JSON.parse(topMem);
          } catch {
            details.topMemoryProcessesRaw = topMem;
          }
        }

        const memInfo = safeExec(
          `powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize | ConvertTo-Json -Compress"`
        );
        if (memInfo) {
          try {
            details.windowsMemory = JSON.parse(memInfo);
          } catch { /* ignore */ }
        }
      } else if (platform === "linux" || platform === "macos") {
        const topMem = safeExec(
          platform === "macos"
            ? `ps -eo pid,rss,comm -r | head -9`
            : `ps -eo pid,rss,comm --sort=-rss | head -9`
        );
        if (topMem) details.topMemoryProcessesRaw = topMem;

        // Disco en macOS/Linux
        const disk = safeExec(`df -h / 2>/dev/null | tail -1`);
        if (disk) {
          details.diskRoot = disk;
          // Intentar extraer % usado
          const parts = disk.split().filter(Boolean);
          if (parts.length >= 5) {
            const usedPct = parseInt(parts[4]);
            if (!isNaN(usedPct) && usedPct > 85) {
              score -= 15;
              issues.push(`Disco raíz al ${usedPct}% de uso`);
              recommendations.push("Liberar espacio en disco (cachés, Papelera, archivos grandes)");
            } else if (!isNaN(usedPct) && usedPct > 75) {
              score -= 7;
              issues.push(`Disco raíz al ${usedPct}% de uso`);
            }
          }
        }

        if (platform === "macos") {
          // Memory pressure aproximado
          const pressure = safeExec(`memory_pressure 2>/dev/null | head -5`);
          if (pressure) details.memoryPressure = pressure;
        }
      }

      // === DISCO ===
      if (platform === "windows") {
        const disk = safeExec(
          `powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null} | Select-Object Name,@{N='UsedGB';E={[math]::Round($_.Used/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}},@{N='FreePct';E={[math]::Round(($_.Free/($_.Used+$_.Free))*100,1)}} | ConvertTo-Json -Compress"`
        );
        if (disk) {
          try {
            const disks = JSON.parse(disk);
            details.disks = disks;
            const list = Array.isArray(disks) ? disks : [disks];
            for (const d of list) {
              if (d.FreePct !== undefined && d.FreePct < 15) {
                score -= 20;
                issues.push(`Disco ${d.Name}: solo ${d.FreePct}% libre (${d.FreeGB} GB)`);
                recommendations.push(`Liberar espacio en el disco ${d.Name}: limpiar temporales, papelera y archivos grandes`);
              } else if (d.FreePct !== undefined && d.FreePct < 25) {
                score -= 8;
                issues.push(`Disco ${d.Name}: espacio bajo (${d.FreePct}% libre)`);
                recommendations.push(`Revisar archivos grandes y cachés en disco ${d.Name}`);
              }
            }
          } catch {
            details.disksRaw = disk;
          }
        }

        const tempSize = safeExec(
          `powershell -NoProfile -Command "$t=$env:TEMP; if(Test-Path $t){ [math]::Round((Get-ChildItem $t -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum/1MB,1) } else {0}"`
        );
        if (tempSize && parseFloat(tempSize) > 500) {
          score -= 8;
          issues.push(`Carpeta TEMP grande: ~${tempSize} MB`);
          recommendations.push("Limpiar archivos temporales de Windows");
          details.tempFolderMB = parseFloat(tempSize);
        }
      }

      // === CPU ===
      if (platform !== "windows") {
        const load1 = os.loadavg()[0];
        if (load1 > info.cpus * 1.5) {
          score -= 15;
          issues.push(`Carga de CPU alta: ${load1.toFixed(2)}`);
        }
      } else {
        const topCpu = safeExec(
          `powershell -NoProfile -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name,@{N='CPU',E={[math]::Round($_.CPU,1)}} | ConvertTo-Json -Compress"`
        );
        if (topCpu) {
          try {
            details.topCpuProcesses = JSON.parse(topCpu);
          } catch {
            details.topCpuProcessesRaw = topCpu;
          }
        }
      }

      // === STARTUP ===
      if (platform === "windows") {
        const startup = safeExec(
          `powershell -NoProfile -Command "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | ConvertTo-Json -Compress"`
        );
        if (startup) {
          try {
            const items = JSON.parse(startup);
            const list = Array.isArray(items) ? items : [items];
            details.startupItemsCount = list.length;
            details.startupItems = list.slice(0, 12);
            if (list.length > 10) {
              score -= 10;
              issues.push(`Muchos programas de inicio: ${list.length}`);
              recommendations.push("Desactivar programas innecesarios que se inician con Windows");
            }
          } catch {
            details.startupRaw = startup;
          }
        }
      }

      if (info.uptimeHours > 24 * 7) {
        score -= 5;
        issues.push(`Mucho tiempo sin reiniciar: ${Math.round(info.uptimeHours)} horas`);
        recommendations.push("Reiniciar el equipo ayuda a liberar memoria y procesos residuales");
      }

      score = Math.max(0, Math.min(100, Math.round(score)));

      const report = {
        timestamp: new Date().toISOString(),
        platform: info,
        score,
        scoreLabel:
          score >= 85 ? "Excelente" : score >= 70 ? "Bueno" : score >= 50 ? "Regular" : "Necesita atención",
        memory: {
          totalGB: info.totalMemoryGB,
          freeGB: info.freeMemoryGB,
          usedPercent: memUsedPct,
        },
        issues,
        recommendations,
        details: detailed ? details : undefined,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    }
  );
}
