import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { DeckModuleId } from "@shared/deck/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DepartmentAccessGateProps {
  department: DeckModuleId;
  name: string;
  children: ReactNode;
}

export default function DepartmentAccessGate({
  department,
  name,
  children,
}: DepartmentAccessGateProps) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/access/${department}/status`)
      .then(async response => {
        if (!response.ok) throw new Error("No se pudo comprobar el acceso.");
        return response.json() as Promise<{ authorized?: boolean }>;
      })
      .then(result => {
        if (active) setAuthorized(result.authorized === true);
      })
      .catch(reason => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Error de acceso."
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [department]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{3}$/.test(pin)) {
      setError("Introduce una clave numérica de tres dígitos.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/access/${department}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json()) as {
        error?: string;
        authorized?: boolean;
      };
      if (!response.ok || body.authorized !== true) {
        throw new Error(body.error ?? "No se pudo validar la clave.");
      }
      setAuthorized(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo validar la clave."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center font-mono">
        Comprobando acceso
      </main>
    );
  }

  if (authorized) return children;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div>
          <h1 className="font-serif text-3xl text-foreground">{name}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Acceso al departamento
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`pin-${department}`}>Clave</Label>
          <Input
            id={`pin-${department}`}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{3}"
            maxLength={3}
            value={pin}
            onChange={event =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            autoFocus
          />
        </div>
        {error && (
          <p className="font-mono text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Comprobando" : "Acceder"}
        </Button>
      </form>
    </main>
  );
}
