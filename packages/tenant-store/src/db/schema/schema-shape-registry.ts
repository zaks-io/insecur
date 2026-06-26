import type { SchemaShapeRegistry } from "./schema-shape.js";
import registry from "./schema-shape-registry.json" with { type: "json" };

export const SCHEMA_SHAPE_REGISTRY = registry as SchemaShapeRegistry;
