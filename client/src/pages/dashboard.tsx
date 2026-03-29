import { useState } from "react";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import TopNav from "@/components/layout/top-nav";
import MarketOverview from "@/components/market-overview";
import TradingBot from "@/components/trading-bot";
import StockAnalysis from "@/components/stock-analysis";
import PortfolioOverview from "@/components/portfolio-overview";

export default function Dashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#070b14]">
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
            <Link href="/dashboard">
              <div className="block px-3 py-2 rounded-md text-base font-medium bg-primary-700 text-white">Dashboard</div>
            </Link>
            <Link href="/trading-bot">
              <div className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">AI Trading Bot</div>
            </Link>
            <Link href="/analysis">
              <div className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Analysis</div>
            </Link>
            <Link href="/portfolio">
              <div className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Portfolio</div>
            </Link>
            <Link href="/market">
              <div className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Market News</div>
            </Link>
            <div className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Settings</div>
            <div 
              onClick={handleLogout}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white cursor-pointer"
            >
              Logout
            </div>
          </div>
        </div>
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-[#070b14]">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-2xl font-semibold text-[#e2eaf6]">Bull Maharaj Dashboard</h1>
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Market Overview Section */}
              <MarketOverview />
              
              {/* AI Trading Bot Section */}
              <TradingBot />
              
              {/* Stock Analysis & Predictions */}
              <StockAnalysis />
              
              {/* Portfolio Overview */}
              <PortfolioOverview />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}