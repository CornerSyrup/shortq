import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import chalk from "chalk";
import winston from "winston";

export interface ShotqLogger {
  debug(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  close(): Promise<void>;
}

interface LoggerOptions {
  stdoutMode: boolean;
  logFile?: string;
}

const LEVELS = {
  error: 0,
  warn: 1,
  success: 2,
  info: 3,
  debug: 4,
};

export async function createLogger(options: LoggerOptions): Promise<ShotqLogger> {
  if (options.logFile) {
    const parent = dirname(options.logFile);
    if (parent !== ".") await mkdir(parent, { recursive: true });
  }

  const transports: winston.transport[] = [];

  if (options.logFile) {
    transports.push(new winston.transports.File({
      filename: options.logFile,
      level: "debug",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) =>
          `${timestamp} ${String(level).toUpperCase().padEnd(7)} ${message}`,
        ),
      ),
    }));
  }

  if (!(options.stdoutMode && options.logFile)) {
    transports.push(new winston.transports.Console({
      level: options.stdoutMode ? "warn" : "debug",
      stderrLevels: ["warn", "error"],
      consoleWarnLevels: [],
      format: options.stdoutMode ? plainStderrFormat() : colouredCliFormat(),
    }));
  }

  const logger = winston.createLogger({
    levels: LEVELS,
    level: "debug",
    transports,
  });

  return {
    debug: (message) => logger.debug(message),
    info: (message) => logger.info(message),
    success: (message) => logger.log("success", message),
    warn: (message) => logger.warn(message),
    error: (message) => logger.error(message),
    close: () => closeLogger(logger),
  };
}

function colouredCliFormat(): winston.Logform.Format {
  return winston.format.printf(({ level, message }) => {
    const text = String(message);
    switch (level) {
      case "error":
        return chalk.red(`✗ ${text}`);
      case "warn":
        return chalk.yellow(`⚠ ${text}`);
      case "success":
        return chalk.green(`✓ ${text}`);
      case "debug":
        return chalk.dim(`· ${text}`);
      default:
        return chalk.cyan(`→ ${text}`);
    }
  });
}

function plainStderrFormat(): winston.Logform.Format {
  return winston.format.printf(({ message }) => String(message));
}

async function closeLogger(logger: winston.Logger): Promise<void> {
  if (logger.transports.length === 0) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    logger.once("finish", finish);
    logger.end();
    setTimeout(finish, 100).unref?.();
  });
}
