import { readFile } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { CliError } from "./errors";

export interface FileConfig {
  url?: string;
  selector?: string;
  fullPage?: boolean;
  waitFor?: string;
  timeout?: number;
  headers?: Record<string, string>;
  cookie?: string;
  output?: string;
  stdout?: boolean;
  log?: string;
  executablePath?: string;
}

export interface ResolvedConfig {
  url: string;
  selector?: string;
  fullPage: boolean;
  waitFor?: string;
  timeout: number;
  headers: Record<string, string>;
  cookie?: string;
  output?: string;
  stdout: boolean;
  log?: string;
  executablePath?: string;
}

export async function loadConfig(path: string): Promise<FileConfig> {
  let source: string;

  try {
    source = path === "-" ? await readFile(0, "utf8") : await readFile(path, "utf8");
  } catch (error) {
    throw new CliError(`Unable to read config ${JSON.stringify(path)}: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = parseToml(source);
  } catch (error) {
    throw new CliError(`Invalid TOML config: ${errorMessage(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new CliError("Config root must be a TOML table.");
  }

  const config: FileConfig = {};

  assignString(parsed, config, "url");
  assignString(parsed, config, "selector");
  assignBoolean(parsed, config, "fullPage");
  assignString(parsed, config, "waitFor");
  assignNumber(parsed, config, "timeout");
  assignString(parsed, config, "cookie");
  assignString(parsed, config, "output");
  assignBoolean(parsed, config, "stdout");
  assignString(parsed, config, "log");
  assignString(parsed, config, "executablePath");

  if (parsed.headers !== undefined) {
    if (!isRecord(parsed.headers)) {
      throw new CliError('Config key "headers" must be a TOML table.');
    }

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed.headers)) {
      if (typeof value !== "string") {
        throw new CliError(`Header ${JSON.stringify(name)} must have a string value.`);
      }
      headers[name] = value;
    }
    config.headers = headers;
  }

  return config;
}

function assignString(source: Record<string, unknown>, target: FileConfig, key: keyof FileConfig): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== "string") throw new CliError(`Config key ${JSON.stringify(key)} must be a string.`);
  (target as Record<string, unknown>)[key] = value;
}

function assignBoolean(source: Record<string, unknown>, target: FileConfig, key: keyof FileConfig): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== "boolean") throw new CliError(`Config key ${JSON.stringify(key)} must be a boolean.`);
  (target as Record<string, unknown>)[key] = value;
}

function assignNumber(source: Record<string, unknown>, target: FileConfig, key: keyof FileConfig): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CliError(`Config key ${JSON.stringify(key)} must be a finite number.`);
  }
  (target as Record<string, unknown>)[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
