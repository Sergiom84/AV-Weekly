import type { ReactElement } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { DECK_MODULES } from "@shared/deck/registry";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Aga from "./pages/Aga";
import Home from "./pages/Home";
import Informatica from "./pages/Informatica";
import Informe from "./pages/Informe";
import ModuloPendiente from "./pages/ModuloPendiente";

/** Deck screen of each module. A module with no entry is still a placeholder. */
const MODULE_PAGES: Record<string, () => ReactElement> = {
  av: Informe,
  informatica: Informatica,
  aga: Aga,
};

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />

      {DECK_MODULES.map((module) => {
        const Page = MODULE_PAGES[module.id];

        if (Page) {
          return <Route key={module.id} path={module.route} component={Page} />;
        }

        return (
          <Route key={module.id} path={module.route}>
            <ModuloPendiente name={module.name} meta={module.meta} />
          </Route>
        );
      })}

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
