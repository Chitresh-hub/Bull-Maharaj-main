import { 
  users, 
  stocks, 
  portfolioItems, 
  tradingHistory, 
  stockPredictions,
  type User, 
  type InsertUser,
  type Stock,
  type PortfolioItem,
  type TradingHistory,
  type StockPrediction
} from "@shared/schema";

import session from "express-session";
import createMemoryStore from "memorystore";

export interface IStorage {
  // Session store
  sessionStore: session.Store;
  
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Stock operations
  getStocks(): Promise<Stock[]>;
  getStock(id: number): Promise<Stock | undefined>;
  getStockBySymbol(symbol: string): Promise<Stock | undefined>;
  updateStock(id: number, updates: Partial<Stock>): Promise<Stock | undefined>;
  
  // Portfolio operations
  getPortfolioByUserId(userId: number): Promise<PortfolioItem[]>;
  getPortfolioItem(id: number): Promise<PortfolioItem | undefined>;
  createPortfolioItem(item: Omit<PortfolioItem, "id">): Promise<PortfolioItem>;
  updatePortfolioItem(id: number, updates: Partial<PortfolioItem>): Promise<PortfolioItem | undefined>;
  
  // Trading history operations
  getTradingHistoryByUserId(userId: number): Promise<TradingHistory[]>;
  createTradingHistory(entry: Omit<TradingHistory, "id">): Promise<TradingHistory>;
  
  // Stock predictions operations
  getStockPredictions(): Promise<StockPrediction[]>;
  getStockPredictionsByStockId(stockId: number): Promise<StockPrediction[]>;
  createStockPrediction(prediction: Omit<StockPrediction, "id" | "createdAt">): Promise<StockPrediction>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private stocks: Map<number, Stock>;
  private portfolioItems: Map<number, PortfolioItem>;
  private tradingHistory: Map<number, TradingHistory>;
  private stockPredictions: Map<number, StockPrediction>;
  public sessionStore: session.Store;
  private currentIds: {
    users: number;
    stocks: number;
    portfolioItems: number;
    tradingHistory: number;
    stockPredictions: number;
  };

