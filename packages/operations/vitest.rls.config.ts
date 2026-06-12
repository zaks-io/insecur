import rootConfig from "../../vitest.config.js";
import { defineConsumerRlsVitestConfig } from "../tenant-store/test/rls/define-consumer-rls-vitest-config.js";

export default defineConsumerRlsVitestConfig(import.meta.url, rootConfig);
