#!/usr/bin/env node
// Compile the actual native calculator and exercise every approved alias and conditional.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(
  readFileSync(
    new URL("packages/www/src/lib/discovery/catalog.json", root),
    "utf8",
  ),
);
const source = fileURLToPath(
  new URL(
    "../morpheus/morpheus/MorpheusRuntime/Cloud/MorpheusDiscovery.swift",
    root,
  ),
);
const lines = [
  "import Foundation",
  "precondition(MorpheusDiscovery.catalogVersion == 2)",
  "precondition(MorpheusDiscovery.count([]).total == 518)",
];
for (const [section, total] of Object.entries(catalog.sectionTotals))
  lines.push(
    `precondition(MorpheusDiscovery.count([], sectionID: "${section}").total == ${total})`,
  );
for (const unit of catalog.units) {
  const ids = JSON.stringify(unit.sceneIds),
    uid = JSON.stringify(unit.id),
    assets = JSON.stringify(unit.assets);
  lines.push(
    `precondition(MorpheusDiscovery.count(Set(${ids})).discovered == 1)`,
    `precondition(MorpheusDiscovery.count(Set(${ids}), observedDiscoveryIDs: [${uid}]).discovered == 1)`,
  );
  for (const scene of unit.sceneIds)
    lines.push(
      `precondition(MorpheusDiscovery.observedIDs(sceneID: ${scene}, visibleAssetPaths: ${assets}) == [${uid}])`,
    );
  for (const condition of unit.conditionalObservations ?? [])
    lines.push(
      `precondition(MorpheusDiscovery.observedIDs(sceneID: ${condition.sceneId}, visibleAssetPaths: [${JSON.stringify(condition.visibleAsset)}]) == [${uid}])`,
    );
}
lines.push(
  "precondition(MorpheusDiscovery.count([710050]).discovered == 0)",
  "precondition(!MorpheusDiscovery.isCompleted([895050, 100201]))",
  "precondition(MorpheusDiscovery.isCompleted([895065]))",
  "precondition(MorpheusDiscovery.count([895065]).discovered == 0)",
  'print("Swift parity passed: 518 units, all aliases, conditionals, section totals, repeats, ending")',
);
const temp = mkdtempSync(join(tmpdir(), "morpheus-discovery-parity-"));
try {
  const main = join(temp, "main.swift"),
    binary = join(temp, "parity");
  writeFileSync(main, lines.join("\n") + "\n");
  execFileSync("swiftc", [source, main, "-o", binary], { stdio: "inherit" });
  execFileSync(binary, [], { stdio: "inherit" });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
