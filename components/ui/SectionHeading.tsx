import React from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  tag?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({
  tag,
  title,
  description,
  action,
  align = "left",
  className,
}: SectionHeadingProps) {
  const isCenter = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 sm:mb-16",
        isCenter && "text-center md:items-center justify-center",
        className
      )}
    >
      <div className={cn("max-w-2xl", isCenter && "mx-auto")}>
        {tag && (
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400/90 uppercase">
              {tag}
            </span>
          </div>
        )}
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-3 text-sm sm:text-base text-zinc-400 font-normal leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
