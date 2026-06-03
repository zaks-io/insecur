import { IndexBuilder } from "drizzle-orm/pg-core";

declare module "drizzle-orm/pg-core" {
  interface IndexConfig {
    nullsNotDistinct?: boolean;
  }

  interface IndexBuilder {
    nullsNotDistinct(): this;
  }
}

IndexBuilder.prototype.nullsNotDistinct = function nullsNotDistinct(this: IndexBuilder) {
  (this as IndexBuilder & { config: { nullsNotDistinct?: boolean } }).config.nullsNotDistinct =
    true;
  return this;
};

export {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export { sql } from "drizzle-orm";
