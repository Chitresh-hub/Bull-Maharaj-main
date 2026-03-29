import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import TopNav from "@/components/layout/top-nav";
import StockAnalysis from "@/components/stock-analysis";

export default function AnalysisPage() {
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
            <a href="/analysis" className="block px-3 py-2 rounded-md text-base font-medium bg-primary-700 text-white">Analysis</a>
            <a href="/portfolio" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Portfolio</a>
            <a href="/market" className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-primary-800 hover:text-white">Market News</a>
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
              <h1 className="text-2xl font-semibold text-gray-900">Stock Analysis</h1>
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Stock Analysis Section */}
              <StockAnalysis />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}