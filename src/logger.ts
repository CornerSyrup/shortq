import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import { Context, Effect, Layer } from "effect";

export type LogLevel = "debug" | "info" | "success" | "warn" | "error";
export type LogFields = Readonly<Record<string, unknown>>;

export interface ShotqLogger {
  readonly log: (level: LogLevel, message: string, fields?: LogFields) => Effect.Effect<void>;
  readonly debug: (message: string, fields?: LogFields) => Effect.Effect<void>;
  readonly info: (message: string, fields?: LogFields) => Effect.Effect<void>;
  readonly success: (message: string, fields?: LogFields) => Effect.Effect<void>;
  readonly warn: (message: string, fields?: LogFields) => Effect.Effect<void>;
  readonly error: (message: string, fields?: LogFields) => Effect.Effect<void>;
}

export class Logger extends Context.Tag("shotq/Logger")<Logger, ShotqLogger>() {}

export interface LoggerOptions {
  readonly stdoutMode: boolean;
  readonly logFile?: string;
}

export const LoggerLive = (options: LoggerOptions) => Layer.effect(
  Logger,
  Effect.gen(function* () {
    if (options.logFile) {
      yield* Effect.tryPromise({
        try: async () => {
          const parent = dirname(options.logFile!);
          if (parent !== ".") await mkdir(parent, { recursive: true });
        },
        catch: (cause) => cause,
      }).pipe(Effect.orDie);
    }

    const writeFile = (level: LogLevel, message: string, fields?: LogFields) =>
      options.logFile
        ? Effect.tryPromise({
            try: () => appendFile(options.logFile!, formatFile(level, message, fields), "utf8"),
            catch: (cause) => cause,
          }).pipe(Effect.orDie)
        : Effect.void;

    const writeTerminal = (level: LogLevel, message: string, fields?: LogFields) => Effect.sync(() => {
      if (options.stdoutMode && options.logFile) return;
      if (options.stdoutMode) {
        if (level === "warn" || level === "error") process.stderr.write(`${message}${formatFields(fields)}\n`);
        return;
      }
      const line = `${message}${formatFields(fields)}`;
      if (level === "warn" || level === "error") process.stderr.write(`${colour(level, line)}\n`);
      else process.stdout.write(`${colour(level, line)}\n`);
    });

    const log = (level: LogLevel, message: string, fields?: LogFields) =>
      Effect.all([writeFile(level, message, fields), writeTerminal(level, message, fields)], { concurrency: 2 }).pipe(Effect.asVoid);

    return {
      log,
      debug: (message, fields) => log("debug", message, fields),
      info: (message, fields) => log("info", message, fields),
      success: (message, fields) => log("success", message, fields),
      warn: (message, fields) => log("warn", message, fields),
      error: (message, fields) => log("error", message, fields),
    } satisfies ShotqLogger;
  }),
);

function formatFile(level: LogLevel, message: string, fields?: LogFields): string {
  return `${new Date().toISOString()} ${level.toUpperCase().padEnd(7)} ${message}${formatFields(fields)}\n`;
}

function formatFields(fields?: LogFields): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  return ` ${JSON.stringify(fields)}`;
}

function colour(level: LogLevel, text: string): string {
  switch (level) {
    case "error": return chalk.red(`✗ ${text}`);
    case "warn": return chalk.yellow(`⚠ ${text}`);
    case "success": return chalk.green(`✓ ${text}`);
    case "debug": return chalk.dim(`· ${text}`);
    case "info": return chalk.cyan(`→ ${text}`);
  }
}
