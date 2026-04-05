import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getMarketOverview, getMarketSentiment, getStockPriceChartData } from "./utils/marketData";
import { setupAuth } from "./auth";

// ─── Python model server proxy ────────────────────────────────────────────────

const BOT_URL = "http://localhost:8000";

const bot = (path: string, method = "GET", body?: object) =>
  fetch(`${BOT_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const authenticate = (req: Request, res: Response, next: Function) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    next();
  };

  // ── Market ────────────────────────────────────────────────────────────────

  app.get("/api/market/overview", async (req, res) => {
    try { res.status(200).json(await getMarketOverview()); }
    catch { res.status(500).json({ message: "Failed to fetch market overview" }); }
  });

  app.get("/api/market/sentiment", async (req, res) => {
    try { res.status(200).json(await getMarketSentiment()); }
    catch { res.status(500).json({ message: "Failed to fetch sentiment" }); }
  });

  // ── Stocks ────────────────────────────────────────────────────────────────

  app.get("/api/stocks", async (req, res) => {
    try { res.status(200).json(await storage.getStocks()); }
    catch { res.status(500).json({ message: "Failed to fetch stocks" }); }
  });

  app.get("/api/stocks/:id", async (req, res) => {
    try {
      const stock = await storage.getStock(parseInt(req.params.id));
      if (!stock) return res.status(404).json({ message: "Stock not found" });
      res.status(200).json(stock);
    } catch { res.status(500).json({ message: "Failed to fetch stock" }); }
  });

  app.get("/api/stocks/:id/chart", async (req, res) => {
    try {
      const stock = await storage.getStock(parseInt(req.params.id));
      if (!stock) return res.status(404).json({ message: "Stock not found" });
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      res.status(200).json(await getStockPriceChartData(stock.symbol, days));
    } catch { res.status(500).json({ message: "Failed to fetch chart data" }); }
  });

  // ── Portfolio ─────────────────────────────────────────────────────────────

  app.get("/api/portfolio", authenticate, async (req, res) => {
    try {
      const items = await storage.getPortfolioByUserId(req.user!.id);
      const enriched = await Promise.all(
        items.map(async i => ({ ...i, stock: await storage.getStock(i.stockId) }))
      );
      res.status(200).json(enriched);
    } catch { res.status(500).json({ message: "Failed to fetch portfolio" }); }
  });

  // ── Trading history ───────────────────────────────────────────────────────

  app.get("/api/trading-history", authenticate, async (req, res) => {
    try {
      const history = await storage.getTradingHistoryByUserId(req.user!.id);
      const enriched = await Promise.all(
        history.map(async e => ({ ...e, stock: await storage.getStock(e.stockId) }))
      );
      res.status(200).json(enriched);
    } catch { res.status(500).json({ message: "Failed to fetch trading history" }); }
  });

  // ── Predictions ───────────────────────────────────────────────────────────

  app.get("/api/predictions", async (req, res) => {
    try {
      const preds = await storage.getStockPredictions();
      const enriched = await Promise.all(
        preds.map(async p => ({ ...p, stock: await storage.getStock(p.stockId) }))
      );
      res.status(200).json(enriched);
    } catch { res.status(500).json({ message: "Failed to fetch predictions" }); }
  });

  // ── Trading bot — all calls proxied to Python server ─────────────────────

  app.get("/api/trading-bot/status", authenticate, async (req, res) => {
    try { res.status(200).json(await bot("/bot/status")); }
    catch { res.status(500).json({ message: "Failed to fetch bot status" }); }
  });

  app.post("/api/trading-bot/toggle", authenticate, async (req, res) => {
    try { res.status(200).json(await bot("/bot/toggle", "POST")); }
    catch { res.status(500).json({ message: "Failed to toggle bot" }); }
  });

  app.get("/api/trading-bot/performance", authenticate, async (req, res) => {
    try { res.status(200).json(await bot("/bot/performance")); }
    catch { res.status(500).json({ message: "Failed to fetch bot performance" }); }
  });

  app.get("/api/trading-bot/decision/:stockId", authenticate, async (req, res) => {
    try { res.status(200).json(await bot(`/bot/decision/${req.params.stockId}`)); }
    catch { res.status(500).json({ message: "Failed to generate decision" }); }
  });

  app.post("/api/trading-bot/strategy", authenticate, async (req, res) => {
    try {
      const { strategy } = req.body;
      if (!["MOVING_AVERAGE", "RSI", "MACD", "BOLLINGER", "ANN", "RNN"].includes(strategy))
        return res.status(400).json({ message: "Invalid strategy" });
      const result = await bot("/bot/strategy", "POST", { strategy });
      res.status(200).json({ ...result, success: true });
    } catch { res.status(500).json({ message: "Failed to set strategy" }); }
  });

  app.post("/api/trading-bot/execute-trade", authenticate, async (req, res) => {
    try {
      const { stockId, action, quantity } = req.body;
      if (!stockId || !action || !quantity)
        return res.status(400).json({ message: "Missing required parameters" });
      if (!["BUY", "SELL", "HOLD"].includes(action))
        return res.status(400).json({ message: "Invalid action" });

      const result = await bot("/bot/trade", "POST", {
        user_id:  req.user!.id,
        stock_id: stockId,
        action,
        quantity,
      });
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        message: result.success ? "Trade executed" : "Trade failed",
      });
    } catch { res.status(500).json({ message: "Failed to execute trade" }); }
  });

  app.post("/api/trading-bot/learning-parameters", authenticate, async (req, res) => {
    try {
      const { learningRate } = req.body;
      await bot("/bot/learning-rate", "POST", { learning_rate: learningRate });
      res.status(200).json({ success: true, message: "Learning parameters updated" });
    } catch { res.status(500).json({ message: "Failed to update parameters" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}