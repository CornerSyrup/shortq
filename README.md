# shotq

A small Bun + TypeScript CLI that captures PNG screenshots with Puppeteer. The application core is written with [Effect](https://effect.website/) for typed effects, dependency injection, and scoped Chromium lifecycle management.

> The GitHub repository is temporarily named `shortq`; the CLI and package are `shotq`.

## Podman

```sh
podman build -t shotq -f Containerfile .
```

Capture an element without a bind mount:

```sh
podman run --rm shotq \
  --url https://example.com \
  --selector 'h1' \
  --stdout > screenshot.png
```

Read TOML config from stdin and emit PNG to stdout:

```sh
podman run --rm -i shotq --config - --stdout \
  < example.conf > screenshot.png
```

Write to a mounted directory:

```sh
podman run --rm -v "$PWD:/output:Z" shotq \
  --url https://example.com \
  --full-page \
  --output /output/screenshot.png
```

## Config

```toml
url = "https://example.com"
selector = "h1"
waitFor = "body"
timeout = 30000
output = "screenshot.png"
cookie = "session=abc; theme=dark"

[headers]
Accept-Language = "en-GB"
```

`selector` and `fullPage` are mutually exclusive. `output` and `stdout` are mutually exclusive. CLI options override config values.

## Logging

Normal CLI output is coloured. In `--stdout` mode, stdout contains PNG bytes only and stderr receives only plain warnings/errors. With `--log <file>`, all diagnostic levels are written to the log file; `--stdout --log <file>` keeps the terminal diagnostic stream silent.

## Development

```sh
bun install
bun run check
bun run src/index.ts --help
```

CI uses the official `oven-sh/setup-bun` action and also builds the OCI `Containerfile` with Podman.

## Credits

Designed and implemented collaboratively with **GPT-5.6 Sol by OpenAI**, acting as the initial AI maintainer for the project.

## Licence

MIT.
