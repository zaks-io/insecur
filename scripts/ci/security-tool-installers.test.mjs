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
    "1816b632dfe529869c740c0913e36bd1629cb7688bd5634f4a858c1d57c88b75",
    "590650c2743b83f327d1bf9bec64f6f83b7fec504187bb84f500c862bf8f2a0f",
    "18ed2048d7a233566b681121d4632364f5f25d72cca86acc4c7ac57210d78a87",
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
  assert.equal(requirementsInput, "checkov==3.2.510\nsemgrep==1.157.0\n");
  assert.match(requirements, /^checkov==3\.2\.510 \\/mu);
  assert.match(requirements, /^semgrep==1\.157\.0 \\/mu);

  const lines = requirements.split("\n");
  const requirementIndexes = lines.flatMap((line, index) =>
    /^[a-z0-9][a-z0-9._-]*==[^ ]+ \\$/u.test(line) ? [index] : [],
  );
  assert.ok(requirementIndexes.length > 2, "expected the full transitive dependency lock");
  for (const [position, start] of requirementIndexes.entries()) {
    const end = requirementIndexes[position + 1] ?? lines.length;
    assert.match(lines.slice(start, end).join("\n"), /--hash=sha256:[0-9a-f]{64}/u);
  }
});
