#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { parseCli, resolveConfig } from "./cli";
import { loadConfig } from "./config";
import { Logger, LoggerLive } from "./logger";
import { capture } from "./screenshot";

const bootstrap = Effect.tryPromise({
  try: async () => {
    const { options } = parseCli(process.argv);
    const file = options.config ? await loadConfig(options.config) : {};
    return resolveConfig(file, options);
  },
  catch: (cause) => cause instanceof Error ? cause : new Error(String(cause)),
});

const run = (config: Awaited<Effect.Effect.Success<typeof bootstrap>>) => Effect.scoped(
  Effect.gen(function* () {
    const logger = yield* Logger;
    yield* logger.debug("Configuration resolved", {
      mode: config.fullPage ? "full-page" : "selector",
      stdout: config.stdout,
    });

    const png = yield* capture(config);

    if (config.stdout) {
      yield* Effect.sync(() => process.stdout.write(png));
      yield* logger.success("Screenshot captured");
    } else {
      const output = config.output!;
      yield* Effect.tryPromise({
        try: async () => {
          const parent = dirname(output);
          if (parent !== ".") await mkdir(parent, { recursive: true });
          await writeFile(output, png);
        },
        catch: (cause) => new Error(`Unable to write screenshot: ${cause instanceof Error ? cause.message : String(cause)}`),
      });
      yield* logger.success("Screenshot written", { output });
    }
  }).pipe(Effect.provide(LoggerLive({ stdoutMode: config.stdout, logFile: config.log }))),
);

const program = bootstrap.pipe(
  Effect.flatMap(run),
  Effect.catchAll((error) => Effect.sync(() => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = getExitCode(error);
  })),
);

function getExitCode(error: unknown): number {
  if (typeof error !== "object" || error === null || !("exitCode" in error)) return 1;
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" ? exitCode : 1;
}

await Effect.runPromise(program);
