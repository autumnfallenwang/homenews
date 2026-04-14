"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNavigation } from "./dashboard-shell";

const PAGE_SIZE = 50;

export function Pager({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { navigate } = useNavigation();

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams(searchParams);
    if (offset === 0) params.delete("offset");
    else params.set("offset", String(offset));
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname);
  };

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="flex items-baseline justify-between border-t border-border px-1 py-6">
      <PagerButton label="‹ Prev" disabled={!canPrev} onClick={() => goToPage(currentPage - 1)} />
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Page{" "}
        <span className="mx-1 font-display text-[20px] italic normal-case text-primary">
          {currentPage}
        </span>{" "}
        of {totalPages}
      </div>
      <PagerButton label="Next ›" disabled={!canNext} onClick={() => goToPage(currentPage + 1)} />
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
        disabled
          ? "cursor-default text-muted-foreground/30"
          : "text-muted-foreground hover:border-border/80 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
