import { Lightbulb, LightbulbOff } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface MainNavProps {
  rightSlot?: React.ReactNode;
}

export default function MainNav({ rightSlot }: MainNavProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50 print:hidden">
      <div className="container py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">AV Weekly</h1>
          <div className="flex items-center gap-4 print:hidden">
            {rightSlot}
            {toggleTheme && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              >
                {theme === 'dark' ? <Lightbulb size={18} /> : <LightbulbOff size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
