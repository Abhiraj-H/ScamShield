import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const cases = sqliteTable('cases', {
 id: text('id').primaryKey(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
 status: text('status').notNull(), lang: text('lang').notNull(), result: text('result').notNull(),
}, t=>[index('idx_cases_created_at').on(t.createdAt)]);
export const intel = sqliteTable('intel', {
 indicatorHash: text('indicator_hash').primaryKey(), kind:text('kind').notNull(),
 reportCount:integer('report_count').notNull().default(1), firstSeen:text('first_seen').notNull(), lastSeen:text('last_seen').notNull(),
});
