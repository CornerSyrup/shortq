import puppeteer, { type CookieData, type LaunchOptions } from "puppeteer-core";
import { Effect } from "effect";
import type { ResolvedConfig } from "./config";
import { Logger } from "./logger";

export const capture = (config: ResolvedConfig) => Effect.gen(function* () {
  const logger = yield* Logger;
  yield* logger.info("Launching Chromium");

  const launchOptions: LaunchOptions = {
    headless: true,
    args: process.env.SHOTQ_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    ...(config.executablePath ? { executablePath: config.executablePath } : {}),
  };

  const browser = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => puppeteer.launch(launchOptions),
      catch: (cause) => new Error(`Unable to launch Chromium: ${message(cause)}`),
    }),
    (browser) => Effect.promise(() => browser.close()).pipe(Effect.ignore),
  );

  const page = yield* Effect.tryPromise({
    try: () => browser.newPage(),
    catch: (cause) => new Error(`Unable to create page: ${message(cause)}`),
  });

  page.setDefaultTimeout(config.timeout);
  page.setDefaultNavigationTimeout(config.timeout);

  if (Object.keys(config.headers).length > 0) {
    yield* Effect.tryPromise({
      try: () => page.setExtraHTTPHeaders(config.headers),
      catch: (cause) => new Error(`Unable to set headers: ${message(cause)}`),
    });
  }

  if (config.cookie) {
    const cookies = parseCookieHeader(config.cookie, config.url);
    yield* Effect.tryPromise({
      try: () => browser.setCookie(...cookies),
      catch: (cause) => new Error(`Unable to set cookies: ${message(cause)}`),
    });
  }

  yield* logger.info("Opening page", { url: config.url });
  yield* Effect.tryPromise({
    try: () => page.goto(config.url, { waitUntil: "networkidle2", timeout: config.timeout }),
    catch: (cause) => new Error(`Navigation failed: ${message(cause)}`),
  });

  if (config.waitFor) {
    yield* logger.info("Waiting for selector", { selector: config.waitFor });
    yield* wait(page, config.waitFor, config.timeout);
  }

  if (config.fullPage) {
    yield* logger.info("Capturing full page");
    return yield* Effect.tryPromise({
      try: () => page.screenshot({ type: "png", fullPage: true }),
      catch: (cause) => new Error(`Screenshot failed: ${message(cause)}`),
    });
  }

  const selector = config.selector!;
  if (!config.waitFor || config.waitFor !== selector) yield* wait(page, selector, config.timeout);
  yield* logger.info("Capturing element", { selector });
  const element = yield* Effect.tryPromise({
    try: () => page.$(selector),
    catch: (cause) => new Error(`Selector lookup failed: ${message(cause)}`),
  });
  if (!element) return yield* Effect.fail(new Error(`Selector not found: ${selector}`));

  return yield* Effect.tryPromise({
    try: () => element.screenshot({ type: "png" }),
    catch: (cause) => new Error(`Screenshot failed: ${message(cause)}`),
  });
});

function wait(page: import("puppeteer-core").Page, selector: string, timeout: number) {
  return Effect.tryPromise({
    try: () => page.waitForSelector(selector, { timeout }),
    catch: (cause) => new Error(`Timed out waiting for selector ${JSON.stringify(selector)}: ${message(cause)}`),
  });
}

function parseCookieHeader(header: string, targetUrl: string): CookieData[] {
  const domain = new URL(targetUrl).hostname;
  return header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const equals = part.indexOf("=");
    if (equals <= 0) throw new Error(`Invalid cookie pair: ${JSON.stringify(part)}`);
    return {
      name: part.slice(0, equals).trim(),
      value: part.slice(equals + 1).trim(),
      domain,
      path: "/",
    };
  });
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
