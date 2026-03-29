import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import Login from "./login";
import Register from "./register";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Get the demo login mutation from auth context
  const { demoLoginMutation } = useAuth();

  // Handle demo login
  const handleDemoLogin = () => {
    demoLoginMutation.mutate();
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Column - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-primary-900 to-primary-700">
        <div className="w-full max-w-md">
          <div className="mb-4 text-center">
            <div className="inline-flex items-center justify-center">
              <div className="bg-white text-primary-800 font-bold text-3xl px-4 py-2 rounded-lg shadow-lg">BM</div>
              <h1 className="ml-3 text-3xl font-bold text-white">Bull Maharaj</h1>
            </div>
          </div>
          
          <div className="mb-8">
            {/* Quick Action Button for Demo Login */}
            <div className="mb-6">
              <Button 
                className="w-full bg-white text-primary-700 hover:bg-white/90 font-bold py-3 shadow-md"
                disabled={demoLoginMutation.isPending}
                onClick={handleDemoLogin}
              >
                {demoLoginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                    Logging in...
                  </>
                ) : (
                  <>Try Instant Demo Account</>
                )}
              </Button>
              <p className="text-white text-sm text-center mt-2 opacity-90">
                One click login with our demo account to explore all features
              </p>
            </div>
            
            <div className="flex justify-center space-x-4 mb-6">
              <Button
                variant={activeTab === "login" ? "default" : "outline"}
                onClick={() => setActiveTab("login")}
                className={`w-1/2 ${activeTab === "login" ? "bg-white text-primary-600 hover:bg-gray-100" : "bg-transparent text-white border-white hover:bg-white/10"}`}
              >
                Login
              </Button>
              <Button
                variant={activeTab === "register" ? "default" : "outline"}
                onClick={() => setActiveTab("register")}
                className={`w-1/2 ${activeTab === "register" ? "bg-white text-primary-600 hover:bg-gray-100" : "bg-transparent text-white border-white hover:bg-white/10"}`}
              >
                Register
              </Button>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-primary-800 mb-2">
                  {activeTab === "login" ? "Welcome Back" : "Create Account"}
                </h1>
                <p className="text-gray-600 text-sm">
                  {activeTab === "login" 
                    ? "Access your Bull Maharaj dashboard" 
                    : "Join Bull Maharaj Trading Platform"}
                </p>
              </div>
              
              {activeTab === "login" ? (
                <>
                  <Login />
                  <div className="mt-4 bg-orange-50 border border-orange-200 p-3 rounded-lg">
                    <p className="text-sm text-orange-800 font-medium">Demo Credentials</p>
                    <div className="grid grid-cols-2 gap-1 mt-1 text-sm text-orange-700">
                      <div>Email:</div>
                      <div className="font-mono">demo@bullmaharaj.com</div>
                      <div>Password:</div>
                      <div className="font-mono">demo123</div>
                    </div>
                  </div>
                </>
              ) : (
                <Register />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Hero Section */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary-800 to-primary-950 text-white p-8 items-center justify-center">
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold mb-4">ANN-Powered Stock Trading Platform</h2>
          <p className="text-lg mb-8">
            Leverage the power of AI to make smarter trading decisions in the Indian stock market.
            Our platform uses an Artificial Neural Network (ANN) to predict stock trends and maximize your returns.
          </p>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center mr-3 mt-0.5">
                <span className="text-sm">✓</span>
              </div>
              <p>Real-time Indian stock market data and analytics</p>
            </div>
            <div className="flex items-start">
              <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center mr-3 mt-0.5">
                <span className="text-sm">✓</span>
              </div>
              <p>AI-powered trading signals with multiple strategies</p>
            </div>
            <div className="flex items-start">
              <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center mr-3 mt-0.5">
                <span className="text-sm">✓</span>
              </div>
              <p>Automated trading bot with ANN (7→12→6→3 feedforward network)</p>
            </div>
            <div className="flex items-start">
              <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center mr-3 mt-0.5">
                <span className="text-sm">✓</span>
              </div>
              <p>Track your portfolio performance and history</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}