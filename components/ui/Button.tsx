import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  href?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      href,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "group inline-flex items-center justify-center font-medium tracking-wide transition-all duration-200 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50 disabled:pointer-events-none";

    const variantStyles = {
      primary:
        "bg-white text-black hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(255,255,255,0.18)] active:scale-[0.98] font-semibold",
      // Secondary upgraded to have solid presence (never empty)
      secondary:
        "bg-[#15151c] text-zinc-100 border border-white/15 hover:border-purple-500/40 hover:bg-[#1d1d26] hover:text-white active:scale-[0.98] shadow-sm",
      outline:
        "bg-transparent text-zinc-200 border border-white/20 hover:border-white/50 hover:bg-white/[0.04] hover:text-white active:scale-[0.98]",
      ghost:
        "bg-transparent text-zinc-400 hover:text-white hover:bg-white/5 active:scale-[0.98]",
    };

    const sizeStyles = {
      sm: "text-xs px-3.5 py-1.5 rounded-full gap-1.5",
      md: "text-xs sm:text-sm px-5 py-2.5 rounded-full gap-2",
      lg: "text-sm sm:text-base px-7 py-3.5 rounded-full gap-2.5",
    };

    const combinedClasses = cn(
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      className
    );

    if (href) {
      return (
        <a href={href} className={combinedClasses}>
          {children}
        </a>
      );
    }

    return (
      <button ref={ref} className={combinedClasses} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
