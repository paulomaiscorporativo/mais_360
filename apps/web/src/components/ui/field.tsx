import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const controlBase = [
  "w-full rounded-sm border border-border-strong bg-surface text-fg shadow-sm",
  "placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150",
  "hover:border-fg-faint/70",
  "focus-visible:outline-none focus-visible:border-brand-ring focus-visible:ring-3 focus-visible:ring-brand-ring/20",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20",
].join(" ");

export const controlClass = controlBase;

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, ...props },
  ref,
) {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(controlBase, "h-9 px-3", className)} {...props} />;
  }
  return (
    <div className="relative flex items-center">
      {leading && (
        <span className="pointer-events-none absolute left-3 flex text-fg-subtle [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input
        ref={ref}
        className={cn(controlBase, "h-9 px-3", leading && "pl-9", trailing && "pr-9", className)}
        {...props}
      />
      {trailing && <span className="absolute right-2 flex text-fg-subtle">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "min-h-24 resize-y px-3 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Recebe o id gerado para ligar label, dica e erro ao controle. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
};

/** Rótulo + controle + dica/erro, com acessibilidade ligada automaticamente. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional && <span className="text-xs text-fg-faint">Opcional</span>}
      </div>
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
