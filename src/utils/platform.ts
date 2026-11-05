import os from "node:os";
import { execSync } from "node:child_process";

export type Platform = "macos" | "windows" | "linux" | "unknown";

export interface PlatformInfo {
  platform: Platform;
  os: string;
  arch: string;
  release: string;
  hostname: string;
  cpus: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  uptimeHours: number;
  nodeVersion: string;
}

export function detectPlatform(): Platform {
  switch (process.platform) {
    case "darwin": return "macos";
    case "win32": return "windows";
    case "linux": return "linux";
    default: return "unknown";
  }
}

export function getPlatformInfo(): PlatformInfo {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    platform: detectPlatform(),
    os: os.type(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemoryGB: Math.round((totalMem / 1024 / 1024 / 1024) * 10) / 10,
    freeMemoryGB: Math.round((freeMem / 1024 / 1024 / 1024) * 10) / 10,
    uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
    nodeVersion: process.version,
  };
}

export function safeExec(command: string, timeoutMs = 10000): string | null {
  try {
    return execSync(command, {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}
