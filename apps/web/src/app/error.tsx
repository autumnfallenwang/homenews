"use client";

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary convention
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-center">
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-6">
        {error.message || "Failed to load the dashboard."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="text-sm underline text-muted-foreground hover:text-foreground"
      >
        Try again
      </button>
    </main>
  );
}
