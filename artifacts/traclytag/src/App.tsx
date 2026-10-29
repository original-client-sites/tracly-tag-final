import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Loader2, Lock } from "lucide-react";
import { useEffect } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import { useDevToolsProtection } from "./hooks/useDevToolsProtection";

import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import PublicVerify from "@/pages/public-verify";
import Activate from "@/pages/activate";
import { BrandedPortal } from "@/components/BrandedPortal";
import Dashboard from "@/pages/dashboard";
import Companies from "@/pages/companies";
import NewCompany from "@/pages/new-company";
import Users from "@/pages/users";
import NewUser from "@/pages/new-user";
import Products from "@/pages/products";
import NewProduct from "@/pages/new-product";
import Locations from "@/pages/locations";
import NewLocation from "@/pages/new-location";
import Batches from "@/pages/production/batches";
import NewBatch from "@/pages/production/new-batch";
import Codes from "@/pages/production/codes";
import GenerateCodes from "@/pages/production/generate-codes";
import Summary from "@/pages/production/summary";
import StockReport from "@/pages/reports/stock";
import ProductReport from "@/pages/reports/product";
import MarkedByLog from "@/pages/reports/marked-by";
import ReportsPage from "@/pages/reports/index";

import MappingCode from "@/pages/mapping-code";
import CustomerScan from "@/pages/customer-scan";
import Settings from "@/pages/settings";
import Support from "@/pages/support";
import Profile from "@/pages/profile";
import System from "@/pages/system";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function RedirectToDashboard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);
  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { data: user, isLoading, error } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && error && (error as any).status === 401) {
      setLocation("/login");
    }
  }, [isLoading, error, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && (error as any).status !== 401) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shadow-md mb-6 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">Connection Error</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed max-w-md">
          Unable to connect to the backend server. Please check your internet connection or try again later.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!user) return null;

  const isMaster = user.role === "master" || user.role === "super_master";
  const currentPlan = isMaster ? "enterprise" : (user as any).subscriptionPlan || "free";
  const path = window.location.pathname;

  const getRequiredPlan = (path: string) => {
    if (path.startsWith("/production/codes") || path.startsWith("/production/summary") || path.startsWith("/reports")) {
      return "enterprise";
    }
    if (path.startsWith("/production/batches") || path.startsWith("/mapping-code") || path.startsWith("/customer-scan")) {
      return "standard";
    }
    return "free";
  };

  const isPlanSufficient = (required: string, current: string) => {
    if (current === "enterprise") return true;
    if (current === "standard") return required !== "enterprise";
    return required === "free";
  };

  const getRequiredModule = (path: string): string | null => {
    if (path.startsWith("/dashboard")) return "dashboard";
    if (path.startsWith("/companies")) return "companies";
    if (path.startsWith("/users")) return "users";
    if (path.startsWith("/products")) return "products";
    if (path.startsWith("/locations")) return "locations";
    if (path.startsWith("/production/batches")) return "batches";
    if (path.startsWith("/production/codes")) return "generate_codes";
    if (path.startsWith("/mapping-code")) return "mapping_code";
    if (path.startsWith("/customer-scan")) return "customer_scan";
    if (path.startsWith("/production/summary")) return "summary";
    if (path.startsWith("/reports")) return "reports";
    return null;
  };

  const requiredModule = getRequiredModule(path);
  if (requiredModule && !isMaster) {
    const isAdminCompanies = requiredModule === "companies" && user.role === "admin";
    if (!isAdminCompanies) {
      const userModules = (user.enabledModules || "").split(",");
      if (!userModules.includes(requiredModule)) {
        return (
          <AppLayout>
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto font-sans">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shadow-md mb-6">
                <Lock className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">Access Denied</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
                Your account does not have access to the <strong className="capitalize">{requiredModule.replace('_', ' ')}</strong> module. Please contact your administrator to request access.
              </p>
            </div>
          </AppLayout>
        );
      }
    }
  }

  const requiredPlan = getRequiredPlan(path);
  const userModules = (user.enabledModules || "").split(",");
  const isModuleExplicitlyEnabled = requiredModule ? userModules.includes(requiredModule) : false;
  const isAllowed = isPlanSufficient(requiredPlan, currentPlan) || isModuleExplicitlyEnabled;

  if (!isAllowed) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-md mb-6">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">Upgrade Subscription Required</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
            The module at <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400">{path}</code> is restricted to companies on the <strong className="capitalize">{requiredPlan} plan</strong> or higher. You are currently on the <strong className="capitalize">{currentPlan} plan</strong>.
          </p>
          <a
            href="http://localhost:5000/pricing"
            className="inline-flex items-center justify-center bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-lg hover:shadow-teal-500/20 active:scale-[0.98]"
          >
            Upgrade Plan Now
          </a>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

const isCustomDomain = () => {
  const hostname = window.location.hostname;
  return (
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    !hostname.endsWith(".vercel.app") &&
    !hostname.endsWith("tracelytag.com")
  );
};

function Router() {
  const custom = isCustomDomain();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/code/:serial" component={PublicVerify} />
      <Route path="/activate" component={Activate} />
      <Route path="/">
        {custom ? <BrandedPortal /> : <RedirectToDashboard />}
      </Route>
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/companies"><ProtectedRoute component={Companies} /></Route>
      <Route path="/companies/new"><ProtectedRoute component={NewCompany} /></Route>
      <Route path="/companies/:id/edit"><ProtectedRoute component={NewCompany} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/users/new"><ProtectedRoute component={NewUser} /></Route>
      <Route path="/products"><ProtectedRoute component={Products} /></Route>
      <Route path="/products/new"><ProtectedRoute component={NewProduct} /></Route>
      <Route path="/products/:id/edit"><ProtectedRoute component={NewProduct} /></Route>
      <Route path="/locations"><ProtectedRoute component={Locations} /></Route>
      <Route path="/locations/new"><ProtectedRoute component={NewLocation} /></Route>
      <Route path="/locations/:id/edit"><ProtectedRoute component={NewLocation} /></Route>
      <Route path="/production/batches"><ProtectedRoute component={Batches} /></Route>
      <Route path="/production/batches/new"><ProtectedRoute component={NewBatch} /></Route>
      <Route path="/production/batches/:id/edit"><ProtectedRoute component={NewBatch} /></Route>
      <Route path="/production/codes"><ProtectedRoute component={Codes} /></Route>
      <Route path="/production/codes/new"><ProtectedRoute component={GenerateCodes} /></Route>
      <Route path="/mapping-code"><ProtectedRoute component={MappingCode} /></Route>
      <Route path="/customer-scan"><ProtectedRoute component={CustomerScan} /></Route>
      <Route path="/production/summary"><ProtectedRoute component={Summary} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/reports/stock"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/reports/product"><ProtectedRoute component={ProductReport} /></Route>
      <Route path="/reports/marked-by"><ProtectedRoute component={MarkedByLog} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/support"><ProtectedRoute component={Support} /></Route>
      <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
      <Route path="/system"><ProtectedRoute component={System} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useDevToolsProtection();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;