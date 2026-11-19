import { cn } from "@/lib/cn";

export function Spinner({
  className,
  label = "Carregando",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4 animate-spin", className)}
      role="status"
      aria-label={label}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".22"
        strokeWidth="1.75"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
