import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installers = [
  ["install-gitleaks.sh", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"],
  ["install-actionlint.sh", "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"],
];

const attestationActionPromise = readFile(
  new URL("../../.github/actions/setup-security-attestation-tools/action.yml", import.meta.url),
  "utf8",
);
const attestationRequirementsInputPromise = readFile(
  new URL(
    "../../.github/actions/setup-security-attestation-tools/requirements.in",
    import.meta.url,
  ),
  "utf8",
);
const attestationRequirementsPromise = readFile(
  new URL(
    "../../.github/actions/setup-security-attestation-tools/requirements.txt",
    import.meta.url,
  ),
  "utf8",
);

function assertScannerPinsMatchLock(requirementsInput, lockedPins) {
  const inputPins = requirementsInput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const scanners = ["checkov", "semgrep"];
  assert.equal(inputPins.length, scanners.length);
  for (const [index, scanner] of scanners.entries()) {
    const pin = inputPins[index];
    assert.match(pin, new RegExp(`^${scanner}==\\d+\\.\\d+\\.\\d+$`, "u"));
    assert.ok(lockedPins.includes(pin), `scanner input pin missing from lock: ${pin}`);
  }
}

for (const [file, checksum] of installers) {
  test(`${file} verifies its pinned release checksum before extraction`, async () => {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, new RegExp(checksum));
    assert.match(source, /sha256sum --check --strict/u);
    assert.ok(source.indexOf("sha256sum --check") < source.indexOf("tar -x"));
  });
}

test("security attestation binary scanners use repository-owned archive hashes", async () => {
  const source = await attestationActionPromise;
  const checksums = [
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    "c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f",
    "54a87372498168b2d033e876fd41fa4e8035b872699e525a57046e1f2f09c860",
    "a5a1218dce63acdac152a6b3b5bb366e7267e36f4069848cf455543b3fa5700e",
  ];

  for (const checksum of checksums) {
    assert.match(source, new RegExp(checksum));
  }
  assert.doesNotMatch(source, /checksums\.txt/u);
  assert.match(source, /sha256sum --check --strict/u);
  assert.ok(source.indexOf("sha256sum --check --strict") < source.indexOf("tar -xzf"));
  assert.doesNotMatch(source, /Restore scanner CLI cache|~\/\.security-tools/u);
});

test("security attestation Python scanners use a hash-locked binary-only dependency tree", async () => {
  const [source, requirementsInput, requirements] = await Promise.all([
    attestationActionPromise,
    attestationRequirementsInputPromise,
    attestationRequirementsPromise,
  ]);

  assert.match(source, /actions\/setup-python@[0-9a-f]{40} # v7\.0\.0/u);
  assert.match(source, /--only-binary=:all:/u);
  assert.match(source, /--require-hashes/u);
  assert.match(source, /--requirement "\$REQUIREMENTS_FILE"/u);
  const lines = requirements.split("\n");
  const requirementIndexes = lines.flatMap((line, index) => {
    if (!line.trim() || line.trimStart().startsWith("#") || line.startsWith(" ")) return [];
    assert.match(line, /^[a-z0-9][a-z0-9._-]*==[^ ]+ \\$/u);
    return [index];
  });
  const lockedPins = requirementIndexes.map((index) => lines[index].slice(0, -2));
  assert.equal(new Set(lockedPins.map((pin) => pin.split("==")[0])).size, lockedPins.length);
  assertScannerPinsMatchLock(requirementsInput, lockedPins);
  assert.ok(requirementIndexes.length > 2, "expected the full transitive dependency lock");
  for (const [position, start] of requirementIndexes.entries()) {
    const end = requirementIndexes[position + 1] ?? lines.length;
    assert.match(lines.slice(start, end).join("\n"), /--hash=sha256:[0-9a-f]{64}/u);
  }
});
