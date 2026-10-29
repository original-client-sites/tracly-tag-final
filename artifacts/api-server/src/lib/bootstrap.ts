import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedDatabase } from "./db-reset.js";
import { logger } from "./logger.js";
import path from "path";
import fs from "fs";

export async function bootstrapDatabase(): Promise<void> {
  try {
    const candidates = [
      path.resolve(process.cwd(), "lib/db/drizzle"),
      path.resolve(process.cwd(), "../lib/db/drizzle"),
      path.resolve(process.cwd(), "../../lib/db/drizzle"),
      "/app/lib/db/drizzle",
    ];

    const migrationsFolder = candidates.find((p) => fs.existsSync(p));

    if (migrationsFolder) {
      logger.info({ migrationsFolder }, "Applying pending database migrations...");
      await migrate(db, { migrationsFolder });
      logger.info("Database migrations applied successfully.");
    }

    // Ensure password_resets table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "password_resets" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token" text NOT NULL UNIQUE,
        "otp_code" text NOT NULL,
        "expires_at" text NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "created_at" text NOT NULL
      );
    `);

    // Check if initial users exist
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    const count = Number(result?.count || 0);

    if (count === 0) {
      logger.info("No users found in database. Running initial system bootstrap & seed...");
      await seedDatabase(db);
      logger.info("System bootstrap completed successfully.");
    }
  } catch (err: any) {
    logger.warn({ err }, "Database bootstrap notice (system will continue)");
  }
}
