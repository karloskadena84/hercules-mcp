import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { detectPlatform, safeExec } from "../utils/platform.js";

export function registerFindLargeFilesTool(server: McpServer) {
  server.registerTool(
    "find_large_files",
    {
      description:
        "Detecta los archivos y carpetas que más espacio ocupan en el disco. Útil para saber qué borrar o mover. Por defecto busca en el disco principal y muestra los más grandes. Solo lectura (no borra nada).",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe("Ruta donde buscar. Por defecto el disco principal del usuario (C:\\ o /)"),
        minSizeMB: z
          .number()
          .optional()
          .default(100)
          .describe("Tamaño mínimo en MB para mostrar un archivo (por defecto 100)"),
        limit: z
          .number()
          .int()
          .min(5)
          .max(30)
          .optional()
          .default(15)
          .describe("Cuántos resultados mostrar"),
      }),
    },
    async ({ path: searchPath, minSizeMB, limit }) => {
      const platform = detectPlatform();
      const lines: string[] = [];

      lines.push("=== Archivos y carpetas que más espacio ocupan ===");
      lines.push(`Tamaño mínimo: ${minSizeMB} MB | Límite: ${limit} resultados`);
      lines.push("");

      if (platform === "windows") {
        const root = searchPath || "C:\\";
        lines.push(`Buscando en: ${root}`);
        lines.push("(Puede tardar 15-60 segundos según el tamaño del disco...)");
        lines.push("");

        // Buscar archivos grandes
        const files = safeExec(
          `powershell -NoProfile -Command "
            $ErrorActionPreference = 'SilentlyContinue'
            $min = ${minSizeMB} * 1MB
            Get-ChildItem -Path '${root.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue |
              Where-Object { $_.Length -ge $min } |
              Sort-Object Length -Descending |
              Select-Object -First ${limit} FullName,@{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}} |
              ConvertTo-Json -Compress
          "`,
          90000
        );

        if (files) {
          try {
            const list = JSON.parse(files);
            const arr = Array.isArray(list) ? list : [list];
            if (arr.length === 0) {
              lines.push(`No se encontraron archivos mayores de ${minSizeMB} MB en esa ruta.`);
            } else {
              lines.push("Archivos más grandes:");
              lines.push("");
              arr.forEach((f: any, i: number) => {
                lines.push(`${i + 1}. ${f.SizeMB} MB`);
                lines.push(`   ${f.FullName}`);
                lines.push("");
              });
            }
          } catch {
            lines.push("Resultado (texto):");
            lines.push(files.slice(0, 3000));
          }
        } else {
          lines.push("La búsqueda tardó demasiado o no devolvió resultados.");
          lines.push("Prueba con una carpeta más concreta, por ejemplo: path=\"C:\\\\Users\\\\TuUsuario\\\\Downloads\"");
        }

        // Carpetas grandes del usuario (más rápido)
        lines.push("────────────────────────────────────");
        lines.push("Carpetas de usuario que suelen ocupar mucho:");
        const userProfile = process.env.USERPROFILE || "C:\\Users\\Default";
        const heavyFolders = [
          "Downloads",
          "Documents",
          "Desktop",
          "Videos",
          "AppData\\Local",
          "AppData\\Local\\Temp",
        ];
        for (const folder of heavyFolders) {
          const full = `${userProfile}\\${folder}`;
          const size = safeExec(
            `powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $s=(Get-ChildItem -Path '${full.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; if($s){[math]::Round($s/1MB,0)}else{0}"`,
            30000
          );
          if (size && parseFloat(size) > 50) {
            lines.push(`• ${folder}: ~${size} MB`);
          }
        }
      } else {
        // macOS / Linux
        const root = searchPath || (platform === "macos" ? (process.env.HOME || "/") : "/");
        lines.push(`Buscando en: ${root}`);
        lines.push("");

        const result = safeExec(
          `find "${root}" -type f -size +${minSizeMB}M 2>/dev/null | head -${limit * 3} | xargs -I{} du -m "{}" 2>/dev/null | sort -nr | head -${limit}`,
          60000
        );
        if (result) {
          lines.push("Archivos grandes (tamaño en MB):");
          lines.push(result);
        } else {
          lines.push("No se obtuvieron resultados (permisos o ruta muy grande).");
          lines.push("Prueba con path=\"$HOME/Downloads\" o path=\"$HOME/Documents\"");
        }

        if (platform === "macos") {
          lines.push("");
          lines.push("También puedes usar: Ajustes del Sistema → General → Almacenamiento");
        }
      }

      lines.push("");
      lines.push("Esta herramienta solo lista. No borra nada.");
      lines.push("Si quieres borrar algo, dímelo y te guío de forma segura.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
