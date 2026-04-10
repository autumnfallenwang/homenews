import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`h-4 bg-muted animate-pulse rounded ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <SkeletonLine className="w-48 h-7 mb-2" />
        <SkeletonLine className="w-64" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <SkeletonLine className="w-20" />
            </CardHeader>
            <CardContent>
              <SkeletonLine className="w-12 h-7 mb-1" />
              <SkeletonLine className="w-24 h-3" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <SkeletonLine className="w-3/4 h-5" />
              <SkeletonLine className="w-32 h-3 mt-1" />
            </CardHeader>
            <CardContent className="pt-0">
              <SkeletonLine className="w-full mb-2" />
              <SkeletonLine className="w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
