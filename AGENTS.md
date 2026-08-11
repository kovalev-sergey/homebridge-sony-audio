# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

`homebridge-sony-audio` — a Homebridge **dynamic platform plugin** (TypeScript) that
discovers Sony audio devices (soundbars, AV receivers, wireless speakers) on the LAN via
SSDP and exposes them to HomeKit as a Television + TelevisionSpeaker accessory
(power, volume/mute, input source selection, remote keys).

It talks to the [Sony Audio Control API](https://developer.sony.com/develop/audio-control-api/)
over JSON-RPC-ish HTTP POST requests plus a WebSocket subscription for push notifications.

## Commands

```sh
npm run build     # tsc -> dist/
npm run lint      # eslint src/**.ts --max-warnings=0  (must pass, zero warnings)
npm test          # jest (unit tests in tests/*.spec.ts)
npm run test:coverage  # jest --coverage
npm run watch     # build + npm link + nodemon (rebuild & restart homebridge on src change)
npm start         # build + run local homebridge in debug/insecure mode
```

- Unit tests live in `tests/*.spec.ts` (jest + ts-jest, config in `jest.config.js`,
  TS options in `tsconfig.spec.json`). Shared fakes are in `tests/helpers/`:
  `logger.ts` (mock Homebridge `Logger`), `mockAxios.ts` (route-table axios instance),
  `mockWs.ts` (drivable `ws` replacement), `homebridge.ts` (fake `API` + `PlatformAccessory`
  backed by real hap-nodejs services), `hap.ts` (resolves `@homebridge/hap-nodejs` on
  Homebridge 2.x and falls back to `hap-nodejs` on 1.x — always import HAP through this
  shim in tests) and `fixtures.ts` (Audio Control API payloads).
- Network (`axios`, `ws`, `node-ssdp`) is always mocked; `fs-extra` is exercised for real
  against a `os.tmpdir()` directory.
- `tests/` also contains two manual SSDP helper scripts (`ssdp-client.ts`, `ssdp-server.ts`)
  run ad hoc with `ts-node`; they are not part of the jest run.
- CI (`.github/workflows/build.yml`) runs `npm run lint`, `npm test` then `npm run build`
  on a matrix of Node 22/24 × Homebridge 1.11.x/2.3.x.
- Always run `npm run lint && npm test && npm run build` before considering a change done.

## Layout (`src/`)

| File | Role |
|---|---|
| `index.ts` | Entry point; registers the platform with Homebridge. |
| `settings.ts` | `PLATFORM_NAME` (`SonyAudio`) and `PLUGIN_NAME` constants. |
| `platform.ts` | `SonyAudioHomebridgePlatform` — cached accessory restore, discovery wiring, accessory publish/unregister. |
| `discoverer.ts` | `Discoverer` (EventEmitter) — SSDP search for `urn:schemas-sony-com:service:ScalarWebAPI:1`, fetches & parses device description XML, emits `DiscoveryEvents.NewDeviceFound`. |
| `sonyDevice.ts` | `SonyDevice` (EventEmitter) — device model + all API calls, WebSocket notification subscriptions, emits `DEVICE_EVENTS`. |
| `sonyAudioAccessory.ts` | `SonyAudioAccessory` — maps `SonyDevice` state/events onto HAP services & characteristics. |
| `api.ts` | Pure declarations: request payload constants, response/notification types, API error classes. No I/O. |
| `sonyAudioAccessorySettings.ts` | Per-accessory persisted settings (input names / visibility) stored as JSON in Homebridge storage path via `fs-extra`. |

Data flow: `Discoverer` → `SonyDevice` → `platform.publishDevice()` → `SonyAudioAccessory`.
The `SonyDevice` instance is stored in `PlatformAccessory<SonyDevice>.context`.

## Conventions

- TypeScript, `strict: true` but `noImplicitAny: false`; target ES2018, CommonJS output to `dist/`.
- ESLint config in `.eslintrc`: single quotes, 2-space indent, trailing commas on multiline,
  `curly` always, `eqeqeq`. **`no-console` is a warning — use the Homebridge `Logger`
  (`this.log` / `this.platform.log`) instead, never `console.*`.**
- HomeKit-visible names must go through `getHomeKitName()` (`src/name.ts`); HAP-NodeJS 2.x
  logs warnings for names that do not start/end with an alphanumeric character.
- Lint runs with `--max-warnings=0`, so warnings are effectively errors.
- Files with very long import lines / API doc links start with `/* eslint-disable max-len */`.
- New Audio Control API calls: add the request constant and response interface to `api.ts`
  (with a JSDoc link to the Sony docs), then a method on `SonyDevice`.
- Keep HomeKit-facing logic in `sonyAudioAccessory.ts`; keep protocol logic in `sonyDevice.ts`.
- `HOMEBRIDGE_SONY_AUDIO_DEV` env var is appended to the UDN when generating accessory UUIDs
  so a dev instance does not collide with the production one.
- `config.schema.json` defines the Homebridge UI config (plugin alias `SonyAudio`, singular platform).
- When adding support for a device model, also update the tables in `README.md`.

## Git flow

- Single long-lived branch: `master`. Feature/fix work goes on short-lived branches merged via PR
  (CI runs on pushes to `master` and on PRs targeting `master`).
- Dependency updates arrive as `dependabot/npm_and_yarn/*` branches.
- Commit messages follow Conventional Commits with these prefixes seen in history:
  `feat:`, `fix:`, `docs:`, `chore:` (e.g. `chore: version bump`, `fix: custom uuid`).
- Version bumps are their own commit (`chore: version bump`) touching `package.json` /
  `package-lock.json`.

## Deployment flow

1. Bump `version` in `package.json` (+ lock file) and commit as `chore: version bump`.
2. Merge to `master`; `Build and Lint` workflow must be green.
3. Create a GitHub **release** with a tag `vX.Y.Z` (tags in repo: `v1.0.8` … `v1.2.0`).
4. `.github/workflows/publish.yml` triggers on release creation: it re-runs lint+build on
   Node 22/24 against both Homebridge majors, then `npm publish` to npm using the `npm_token`
   secret. Publishing is gated on repo == `kovalev-sergey/homebridge-sony-audio` and a `v*` tag.
5. `prepublishOnly` runs `lint` + `test` + `build` locally as a safety net; `.npmignore` keeps `src/`,
   tests and dev config out of the published tarball (`dist/` is what ships).

## Notes

- `dist/` is generated — never edit it, never commit it.
- Node >= 22 (`^22 || ^24 || ^26`), homebridge `^1.8.0 || ^2.0.0` per `engines`.
- Dependencies are intentionally lean: `axios`, `ws`, `node-ssdp`, `fast-xml-parser`, `fs-extra`.
