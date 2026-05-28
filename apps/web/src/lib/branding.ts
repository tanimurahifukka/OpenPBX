// User-facing brand label for the upstream Command Room rename.
//
// User-visible OpenPBX UI strings (page headers, setup wizard, flash
// banners, connection forms) say `CHIPS` instead of the legacy
// `Command Room` / `command-room` prose. Internal protocol
// identifiers — `X-Command-Room-Device-Token`,
// `command-room-pbx/event/v1`, `EVENT_PUSH_URL`, the
// `target: 'command-room'` discriminator in `testConnection()`, env
// vars, file paths — are NOT renamed. Those stay as `command-room`
// for cross-repo contract compatibility.
//
// See `command-room/docs/BRANDING.md`.

export const UPSTREAM_BRAND = {
  shortName: "CHIPS",
  legacyName: "command-room",
  integrationLabel: "CHIPS連携",
  transitionLabel: "CHIPS連携（旧 command-room）",
} as const;
