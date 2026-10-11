import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
 * primary   ink: the one main action on a screen
 * secondary outlined: everything else
 * quiet     text-only, for low-stakes actions inside dense rows
 */
export type ButtonVariant = "primary" | "secondary" | "quiet";

export function buttonClass(variant: ButtonVariant = "secondary", compact = false, extra = "") {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none " +
    "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";
  const size = compact ? "min-h-11 px-3 text-sm md:min-h-8" : "min-h-11 px-4 md:min-h-10";
  const look: Record<ButtonVariant, string> = {
    primary: "bg-ink text-surface hover:bg-ink/85",
    secondary: "border border-rule-strong bg-surface text-ink hover:bg-sunken",
    quiet: "text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink",
  };
  return `${base} ${variant === "quiet" ? "min-h-11 px-1 md:min-h-8" : size} ${look[variant]} ${extra}`;
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  compact?: boolean;
  busy?: boolean;
}

export function Button({ variant = "secondary", compact, busy, className, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClass(variant, compact, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  compact,
  className,
  children,
  ...rest
}: { href: string; variant?: ButtonVariant; compact?: boolean; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={buttonClass(variant, compact, className)} {...rest}>
      {children}
    </Link>
  );
}
