import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const portfolioWorkspaces=sqliteTable('portfolio_workspaces',{
 userId:text('user_id').primaryKey().notNull(),
 payload:text('payload').notNull(),
 revision:integer('revision').notNull(),
 updatedAt:text('updated_at').notNull(),
});
