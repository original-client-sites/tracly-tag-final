import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const passwordResetsTable = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  otpCode: text("otp_code").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type PasswordReset = typeof passwordResetsTable.$inferSelect;
export type InsertPasswordReset = typeof passwordResetsTable.$inferInsert;
