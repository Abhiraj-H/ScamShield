import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const cases = sqliteTable('cases', {
 id: text('id').primaryKey(), ownerId:text('owner_id').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
 status: text('status').notNull(), lang: text('lang').notNull(), result: text('result').notNull(),
}, t=>[index('idx_cases_created_at').on(t.createdAt)]);
export const intel = sqliteTable('intel', {
 indicatorHash: text('indicator_hash').primaryKey(), kind:text('kind').notNull(),
 reportCount:integer('report_count').notNull().default(1), firstSeen:text('first_seen').notNull(), lastSeen:text('last_seen').notNull(),
});

export const rateLimits=sqliteTable('rate_limits',{bucket:text('bucket').notNull(),window:integer('window').notNull(),count:integer('count').notNull()},t=>[uniqueIndex('idx_rate_bucket').on(t.bucket,t.window)]);
export const auditEvents=sqliteTable('audit_events',{seq:integer('seq').primaryKey({autoIncrement:true}),body:text('body').notNull(),previous:text('previous').notNull(),digest:text('digest').notNull()});
