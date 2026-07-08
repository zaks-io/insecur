# Fuzz Testing

Fuzz tests are opt-in and do not run inside `pnpm verify`.

Run the current deterministic fuzz suite:

```sh
pnpm test:fuzz
```

Increase the generated case count:

```sh
INSECUR_FUZZ_RUNS=5000 pnpm test:fuzz
```

Replay a failing run with the seed printed by `fast-check`:

```sh
INSECUR_FUZZ_SEED=<seed> pnpm test:fuzz
```

Run one focused target for a time budget:

```sh
INSECUR_FUZZ_RUNS=infinity INSECUR_FUZZ_DURATION_MS=240000 pnpm exec vitest run --config vitest.fuzz.config.ts -t "target name"
```

Run the hosted workflow manually from GitHub Actions:

1. Open **Actions**.
2. Select **Fuzz**.
3. Choose **Run workflow**.
4. Set `runs` to the generated case count per property.
5. Set `seed` only when replaying a failure.
6. Set `duration_ms` only for a focused campaign; it is a per-property cap, not a whole-suite cap.

The hosted workflow also runs daily at 06:17 UTC with `runs=5000` and a random seed. It is not a
required PR gate.

The first fuzz layer targets pure codecs and validators. Keep DB, HTTP, and preview fuzzing in
separate commands so the normal verification floor stays lean.

## Writing High-Value Properties

Prefer properties with a real oracle, not just "does not throw". Good targets here are:

- Round trips: encode/decode, serialize/parse, normalize/parse.
- Cross-oracles: compare a local implementation to a platform primitive, such as fatal UTF-8 decode.
- Metamorphic checks: same logical input in a different order produces the same result.
- Fail-closed checks: malformed security input returns a stable denial and never broadens access.

Use structured generators for valid shapes instead of broad strings plus heavy filtering. For
example, generate an opaque ID from its prefix and 26-character body, or generate a variable key
from the allowed first character and tail alphabet. Use arbitrary JSON for untrusted payloads, but
add a second property that builds known-valid payloads directly.

Every property should keep a small `examples` list. Treat it as the seed corpus and regression list:
include empty values, boundary lengths, known-invalid security tokens, and any counterexample that
ever fails in CI. Keep examples small so shrinking stays useful.

Keep each fuzz target fast, deterministic, and stateless. Avoid network, disk writes, database
access, sleeps, logging, and global mutation. Split large workflows into smaller pure targets before
adding integration or preview fuzzing.
