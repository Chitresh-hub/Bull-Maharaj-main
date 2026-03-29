import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import TopNav from "@/components/layout/top-nav";
import MarketOverview from "@/components/market-overview";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, BarChart, Activity, Globe, Newspaper } from "lucide-react";

// Types for market sentiment
interface MarketSentiment {
  sentiment: string;
  sentimentScore: number;
  volatilityIndex: number;
  volatilityLevel: string;
  sectorStrength: number;
  sectorStrengthLevel: string;
  aiInsights: string;
  lastUpdated: string;
}

// Mock news data
const marketNews = [
  {
    id: 1,
    title: "SEBI Introduces New Regulations for Algo Trading",
    source: "Economic Times",
    date: "2023-03-30",
    snippet: "SEBI has introduced new regulations to monitor and regulate algorithmic trading in Indian markets...",
    url: "#",
    category: "Regulation"
  },
  {
    id: 2,
    title: "RBI Holds Interest Rates Steady at 6.5%",
    source: "Business Standard",
    date: "2023-03-28",
    snippet: "The Reserve Bank of India maintained its repo rate at 6.5% in its latest monetary policy announcement...",
    url: "#",
    category: "Economy"
  },
  {
    id: 3,
    title: "Reliance Industries Plans Major Expansion in Renewable Energy",
    source: "Mint",
    date: "2023-03-27",
    snippet: "Reliance Industries announced a ₹75,000 crore investment plan for green energy expansion over the next 5 years...",
    url: "#",
    category: "Corporate"
  },
  {
    id: 4,
    title: "Tech Stocks Rally as Global Sentiment Improves",
    source: "LiveMint",
    date: "2023-03-26",
    snippet: "Indian tech stocks showed significant gains today as global tech sentiment improved following US markets...",
    url: "#",
    category: "Markets"
  },
  {
    id: 5,
    title: "FIIs Turn Net Buyers After Six Months of Outflows",
    source: "Financial Express",
    date: "2023-03-25",
    snippet: "Foreign Institutional Investors have turned net buyers in Indian equities after consecutive outflows...",
    url: "#",
    category: "Investments"
  }
];

export default function MarketPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Query market sentiment
  const { data: marketSentiment, isLoading: isLoadingSentiment } = useQuery<MarketSentiment>({
    queryKey: ['/api/market/sentiment'],
    queryFn: async () => {
      const res = await fetch('/api/market/sentiment');
      if (!res.ok) {
        throw new Error("Failed to fetch market sentiment");
      }
      return await res.json();
    },
  });

  const handleLogout = async () => {
    try {
      const response = await apiRequest("POST", "/api/logout", {});
      
      if (response.ok) {
        toast({
          title: "Logout successful",
          description: "You have been logged out",
        });
        navigate("/auth");
      } else {
        toast({
          title: "Logout failed",
          description: "An error occurred during logout",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Logout error",
        description: "An error occurred during logout",
        variant: "destructive",
      });
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // Helper function to render sentiment icon
  const renderSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "BULLISH":
        return <TrendingUp className="h-6 w-6 text-green-600" />;
      case "BEARISH":
        return <TrendingDown className="h-6 w-6 text-red-600" />;
      default:
        return <Activity className="h-6 w-6 text-yellow-600" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <Sidebar onLogout={handleLogout} />
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top Navigation */}
        <TopNav 
          onMobileMenuToggle={toggleMobileMenu} 
          mobileMenuOpen={mobileMenuOpen}
        />
        
        {/* Mobile Navigation (hidden by default) */}
        <div className={`md:hidden ${mobileMenuOpen ? 'block' : 'hidden'} bg-primary-900 text-white`}>
          <div className="px-2 pt-2 pb-3 space-y-1">
            <a href="/dashboard" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Dashboard</a>
            <a href="/trading-bot" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">AI Trading Bot</a>
            <a href="/analysis" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Analysis</a>
            <a href="/portfolio" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Portfolio</a>
            <a href="/market" className="block px-3 py-2 rounded-md text-base font-medium bg-primary-700 text-white">Market News</a>
            <a href="/settings" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Settings</a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); handleLogout(); }}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white"
            >
              Logout
            </a>
          </div>
        </div>
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-2xl font-semibold text-gray-900">Market Overview & News</h1>
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Market Overview Section */}
              <MarketOverview />
              
              {/* Market Sentiment Section */}
              {marketSentiment && (
                <Card className="mt-6">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Market Sentiment Analysis</CardTitle>
                      <Badge 
                        variant={
                          marketSentiment.sentiment === "BULLISH" 
                            ? "default" 
                            : marketSentiment.sentiment === "BEARISH" 
                              ? "destructive" 
                              : "outline"
                        }
                        className={`text-sm ${marketSentiment.sentiment === "BULLISH" ? "bg-green-500 hover:bg-green-600" : ""}`}
                      >
                        {marketSentiment.sentiment}
                      </Badge>
                    </div>
                    <CardDescription>
                      Last updated: {new Date(marketSentiment.lastUpdated).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center space-x-4">
                        {renderSentimentIcon(marketSentiment.sentiment)}
                        <div>
                          <div className="text-sm text-gray-500">Sentiment Score</div>
                          <div className="text-xl font-medium">{marketSentiment.sentimentScore.toFixed(2)}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <AlertTriangle className={`h-6 w-6 ${
                          marketSentiment.volatilityLevel === "HIGH" 
                            ? "text-red-600" 
                            : marketSentiment.volatilityLevel === "MEDIUM" 
                              ? "text-yellow-600" 
                              : "text-green-600"
                        }`} />
                        <div>
                          <div className="text-sm text-gray-500">Volatility Index</div>
                          <div className="text-xl font-medium">{marketSentiment.volatilityIndex.toFixed(2)}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <BarChart className={`h-6 w-6 ${
                          marketSentiment.sectorStrengthLevel === "STRONG" 
                            ? "text-green-600" 
                            : marketSentiment.sectorStrengthLevel === "NEUTRAL" 
                              ? "text-yellow-600" 
                              : "text-red-600"
                        }`} />
                        <div>
                          <div className="text-sm text-gray-500">Sector Strength</div>
                          <div className="text-xl font-medium">{marketSentiment.sectorStrength.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div>
                      <h3 className="font-medium mb-2">AI Market Insights</h3>
                      <p className="text-gray-700">{marketSentiment.aiInsights}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Market News Section */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Newspaper className="mr-2 h-5 w-5" />
                    Latest Market News
                  </CardTitle>
                  <CardDescription>
                    Top financial news from trusted sources
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {marketNews.map((news) => (
                      <div key={news.id} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-gray-900">{news.title}</h3>
                            <p className="text-sm text-gray-500 mt-1">
                              {news.source} • {news.date}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">{news.category}</Badge>
                        </div>
                        <p className="text-gray-700 mt-2 text-sm">{news.snippet}</p>
                        <a href={news.url} className="text-primary-600 hover:text-primary-800 text-sm mt-2 inline-block">
                          Read full article →
                        </a>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}