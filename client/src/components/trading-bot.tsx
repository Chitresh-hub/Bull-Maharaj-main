import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Download, 
  Power, 
  LineChart as LineChartIcon,
  BarChart3,
  Activity,
  Brain,
  PieChart
} from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface PerformanceTimepoint {
  date: string;
  value: number;
  change: number;
}

interface BotPerformanceMetrics {
  totalReturn: number;
  totalReturnPercentage: number;
  winRate: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  averageHoldingPeriod: number;
  performanceTimeline: PerformanceTimepoint[];
}

interface TradingHistoryItem {
  id: number;
  userId: number;
  stockId: number;
  action: string;
  quantity: number;
  price: number;
  timestamp: string;
  profitLoss?: number;
  stock: {
    id: number;
    symbol: string;
    name: string;
    currentPrice: number;
    prevClosePrice: number;
    change: number;
    changePercent: number;
    updatedAt: string;
  };
}

interface TradingDecision {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reason: string;
  indicatorsUsed: string[];
}

interface Stock {
  id: number;
  symbol: string;
  name: string;
  currentPrice: number;
  prevClosePrice: number;
  change: number;
  changePercent: number;
  updatedAt: string;
}

type TradingStrategy = "MOVING_AVERAGE" | "RSI" | "MACD" | "BOLLINGER" | "ANN";

