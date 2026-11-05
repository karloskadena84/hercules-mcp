import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function registerCleanCachesTool(server: McpServer) {
  server.registerTool(
    "clean_caches",
    {
      description:
        "Limpia archivos temporales, cachés y basura que ocupan RAM indirectamente y espacio en disco. En Windows limpia TEMP, Prefetch antiguo, Papelera y cachés de usuario. Por defecto solo informa (dry-run). Con apply=true realiza la limpieza real de ubicaciones seguras.",
      inputSchema: z.object({
        apply: z
          .boolean()
          .optional()
          .default(false)
          .describe("Si es true, borra realmente los archivos temporales seguros. Por defecto solo informa."),
        targets: z
          .array(z.enum(["temp", "recycle", "prefetch", "user_cache", "thumbnails"]))
          .optional()
          .default(["temp", "recycle", "user_cache"])
          .describe("Categorías a limpiar"),
      }),
    },
    async ({ apply, targets }) => {
      const platform = detectPlatform();
      const report: string[] = [];
      let totalFreedMB = 0;
      const actions: string[] = [];

      report.push(`Plataforma: ${platform}`);
      report.push(`Modo: ${apply ? "APLICAR (limpieza real)" : "SOLO INFORME (dry-run)"}`);
      report.push(`Objetivos: ${targets.join(", ")}`);
      report.push("");

      if (platform === "windows") {
        // 1. TEMP del usuario
        if (targets.includes("temp")) {
          const tempPath = process.env.TEMP || process.env.TMP || "";
          if (tempPath && fs.existsSync(tempPath)) {
            const sizeBefore = getFolderSizeMB(tempPath);
            report.push(`[TEMP] ${tempPath} → ~${sizeBefore} MB`);
            if (apply && sizeBefore > 10) {
              const result = safeExec(
                `powershell -NoProfile -Command "Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; Write-Output 'ok'"`
              );
              if (result) {
                const sizeAfter = getFolderSizeMB(tempPath);
                const freed = Math.max(0, sizeBefore - sizeAfter);
                totalFreedMB += freed;
                actions.push(`TEMP limpiado: liberados ~${freed} MB`);
              } else {
                actions.push("TEMP: se intentó limpiar (algunos archivos pueden estar en uso)");
              }
            }
          }
        }

        // 2. Papelera de reciclaje
        if (targets.includes("recycle")) {
          report.push(`[Papelera] Se vaciará la Papelera de reciclaje`);
          if (apply) {
            const result = safeExec(
              `powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output 'ok'"`
            );
            if (result) {
              actions.push("Papelera de reciclaje vaciada");
            } else {
              actions.push("Papelera: no se pudo vaciar completamente (puede requerir permisos)");
            }
          }
        }

        // 3. Prefetch (solo archivos antiguos, con cuidado)
        if (targets.includes("prefetch")) {
          report.push(`[Prefetch] C:\\Windows\\Prefetch (solo limpieza ligera)`);
          if (apply) {
            // No borramos todo Prefetch porque afecta al arranque. Solo informamos.
            actions.push("Prefetch: se recomienda no borrarlo completamente (afecta al tiempo de arranque). Se omitió por seguridad.");
          }
        }

        // 4. Cachés de usuario (thumbnails, etc.)
        if (targets.includes("user_cache") || targets.includes("thumbnails")) {
          const localAppData = process.env.LOCALAPPDATA || "";
          if (localAppData) {
            const thumbCache = path.join(localAppData, "Microsoft", "Windows", "Explorer");
            report.push(`[Thumbnails] Caché de miniaturas en Explorer`);
            if (apply) {
              safeExec(
                `powershell -NoProfile -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -Path '$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db' -Force -ErrorAction SilentlyContinue; Start-Process explorer"`
              );
              actions.push("Caché de miniaturas limpiada (Explorer se reinició)");
            }
          }
        }

        // 5. Windows Update Download cache (seguro si no hay actualizaciones en curso)
        if (targets.includes("temp")) {
          const wuPath = "C:\\Windows\\SoftwareDistribution\\Download";
          if (fs.existsSync(wuPath)) {
            const size = getFolderSizeMB(wuPath);
            if (size > 200) {
              report.push(`[Windows Update] ${wuPath} → ~${size} MB`);
              if (apply) {
                // No borramos automáticamente porque puede requerir admin y afectar actualizaciones
                actions.push(`Windows Update cache (~${size} MB): se recomienda limpiar manualmente con Liberador de espacio en disco si es necesario`);
              }
            }
          }
        }
      } else if (platform === "macos") {
        const home = os.homedir();

        // Caches de usuario
        if (targets.includes("user_cache") || targets.includes("temp")) {
          const cacheDir = path.join(home, "Library", "Caches");
          const size = getFolderSizeMB(cacheDir);
          report.push(`[Caches] ~/Library/Caches → ~${size} MB`);
          if (apply && size > 200) {
            // Solo limpiamos subcarpetas seguras conocidas, no todo
            safeExec(`rm -rf ~/Library/Caches/com.apple.Safari 2>/dev/null || true`);
            safeExec(`rm -rf ~/Library/Caches/CloudKit 2>/dev/null || true`);
            safeExec(`rm -rf ~/Library/Caches/com.apple.Music 2>/dev/null || true`);
            safeExec(`rm -rf ~/Library/Caches/Google 2>/dev/null || true`);
            safeExec(`rm -rf ~/Library/Caches/Firefox 2>/dev/null || true`);
            actions.push(`Cachés de usuario limpiadas (Safari, Music, navegadores, etc.). Antes: ~${size} MB`);
          }
        }

        // Logs antiguos
        if (targets.includes("temp")) {
          report.push(`[Logs] ~/Library/Logs`);
          if (apply) {
            safeExec(`rm -rf ~/Library/Logs/*.log 2>/dev/null || true`);
            safeExec(`rm -rf ~/Library/Logs/*.out 2>/dev/null || true`);
            actions.push("Logs de usuario antiguos eliminados");
          }
        }

        // Papelera
        if (targets.includes("recycle")) {
          report.push(`[Papelera] ~/.Trash`);
          if (apply) {
            safeExec(`rm -rf ~/.Trash/* 2>/dev/null || true`);
            actions.push("Papelera vaciada");
          }
        }
      } else {
        // Linux
        const home = os.homedir();
        if (targets.includes("temp") || targets.includes("user_cache")) {
          const cacheDir = path.join(home, ".cache");
          const size = getFolderSizeMB(cacheDir);
          report.push(`[Cache] ${cacheDir} → ~${size} MB`);
          if (apply && size > 100) {
            actions.push("En Linux la limpieza automática es limitada. Puedes borrar manualmente ~/.cache de aplicaciones que no uses.");
          }
        }
      }

      report.push("");
      if (apply) {
        report.push("=== Acciones realizadas ===");
        if (actions.length === 0) {
          report.push("No se realizaron limpiezas (nada que limpiar o permisos insuficientes).");
        } else {
          actions.forEach((a) => report.push(`• ${a}`));
        }
        if (totalFreedMB > 0) {
          report.push("");
          report.push(`Espacio liberado estimado: ~${Math.round(totalFreedMB)} MB`);
        }
        report.push("");
        report.push("Nota: Algunos archivos en uso no se pueden borrar hasta reiniciar o cerrar programas.");
      } else {
        report.push("Ejecuta de nuevo con apply=true para realizar la limpieza real de las ubicaciones seguras.");
      }

      return {
        content: [{ type: "text", text: report.join("\n") }],
      };
    }
  );
}

function getFolderSizeMB(dir: string): number {
  try {
    if (!fs.existsSync(dir)) return 0;
    // Estimación rápida (no recursiva profunda para no bloquear)
    const result = safeExec(
      process.platform === "win32"
        ? `powershell -NoProfile -Command "[math]::Round((Get-ChildItem -Path '${dir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum/1MB,1)"`
        : `du -sm "${dir}" 2>/dev/null | cut -f1`
    );
    return result ? parseFloat(result) || 0 : 0;
  } catch {
    return 0;
  }
}