  constructor() {
    this.users = new Map();
    this.stocks = new Map();
    this.portfolioItems = new Map();
    this.tradingHistory = new Map();
    this.stockPredictions = new Map();
    
    // Initialize memory store for sessions
    const MemoryStore = createMemoryStore(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
    
    this.currentIds = {
      users: 1,
      stocks: 1,
      portfolioItems: 1,
      tradingHistory: 1,
      stockPredictions: 1,
    };

    // Initialize with demo data
    this.initializeDemoData();
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const user: User = { 
      ...insertUser, 
      id, 
      isActive: true,
      fullName: insertUser.fullName || null 
    };
    this.users.set(id, user);
    return user;
  }

  // Stock operations
  async getStocks(): Promise<Stock[]> {
    return Array.from(this.stocks.values());
  }

  async getStock(id: number): Promise<Stock | undefined> {
    return this.stocks.get(id);
  }

  async getStockBySymbol(symbol: string): Promise<Stock | undefined> {
    return Array.from(this.stocks.values()).find(
      (stock) => stock.symbol === symbol
    );
  }

  async updateStock(id: number, updates: Partial<Stock>): Promise<Stock | undefined> {
    const stock = this.stocks.get(id);
    if (!stock) return undefined;
    
    const updatedStock = { ...stock, ...updates };
    this.stocks.set(id, updatedStock);
    return updatedStock;
  }

  // Portfolio operations
  async getPortfolioByUserId(userId: number): Promise<PortfolioItem[]> {
    return Array.from(this.portfolioItems.values()).filter(
      (item) => item.userId === userId
    );
  }

  async getPortfolioItem(id: number): Promise<PortfolioItem | undefined> {
    return this.portfolioItems.get(id);
  }

  async createPortfolioItem(item: Omit<PortfolioItem, "id">): Promise<PortfolioItem> {
    const id = this.currentIds.portfolioItems++;
    const portfolioItem: PortfolioItem = { ...item, id };
    this.portfolioItems.set(id, portfolioItem);
    return portfolioItem;
  }

  async updatePortfolioItem(id: number, updates: Partial<PortfolioItem>): Promise<PortfolioItem | undefined> {
    const item = this.portfolioItems.get(id);
    if (!item) return undefined;
    
    const updatedItem = { ...item, ...updates };
    this.portfolioItems.set(id, updatedItem);
    return updatedItem;
  }

  // Trading history operations
  async getTradingHistoryByUserId(userId: number): Promise<TradingHistory[]> {
    return Array.from(this.tradingHistory.values())
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createTradingHistory(entry: Omit<TradingHistory, "id">): Promise<TradingHistory> {
    const id = this.currentIds.tradingHistory++;
    const historyEntry: TradingHistory = { ...entry, id };
    this.tradingHistory.set(id, historyEntry);
    return historyEntry;
  }

  // Stock predictions operations
  async getStockPredictions(): Promise<StockPrediction[]> {
    return Array.from(this.stockPredictions.values());
  }

  async getStockPredictionsByStockId(stockId: number): Promise<StockPrediction[]> {
    return Array.from(this.stockPredictions.values())
      .filter((prediction) => prediction.stockId === stockId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createStockPrediction(prediction: Omit<StockPrediction, "id" | "createdAt">): Promise<StockPrediction> {
    const id = this.currentIds.stockPredictions++;
    const now = new Date();
    const stockPrediction: StockPrediction = { ...prediction, id, createdAt: now };
    this.stockPredictions.set(id, stockPrediction);
    return stockPrediction;
  }

  // Helper method to initialize demo data
  private initializeDemoData() {
    // Create demo user
    const user: User = {
      id: 1,
      username: "demouser",
      password: "password123",
      email: "demo@example.com",
      fullName: "Demo User",
      isActive: true
    };
    this.users.set(user.id, user);
    this.currentIds.users = 2;

    // Create demo stocks
    const stocksData: Omit<Stock, "id">[] = [
      {
        symbol: "TCS",
        name: "Tata Consultancy Services Ltd.",
        currentPrice: 3482.65,
        prevClosePrice: 3405.30,
        change: 77.35,
        changePercent: 2.27,
        updatedAt: new Date()
      },
      {
        symbol: "RELIANCE",
        name: "Reliance Industries Ltd.",
        currentPrice: 2437.65,
        prevClosePrice: 2385.20,
        change: 52.45,
        changePercent: 2.20,
        updatedAt: new Date()
      },
      {
        symbol: "HDFCBANK",
        name: "HDFC Bank Ltd.",
        currentPrice: 1672.30,
        prevClosePrice: 1695.75,
        change: -23.45,
        changePercent: -1.38,
        updatedAt: new Date()
      },
      {
        symbol: "INFY",
        name: "Infosys Ltd.",
        currentPrice: 1495.75,
        prevClosePrice: 1425.40,
        change: 70.35,
        changePercent: 4.94,
        updatedAt: new Date()
      },
      {
        symbol: "ICICIBANK",
        name: "ICICI Bank Ltd.",
        currentPrice: 928.45,
        prevClosePrice: 914.20,
        change: 14.25,
        changePercent: 1.56,
        updatedAt: new Date()
      },
      {
        symbol: "TATASTEEL",
        name: "Tata Steel Ltd.",
        currentPrice: 123.45,
        prevClosePrice: 121.75,
        change: 1.70,
        changePercent: 1.40,
        updatedAt: new Date()
      }
    ];

    stocksData.forEach((stockData, index) => {
      const id = index + 1;
      const stock: Stock = { id, ...stockData };
      this.stocks.set(id, stock);
    });
    this.currentIds.stocks = stocksData.length + 1;

    // Create demo portfolio items
    const portfolioData: Omit<PortfolioItem, "id">[] = [
      {
        userId: 1,
        stockId: 1, // TCS
        quantity: 50,
        avgPrice: 3342.5,
        currentValue: 174132.5,
        profitLoss: 7007.5,
        profitLossPercent: 4.19
      },
      {
        userId: 1,
        stockId: 2, // RELIANCE
        quantity: 100,
        avgPrice: 2385.2,
        currentValue: 243765.0,
        profitLoss: 5245.0,
        profitLossPercent: 2.20
      },
      {
        userId: 1,
        stockId: 3, // HDFCBANK
        quantity: 150,
        avgPrice: 1695.75,
        currentValue: 250845.0,
        profitLoss: -3517.5,
        profitLossPercent: -1.38
      },
      {
        userId: 1,
        stockId: 4, // INFY
        quantity: 75,
        avgPrice: 1425.4,
        currentValue: 112181.25,
        profitLoss: 5276.25,
        profitLossPercent: 4.94
      }
    ];

    portfolioData.forEach((itemData, index) => {
      const id = index + 1;
      const item: PortfolioItem = { id, ...itemData };
      this.portfolioItems.set(id, item);
    });
    this.currentIds.portfolioItems = portfolioData.length + 1;

    // Create demo trading history
    const tradingHistoryData: Omit<TradingHistory, "id">[] = [
      {
        userId: 1,
        stockId: 2, // RELIANCE
        action: "BUY",
        quantity: 50,
        price: 2437.65,
        timestamp: new Date(new Date().setHours(new Date().getHours() - 1)),
        profitLoss: 3240
      },
      {
        userId: 1,
        stockId: 3, // HDFCBANK
        action: "SELL",
        quantity: 100,
        price: 1672.30,
        timestamp: new Date(new Date().setHours(new Date().getHours() - 2)),
        profitLoss: -1120
      },
      {
        userId: 1,
        stockId: 4, // INFY
        action: "BUY",
        quantity: 75,
        price: 1495.75,
        timestamp: new Date(new Date().setHours(new Date().getHours() - 3)),
        profitLoss: 2680
      },
      {
        userId: 1,
        stockId: 6, // TATASTEEL
        action: "BUY",
        quantity: 200,
        price: 123.45,
        timestamp: new Date(new Date().setHours(new Date().getHours() - 5)),
        profitLoss: 1850
      }
    ];

    tradingHistoryData.forEach((historyData, index) => {
      const id = index + 1;
      const entry: TradingHistory = { id, ...historyData };
      this.tradingHistory.set(id, entry);
    });
    this.currentIds.tradingHistory = tradingHistoryData.length + 1;

    // Create demo stock predictions (Updated with current market data as of March 29, 2024)
    const stockPredictionsData: Omit<StockPrediction, "id" | "createdAt">[] = [
      {
        stockId: 1, // TCS
        signal: "STRONG_BUY",
        confidence: 94,
        targetPrice: 4320.75,
        expectedReturn: 9.51,
        timeHorizon: "3 months"
      },
      {
        stockId: 5, // ICICIBANK
        signal: "BUY",
        confidence: 87,
        targetPrice: 1125.40,
        expectedReturn: 8.93,
        timeHorizon: "2 months"
      },
      {
        stockId: 2, // RELIANCE
        signal: "STRONG_BUY",
        confidence: 92,
        targetPrice: 3215.85,
        expectedReturn: 10.17,
        timeHorizon: "3 months"
      },
      {
        stockId: 4, // INFY
        signal: "BUY",
        confidence: 79,
        targetPrice: 1835.20,
        expectedReturn: 9.37,
        timeHorizon: "2 months"
      },
      {
        stockId: 8, // HCLTECH
        signal: "BUY",
        confidence: 83,
        targetPrice: 1675.90,
        expectedReturn: 8.71,
        timeHorizon: "1 month"
      },
      {
        stockId: 10, // SUNPHARMA
        signal: "HOLD",
        confidence: 65,
        targetPrice: 1372.65,
        expectedReturn: 2.75,
        timeHorizon: "1 month"
      }
    ];

    stockPredictionsData.forEach((predictionData, index) => {
      const id = index + 1;
      const prediction: StockPrediction = { 
        id, 
        ...predictionData, 
        createdAt: new Date(new Date().setHours(new Date().getHours() - index))
      };
      this.stockPredictions.set(id, prediction);
    });
    this.currentIds.stockPredictions = stockPredictionsData.length + 1;
  }
}

export const storage = new MemStorage();
