import { Command, Option } from "commander";
import { CliError } from "./errors";
import type { FileConfig, ResolvedConfig } from "./config";

export interface CliOptions {
  config?: string;
  url?: string;
  selector?: string;
  fullPage?: boolean;
  waitFor?: string;
  timeout?: number;
  header?: string[];
  cookie?: string;
  output?: string;
  stdout?: boolean;
  log?: string;
  executablePath?: string;
}

export function parseCli(argv: string[]): { command: Command; options: CliOptions } {
  const command = new Command()
    .name("shotq")
    .description("Capture a PNG screenshot of a page or selected element with Puppeteer.")
    .version("0.2.0")
    .showHelpAfterError()
    .exitOverride()
    .option("--config <file>", "TOML config file; use - to read config from stdin")
    .option("--url <url>", "URL to open")
    .option("--selector <css>", "CSS selector of the element to capture")
    .option("--full-page", "capture the full page")
    .option("--wait-for <css>", "CSS selector to wait for before capturing")
    .addOption(
      new Option("--timeout <ms>", "navigation and selector timeout in milliseconds")
        .argParser(parsePositiveInteger),
    )
    .option("--header <header>", "HTTP request header as 'Name: value'; repeatable", collect, [])
    .option("--cookie <cookie>", "entire Cookie header string, e.g. 'a=1; b=2'")
    .option("--output <file>", "write PNG to this file")
    .option("--stdout", "write raw PNG bytes to stdout")
    .option("--log <file>", "write all diagnostic logs to this file")
    .option("--executable-path <file>", "Chromium/Chrome executable path");

  try {
    command.parse(argv);
  } catch (error) {
    if (isCommanderHelpOrVersion(error)) process.exit(0);
    if (error instanceof Error) throw new CliError(error.message);
    throw error;
  }

  return { command, options: command.opts<CliOptions>() };
}

export function resolveConfig(file: FileConfig, cli: CliOptions): ResolvedConfig {
  const headers = {
    ...(file.headers ?? {}),
    ...parseHeaders(cli.header ?? []),
  };

  const selectorWasSet = cli.selector !== undefined;
  const fullPageWasSet = cli.fullPage === true;

  const selector = selectorWasSet ? cli.selector : fullPageWasSet ? undefined : file.selector;
  const fullPage = fullPageWasSet ? true : selectorWasSet ? false : (file.fullPage ?? false);

  const outputWasSet = cli.output !== undefined;
  const stdoutWasSet = cli.stdout === true;
  const output = outputWasSet ? cli.output : stdoutWasSet ? undefined : file.output;
  const stdout = stdoutWasSet ? true : outputWasSet ? false : (file.stdout ?? false);

  const config: ResolvedConfig = {
    url: cli.url ?? file.url ?? "",
    fullPage,
    timeout: cli.timeout ?? file.timeout ?? 30_000,
    headers,
    stdout,
  };

  if (selector !== undefined) config.selector = selector;
  const waitFor = cli.waitFor ?? file.waitFor;
  if (waitFor !== undefined) config.waitFor = waitFor;
  const cookie = cli.cookie ?? file.cookie;
  if (cookie !== undefined) config.cookie = cookie;
  if (output !== undefined) config.output = output;
  const log = cli.log ?? file.log;
  if (log !== undefined) config.log = log;
  const executablePath = cli.executablePath ?? file.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executablePath !== undefined) config.executablePath = executablePath;

  validate(config);
  return config;
}

function validate(config: ResolvedConfig): void {
  if (!config.url) throw new CliError("Missing URL. Provide --url or set url in the config file.");

  try {
    const url = new URL(config.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new CliError(`Invalid HTTP(S) URL: ${JSON.stringify(config.url)}`);
  }

  if (Boolean(config.selector) === config.fullPage) {
    throw new CliError("Choose exactly one screenshot mode: --selector <css> or --full-page.");
  }

  if (Boolean(config.output) === config.stdout) {
    throw new CliError("Choose exactly one output mode: --output <file> or --stdout.");
  }

  if (!Number.isInteger(config.timeout) || config.timeout <= 0) {
    throw new CliError("Timeout must be a positive integer in milliseconds.");
  }

  if (config.log !== undefined && config.log.trim() === "") {
    throw new CliError("Log file path must not be empty.");
  }
}

function parseHeaders(values: string[]): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const input of values) {
    const colon = input.indexOf(":");
    if (colon <= 0) throw new CliError(`Invalid header ${JSON.stringify(input)}; expected 'Name: value'.`);

    const name = input.slice(0, colon).trim();
    const value = input.slice(colon + 1).trim();
    if (!name) throw new CliError(`Invalid header ${JSON.stringify(input)}; header name is empty.`);
    headers[name] = value;
  }

  return headers;
}

function parsePositiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new CliError(`Invalid positive integer: ${value}`);
  return number;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function isCommanderHelpOrVersion(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    (error.code === "commander.helpDisplayed" || error.code === "commander.version");
}
