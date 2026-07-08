import rootConfig from "../../vitest.config.js";
import { defineConsumerUnitVitestConfig } from "../tenant-store/test/rls/define-consumer-rls-vitest-config.js";

export default defineConsumerUnitVitestConfig(import.meta.url, rootConfig);
