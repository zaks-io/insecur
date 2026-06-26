import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadUserSchemaTables } from "../src/db/schema/schema-tables.js";
import { extractSchemaShapeRegistry } from "../src/db/schema/schema-shape.js";
import { materializePgTableExtraConfigs } from "../test/helpers/materialize-pg-table-extra-config.js";

const outputPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/db/schema/schema-shape-registry.json",
);

const tables = await loadUserSchemaTables();
materializePgTableExtraConfigs(tables);

const registry = extractSchemaShapeRegistry(tables);
writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(
  `Wrote schema shape registry with ${Object.keys(registry).length} tables to ${outputPath}`,
);
