import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Informe from "./pages/Informe";
import ModuloPendiente from "./pages/ModuloPendiente";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/av"} component={Informe} />
      <Route path={"/oficinas"}>
        <ModuloPendiente name="Oficinas" meta="Módulo 01" />
      </Route>
      <Route path={"/informatica"}>
        <ModuloPendiente name="Informática" meta="Módulo 02" />
      </Route>
      <Route path={"/compras"}>
        <ModuloPendiente name="Compras" meta="Módulo 03" />
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
