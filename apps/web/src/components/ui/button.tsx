import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ring",
    "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-fg shadow-sm hover:bg-brand-hover active:bg-brand-active",
        secondary:
          "border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-muted hover:border-fg-faint/60",
        ghost: "text-fg-muted hover:bg-hover hover:text-fg active:bg-pressed",
        subtle: "bg-brand-subtle text-brand-subtle-fg hover:brightness-[0.97]",
        danger: "bg-danger text-white shadow-sm hover:brightness-110 dark:text-ink-950",
        "danger-ghost": "text-danger hover:bg-danger-bg",
        link: "h-auto px-0 text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-sm px-2.5 text-sm [&_svg]:size-3.5",
        md: "h-9 rounded-sm px-3.5 text-base [&_svg]:size-4",
        lg: "h-12 rounded-md px-5 text-md [&_svg]:size-[18px]",
        icon: "size-9 rounded-sm [&_svg]:size-[18px]",
        "icon-sm": "size-8 rounded-sm [&_svg]:size-4",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
          <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
            {children}
          </span>
        </>
      )}
    </Comp>
  );
});

export { buttonVariants };
