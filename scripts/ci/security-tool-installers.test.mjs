import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installers = [
  ["install-gitleaks.sh", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"],
  ["install-actionlint.sh", "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"],
];

for (const [file, checksum] of installers) {
  test(`${file} verifies its pinned release checksum before extraction`, async () => {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, new RegExp(checksum));
    assert.match(source, /sha256sum --check --strict/u);
    assert.ok(source.indexOf("sha256sum --check") < source.indexOf("tar -x"));
  });
}
