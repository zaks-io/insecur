#!/usr/bin/env node
// Keep the public CI path stable, but run the implementation from apps/api so
// workspace package imports resolve relative to the package that declares them.
import "../../apps/api/scripts/smoke-first-value.mjs";