export default function TradingBot() {
  const [activeStock, setActiveStock] = useState<number | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<TradingStrategy>("ANN");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [learningRate, setLearningRate] = useState(0.01);
  const [explorationRate, setExplorationRate] = useState(0.1);
  const [tradeQuantity, setTradeQuantity] = useState(10);

  // Query trading bot status
  const { data: botStatus, isLoading: isLoadingStatus } = useQuery<{ active: boolean }>({
    queryKey: ['/api/trading-bot/status'],
    queryFn: async () => {
      const res = await fetch('/api/trading-bot/status');
      if (!res.ok) {
        throw new Error("Failed to fetch bot status");
      }
      return await res.json();
    },
  });

  // Query performance metrics
  const { data: performance, isLoading: isLoadingPerformance } = useQuery<BotPerformanceMetrics>({
    queryKey: ['/api/trading-bot/performance'],
    queryFn: async () => {
      const res = await fetch('/api/trading-bot/performance');
      if (!res.ok) {
        throw new Error("Failed to fetch performance metrics");
      }
      return await res.json();
    },
  });

  // Query trading history
  const { data: tradingHistory, isLoading: isLoadingHistory } = useQuery<TradingHistoryItem[]>({
    queryKey: ['/api/trading-history'],
    queryFn: async () => {
      const res = await fetch('/api/trading-history');
      if (!res.ok) {
        throw new Error("Failed to fetch trading history");
      }
      return await res.json();
    },
  });

  // Query stocks
  const { data: stocks, isLoading: isLoadingStocks } = useQuery<Stock[]>({
    queryKey: ['/api/stocks'],
    queryFn: async () => {
      const res = await fetch('/api/stocks');
      if (!res.ok) {
        throw new Error("Failed to fetch stocks");
      }
      return await res.json();
    },
  });

  // Query trading decision for selected stock
  const { data: tradingDecision, isLoading: isLoadingDecision } = useQuery<TradingDecision>({
    queryKey: ['/api/trading-bot/decision', activeStock],
    enabled: !!activeStock,
    queryFn: async () => {
      if (!activeStock) {
        throw new Error("No stock selected");
      }
      const res = await fetch(`/api/trading-bot/decision/${activeStock}`);
      if (!res.ok) {
        throw new Error("Failed to fetch trading decision");
      }
      return await res.json();
    },
  });

  // Mutation to toggle bot status
  const toggleBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trading-bot/toggle");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading-bot/status'] });
      toast({
        title: botStatus?.active ? "Trading Bot Deactivated" : "Trading Bot Activated",
        description: botStatus?.active 
          ? "The bot has been stopped and will not make any trades." 
          : "The bot has been activated and will start making trades based on its strategy.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to toggle bot status. " + error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to set strategy
  const setStrategyMutation = useMutation({
    mutationFn: async (strategy: TradingStrategy) => {
      const res = await apiRequest("POST", "/api/trading-bot/strategy", { strategy });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Strategy Updated",
        description: `Trading strategy has been set to ${activeStrategy}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update strategy. " + error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to update learning parameters
  const updateLearningParamsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trading-bot/learning-parameters", { 
        learningRate, 
        explorationRate 
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Parameters Updated",
        description: "Learning parameters have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update learning parameters. " + error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to execute a trade
  const executeTradeMutation = useMutation({
    mutationFn: async ({
      stockId,
      action,
      quantity,
    }: {
      stockId: number;
      action: "BUY" | "SELL" | "HOLD";
      quantity: number;
    }) => {
      const res = await apiRequest("POST", "/api/trading-bot/execute-trade", {
        stockId,
        action,
        quantity,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading-bot/performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
      toast({
        title: "Trade Executed",
        description: "Your trade has been executed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to execute trade. " + error.message,
        variant: "destructive",
      });
    },
  });

  // Function to handle strategy change
  const handleStrategyChange = (strategy: TradingStrategy) => {
    setActiveStrategy(strategy);
    setStrategyMutation.mutate(strategy);
  };

  // Function to handle saving learning parameters
  const handleSaveLearningParams = () => {
    updateLearningParamsMutation.mutate();
  };

  // Function to execute a trade
  const executeTrade = (action: "BUY" | "SELL" | "HOLD") => {
    if (!activeStock) {
      toast({
        title: "No Stock Selected",
        description: "Please select a stock before executing a trade.",
        variant: "destructive",
      });
      return;
    }

    executeTradeMutation.mutate({
      stockId: activeStock,
      action,
      quantity: tradeQuantity,
    });
  };

  // Function to handle toggle bot status
  const handleToggleBot = () => {
    toggleBotMutation.mutate();
  };

  // Function to export trading data
  const exportData = () => {
    if (!performance || !tradingHistory) return;
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Action,Symbol,Quantity,Price,Profit/Loss\n"
      + tradingHistory.map(item => {
          const date = new Date(item.timestamp).toLocaleDateString();
          return `${date},${item.action},${item.stock.symbol},${item.quantity},${item.price},${item.profitLoss || 0}`;
        }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "trading_bot_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get the icon for the trading strategy
  const getStrategyIcon = (strategy: TradingStrategy) => {
    switch (strategy) {
      case "MOVING_AVERAGE":
        return <LineChartIcon className="h-5 w-5" />;
      case "RSI":
        return <Activity className="h-5 w-5" />;
      case "MACD":
        return <BarChart3 className="h-5 w-5" />;
      case "BOLLINGER":
        return <PieChart className="h-5 w-5" />;
      case "ANN":
        return <Brain className="h-5 w-5" />;
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">
          Bull Maharaj AI Trading Bot
        </h2>
        <div className="flex space-x-2">
          <Button 
            variant={botStatus?.active ? "outline" : "default"} 
            size="sm"
            onClick={handleToggleBot}
            disabled={isLoadingStatus || toggleBotMutation.isPending}
          >
            <Power className={`mr-2 h-4 w-4 ${botStatus?.active ? "text-primary-600" : "text-white"}`} />
            {botStatus?.active ? "Stop Bot" : "Start Bot"}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={exportData}
            disabled={isLoadingPerformance || isLoadingHistory}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main panel */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Performance Overview</CardTitle>
                  <CardDescription>
                    Last updated: {new Date().toLocaleString("en-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })} IST
                  </CardDescription>
                </div>
                <div>
                  <Select defaultValue="30days">
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Select time period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7days">Last 7 days</SelectItem>
                      <SelectItem value="30days">Last 30 days</SelectItem>
                      <SelectItem value="90days">Last 90 days</SelectItem>
                      <SelectItem value="ytd">Year to date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {isLoadingPerformance ? (
                  <>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-8 w-32" />
                    </div>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-8 w-32" />
                    </div>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-8 w-32" />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <p className="text-sm font-medium text-gray-500">Total Return</p>
                      <p className="text-2xl font-semibold text-primary-600">
                        +₹{performance?.totalReturn.toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {performance?.totalReturnPercentage.toFixed(2)}%
                      </p>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <p className="text-sm font-medium text-gray-500">Win Rate</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {performance?.winRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {performance?.successfulTrades} / {performance?.totalTrades} trades
                      </p>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:14}}>
                      <p className="text-sm font-medium text-gray-500">Avg. Holding Period</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {performance?.averageHoldingPeriod} days
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {performance?.totalTrades} total trades
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="relative h-[300px]">
                {isLoadingPerformance ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : (
                  <LineChart
                    data={
                      performance?.performanceTimeline.map((point) => ({
                        x: point.date,
                        y: point.value,
                      })) || []
                    }
                    xAxisKey="x"
                    yAxisKey="y"
                    color="hsl(0, 72%, 43%)"
                  />
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Trading Strategy Settings</CardTitle>
              <CardDescription>
                Configure which strategy the trading bot should use for decision making
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs 
                value={activeStrategy} 
                onValueChange={(value) => handleStrategyChange(value as TradingStrategy)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-5 mb-6">
                  <TabsTrigger value="ANN" className="flex flex-col items-center py-3">
                    <Brain className="h-5 w-5 mb-1" />
                    <span className="text-xs">ANN Model</span>
                  </TabsTrigger>
                  <TabsTrigger value="MOVING_AVERAGE" className="flex flex-col items-center py-3">
                    <LineChartIcon className="h-5 w-5 mb-1" />
                    <span className="text-xs">Moving Avg</span>
                  </TabsTrigger>
                  <TabsTrigger value="RSI" className="flex flex-col items-center py-3">
                    <Activity className="h-5 w-5 mb-1" />
                    <span className="text-xs">RSI</span>
                  </TabsTrigger>
                  <TabsTrigger value="MACD" className="flex flex-col items-center py-3">
                    <BarChart3 className="h-5 w-5 mb-1" />
                    <span className="text-xs">MACD</span>
                  </TabsTrigger>
                  <TabsTrigger value="BOLLINGER" className="flex flex-col items-center py-3">
                    <PieChart className="h-5 w-5 mb-1" />
                    <span className="text-xs">Bollinger</span>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="ANN" className="space-y-4">
                  <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:16}}>
                    <h4 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"var(--accent-cyan)",marginBottom:8,letterSpacing:"0.05em"}}>
                      Artificial Neural Network (ANN) Strategy
                    </h4>
                    <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:16}}>
                      A feedforward ANN (7→12→6→3) trained with the Adam optimiser. Evaluates RSI,
                      SMA ratio, Bollinger %B, MACD histogram, volatility, 5-day return and volume ratio.
                      Outputs BUY / SELL / HOLD probabilities and updates weights online after every trade.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase"}}>
                          Network Parameters
                        </h5>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <Label htmlFor="learning-rate" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)"}}>
                                Learning Rate: {learningRate.toFixed(4)}
                              </Label>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--text-muted)"}}>
                                Adam step size
                              </span>
                            </div>
                            <Slider
                              id="learning-rate"
                              defaultValue={[learningRate]}
                              max={0.05}
                              min={0.0001}
                              step={0.0001}
                              onValueChange={(value) => setLearningRate(value[0])}
                            />
                          </div>
                          
                          <Button 
                            onClick={handleSaveLearningParams}
                            disabled={updateLearningParamsMutation.isPending}
                            className="w-full"
                            style={{background:"transparent",border:"1px solid var(--accent-cyan)",color:"var(--accent-cyan)",fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:600,letterSpacing:"0.08em"}}
                          >
                            Save Parameters
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>
                          Key Features
                        </h5>
                        <ul className="space-y-2">
                          {[
                            "7-input feedforward network — 2 hidden layers (ReLU)",
                            "Softmax output: P(BUY) / P(SELL) / P(HOLD)",
                            "Adam optimiser with Xavier weight initialisation",
                            "Online learning — refines weights after every trade",
                            "Pre-trained on 500 synthetic epochs at startup",
                          ].map((text, i) => (
                            <li key={i} className="flex items-start" style={{gap:8}}>
                              <span style={{color:"var(--accent-cyan)",fontSize:10,marginTop:3,flexShrink:0}}>▸</span>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.6}}>{text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="MOVING_AVERAGE" className="space-y-4">
                  <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:16}}>
                    <h4 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"var(--accent-cyan)",marginBottom:8}}>Moving Average Crossover Strategy</h4>
                    <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:14}}>
                      Uses short-term (10-day) and long-term (50-day) simple moving averages.
                      Generates buy signals when short-term MA crosses above long-term MA,
                      and sell signals when it crosses below.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Trading Signals</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 mr-2">BUY</Badge>
                            <span className="text-sm">Short-term MA crosses above long-term MA</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 mr-2">SELL</Badge>
                            <span className="text-sm">Short-term MA crosses below long-term MA</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 mr-2">HOLD</Badge>
                            <span className="text-sm">No crossover detected</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Advantages</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Simple and proven strategy for trend following</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Effective in strongly trending markets</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Reduces noise in price movements</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="RSI" className="space-y-4">
                  <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:16}}>
                    <h4 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"var(--accent-cyan)",marginBottom:8}}>RSI (Relative Strength Index) Strategy</h4>
                    <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:14}}>
                      Uses the 14-day RSI to identify overbought and oversold conditions.
                      Generates buy signals when RSI falls below 30 (oversold),
                      and sell signals when RSI rises above 70 (overbought).
                    </p>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Trading Signals</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 mr-2">BUY</Badge>
                            <span className="text-sm">RSI below 30 (oversold condition)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 mr-2">SELL</Badge>
                            <span className="text-sm">RSI above 70 (overbought condition)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 mr-2">HOLD</Badge>
                            <span className="text-sm">RSI between 30 and 70 (neutral zone)</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Advantages</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Excellent for identifying potential reversal points</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Works well in range-bound markets</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Provides clear overbought/oversold signals</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="MACD" className="space-y-4">
                  <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:16}}>
                    <h4 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"var(--accent-cyan)",marginBottom:8}}>MACD (Moving Average Convergence Divergence) Strategy</h4>
                    <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:14}}>
                      Uses MACD line (difference between 12-day and 26-day EMAs) and signal line (9-day EMA of MACD line).
                      Generates buy signals when MACD histogram turns positive,
                      and sell signals when it turns negative.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Trading Signals</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 mr-2">BUY</Badge>
                            <span className="text-sm">MACD histogram turns positive (bullish crossover)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 mr-2">SELL</Badge>
                            <span className="text-sm">MACD histogram turns negative (bearish crossover)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 mr-2">HOLD</Badge>
                            <span className="text-sm">No crossover detected</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Advantages</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Combines trend-following and momentum indicators</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Effective for identifying trend changes</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Works well in trending markets</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="BOLLINGER" className="space-y-4">
                  <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid var(--border)",borderRadius:4,padding:16}}>
                    <h4 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"var(--accent-cyan)",marginBottom:8}}>Bollinger Bands Strategy</h4>
                    <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:14}}>
                      Uses 20-day moving average with bands at 2 standard deviations.
                      Generates buy signals when price falls below the lower band,
                      and sell signals when price rises above the upper band.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Trading Signals</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 mr-2">BUY</Badge>
                            <span className="text-sm">Price below lower Bollinger Band (oversold)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 mr-2">SELL</Badge>
                            <span className="text-sm">Price above upper Bollinger Band (overbought)</span>
                          </li>
                          <li className="flex items-start">
                            <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 mr-2">HOLD</Badge>
                            <span className="text-sm">Price within the bands or preparing for breakout</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h5 style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Advantages</h5>
                        <ul className="space-y-2">
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Adapts to market volatility automatically</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Identifies potential reversal points</span>
                          </li>
                          <li className="flex items-start">
                            <span className="h-5 w-5 text-primary-600 mr-2">•</span>
                            <span className="text-sm">Can detect squeeze patterns before breakouts</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        
        {/* Right panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trading Signals</CardTitle>
              <CardDescription>
                Get predictions for specific stocks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="stock-select" className="mb-2 block">Select Stock</Label>
                <Select 
                  value={activeStock?.toString()} 
                  onValueChange={(value) => setActiveStock(parseInt(value))}
                >
                  <SelectTrigger id="stock-select" className="w-full">
                    <SelectValue placeholder="Choose a stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingStocks ? (
                      <SelectItem value="loading">Loading stocks...</SelectItem>
                    ) : (
                      stocks?.map((stock) => (
                        <SelectItem key={stock.id} value={stock.id.toString()}>
                          {stock.symbol} - {stock.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {activeStock && (
                <div className="border rounded-md p-4">
                  {isLoadingDecision ? (
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    tradingDecision && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <Badge 
                              className={`mr-2 ${
                                tradingDecision.signal === "BUY" 
                                  ? "bg-green-100 text-green-800 hover:bg-green-100" 
                                  : tradingDecision.signal === "SELL"
                                  ? "bg-red-100 text-red-800 hover:bg-red-100"
                                  : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                              }`}
                            >
                              {tradingDecision.signal}
                            </Badge>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.12em",textTransform:"uppercase"}}>
                              Confidence: {tradingDecision.confidence.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center">
                            {getStrategyIcon(activeStrategy)}
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs text-gray-500">REASONING</Label>
                          <p className="text-sm mt-1">{tradingDecision.reason}</p>
                        </div>
                        
                        <div>
                          <Label className="text-xs text-gray-500">INDICATORS USED</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tradingDecision.indicatorsUsed.map((indicator) => (
                              <Badge key={indicator} variant="outline">
                                {indicator}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="pt-2">
                          <Label htmlFor="quantity" className="mb-2 block text-xs text-gray-500">
                            QUANTITY
                          </Label>
                          <div className="flex items-center gap-2">
                            <input
                              id="quantity"
                              type="number"
                              min="1"
                              max="1000"
                              value={tradeQuantity}
                              onChange={(e) => setTradeQuantity(parseInt(e.target.value))}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 border-green-200"
                            onClick={() => executeTrade("BUY")}
                            disabled={executeTradeMutation.isPending}
                          >
                            Buy
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border-red-200"
                            onClick={() => executeTrade("SELL")}
                            disabled={executeTradeMutation.isPending}
                          >
                            Sell
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Trading Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{background:"rgba(0,0,0,0.3)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)"}}>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">Stock</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">Action</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">Qty</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingHistory ? (
                      Array(5).fill(0).map((_, index) => (
                        <tr key={index} style={{borderBottom:"1px solid rgba(30,58,95,0.4)"}}>
                          <td className="py-3 px-4">
                            <Skeleton className="h-4 w-16" />
                          </td>
                          <td className="py-3 px-4">
                            <Skeleton className="h-4 w-12" />
                          </td>
                          <td className="py-3 px-4">
                            <Skeleton className="h-4 w-10" />
                          </td>
                          <td className="py-3 px-4">
                            <Skeleton className="h-4 w-14" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      tradingHistory?.slice(0, 5).map((trade) => (
                        <tr key={trade.id} style={{borderBottom:"1px solid rgba(30,58,95,0.4)"}}>
                          <td className="py-3 px-4 text-sm font-medium">
                            {trade.stock.symbol}
                          </td>
                          <td className={`py-3 px-4 text-sm ${
                            trade.action === "BUY" ? "text-primary-600" : "text-red-600"
                          }`}>
                            {trade.action}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {trade.quantity}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            ₹{trade.price.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}