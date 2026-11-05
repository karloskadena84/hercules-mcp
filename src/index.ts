#!/usr/bin/env node
/**
 * Hércules MCP Server
 * Agente que evalúa y optimiza el rendimiento de macOS y Windows.
 * Diseñado para que el usuario solo diga "optimiza mi sistema" y Hércules lo guíe todo.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { registerEvaluateTool } from "./tools/evaluate.js";
import { registerGetScoreTool } from "./tools/get-score.js";
import { registerListBottlenecksTool } from "./tools/list-bottlenecks.js";
import { registerOptimizeStartupTool } from "./tools/optimize-startup.js";
import { registerCleanCachesTool } from "./tools/clean-caches.js";
import { registerApplyPlanTool } from "./tools/apply-plan.js";
import { registerRollbackTool } from "./tools/rollback.js";
import { registerRunBenchmarkTool } from "./tools/run-benchmark.js";
import { registerManageProcessesTool } from "./tools/manage-processes.js";
import { registerFreeStandbyMemoryTool } from "./tools/free-standby-memory.js";
import { registerPowerPlanTool } from "./tools/power-plan.js";
import { registerFindLargeFilesTool } from "./tools/find-large-files.js";
import { getPlatformInfo } from "./utils/platform.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "hercules",
    version: "0.1.0",
  });

  // ========== TOOLS ==========
  registerEvaluateTool(server);
  registerGetScoreTool(server);
  registerListBottlenecksTool(server);
  registerOptimizeStartupTool(server);
  registerCleanCachesTool(server);
  registerApplyPlanTool(server);
  registerRollbackTool(server);
  registerRunBenchmarkTool(server);
  registerManageProcessesTool(server);

  // ========== RESOURCE ==========
  server.registerResource(
    "platform-info",
    "system://platform",
    {
      description: "Información del sistema operativo y hardware actual",
      mimeType: "application/json",
    },
    async () => {
      const info = getPlatformInfo();
      return {
        contents: [
          {
            uri: "system://platform",
            mimeType: "application/json",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  // ========== PROMPTS (la magia de la UX) ==========
  // Estos prompts hacen que el modelo lleve al usuario de la mano

  server.registerPrompt(
    "optimizar_sistema",
    {
      title: "Optimizar mi sistema",
      description:
        "Inicia el asistente completo de Hércules. Evalúa el sistema, explica los problemas en lenguaje sencillo y guía al usuario paso a paso para mejorar el rendimiento. Ideal para usuarios no técnicos.",
      argsSchema: z.object({}),
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Eres Hércules, un optimizador real de sistemas Windows y macOS. Tu objetivo es mejorar el RENDIMIENTO REAL del equipo liberando RAM y espacio en disco.

Flujo obligatorio:

1. Saluda breve y profesional.
2. Llama INMEDIATAMENTE a evaluate_system (con detailed=true). Esta tool ahora entrega:
   - Top de procesos que más RAM consumen
   - Espacio libre real en cada disco
   - Tamaño de la carpeta TEMP
   - Lista de programas de inicio
   - Puntuación 0-100
3. Explica los resultados en lenguaje sencillo y concreto. Ejemplo:
   "Tu PC tiene un 82% de RAM ocupada. Los que más comen memoria son X, Y y Z. El disco C solo tiene 12% libre."
4. Prioriza estos frentes (en este orden de impacto):
   A) Liberar RAM (procesos pesados + memoria en espera + programas de inicio)
   B) Liberar espacio en disco (TEMP, Papelera, cachés + archivos grandes)
   C) Plan de energía en Alto rendimiento si el usuario quiere máximo rendimiento
5. Pregunta: "¿Empezamos liberando espacio y memoria? Te iré pidiendo confirmación antes de borrar o desactivar nada."
6. Cuando el usuario acepte, sigue este orden:
   a) Ejecuta clean_caches en dry-run y muestra cuánto espacio se puede liberar.
   b) Pide confirmación y luego ejecuta clean_caches con apply=true.
   c) Ejecuta manage_heavy_processes con action="list" y ofrece cerrar los más pesados (con confirmación).
   d) En Windows, ofrece free_standby_memory para liberar memoria en espera.
   e) Ejecuta find_large_files para mostrar qué archivos/carpetas ocupan más espacio.
   f) Revisa optimize_startup y guía para desactivar programas de inicio innecesarios.
   g) Ofrece set_power_plan con plan="high" si el usuario quiere máximo rendimiento.
   h) Vuelve a llamar evaluate_system para demostrar la mejora real (puntuación, RAM libre y espacio).
7. Al terminar da un resumen claro con números: "Liberamos X MB, cerramos Y procesos pesados, desactivamos Z programas de inicio. Tu puntuación pasó de A a B."

Reglas estrictas:
- Nunca borres ni desactives nada sin confirmación explícita del usuario.
- Sé concreto con números (MB, GB, % de RAM).
- Enfócate en resultados medibles de rendimiento.
- Habla siempre en español claro.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "revision_rapida",
    {
      title: "Revisión rápida de rendimiento",
      description:
        "Hace una evaluación rápida del sistema y da un diagnóstico corto y claro. Ideal cuando el usuario solo quiere saber cómo está su PC.",
      argsSchema: z.object({}),
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Eres Hércules. El usuario quiere una revisión rápida.

1. Llama a "get_performance_score" y a "list_bottlenecks".
2. Responde en 4-6 líneas máximo, en español sencillo.
3. Di la puntuación, el estado general (Excelente / Bueno / Regular / Malo) y el problema principal si existe.
4. Termina preguntando: "¿Quieres que te ayude a mejorarlo?"`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "antes_de_trabajo_pesado",
    {
      title: "Preparar el PC para trabajo pesado",
      description:
        "Prepara el sistema para tareas exigentes (edición de video, juegos, compilación, etc.). Limpia lo innecesario y optimiza de forma segura.",
      argsSchema: z.object({
        tipo: z
          .string()
          .optional()
          .describe("Tipo de trabajo: juegos, video, programacion, etc."),
      }),
    },
    ({ tipo }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Eres Hércules. El usuario va a hacer trabajo pesado${tipo ? ` (${tipo})` : ""}.

1. Evalúa el sistema actual.
2. Limpia cachés de forma segura (primero en modo simulación).
3. Revisa elementos de inicio que puedan estorbar.
4. Explica todo en lenguaje sencillo.
5. Pide confirmación antes de aplicar cambios.
6. Al final dile: "Tu equipo está listo. ¡A por ello!"`,
          },
        },
      ],
    })
  );

  return server;
}

void serveStdio(createServer);
console.error("Hércules MCP server en ejecución (stdio)");
console.error(`Plataforma detectada: ${process.platform} (${process.arch})`);
