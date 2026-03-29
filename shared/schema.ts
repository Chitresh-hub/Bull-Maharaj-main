import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  isActive: boolean("is_active").notNull().default(true),
});

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  currentPrice: real("current_price").notNull(),
  prevClosePrice: real("prev_close_price").notNull(),
  change: real("change").notNull(),
  changePercent: real("change_percent").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const portfolioItems = pgTable("portfolio_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  quantity: integer("quantity").notNull(),
  avgPrice: real("avg_price").notNull(),
  currentValue: real("current_value").notNull(),
  profitLoss: real("profit_loss").notNull(),
  profitLossPercent: real("profit_loss_percent").notNull(),
});

export const tradingHistory = pgTable("trading_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  action: text("action").notNull(), // BUY, SELL
  quantity: integer("quantity").notNull(),
  price: real("price").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  profitLoss: real("profit_loss"),
});

export const stockPredictions = pgTable("stock_predictions", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  signal: text("signal").notNull(), // STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
  confidence: real("confidence").notNull(),
  targetPrice: real("target_price").notNull(),
  expectedReturn: real("expected_return").notNull(),
  timeHorizon: text("time_horizon").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
});

export const insertStockSchema = createInsertSchema(stocks).omit({
  id: true,
});

export const insertPortfolioItemSchema = createInsertSchema(portfolioItems).omit({
  id: true,
});

export const insertTradingHistorySchema = createInsertSchema(tradingHistory).omit({
  id: true,
});

export const insertStockPredictionSchema = createInsertSchema(stockPredictions).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Stock = typeof stocks.$inferSelect;
export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type TradingHistory = typeof tradingHistory.$inferSelect;
export type StockPrediction = typeof stockPredictions.$inferSelect;

// Login Schema
export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
