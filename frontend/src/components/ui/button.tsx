import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "publish" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-sm hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-text shadow-sm hover:border-border-strong hover:bg-zebra",
  tertiary: "text-text underline decoration-border-strong underline-offset-4 hover:decoration-text",
  // Ink marks the lecturer's decision (publish, confirm override): the product's one accent.
  publish: "bg-ink text-white shadow-sm hover:bg-ink-hover",
  danger: "border border-border bg-surface text-danger shadow-sm hover:border-danger hover:bg-danger-soft",
};

const DISABLED =
  "disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-text-muted disabled:shadow-none disabled:no-underline";

export function buttonClass(variant: ButtonVariant = "secondary", compact = false, extra = "") {
  const size = compact ? "min-h-11 md:min-h-8 px-3 text-small" : "min-h-11 md:min-h-10 px-4";
  const pad = variant === "tertiary" ? "px-2" : "";
  return [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-[120ms] ease-out text-center",
    size,
    pad,
    VARIANTS[variant],
    DISABLED,
    extra,
  ].join(" ");
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  compact?: boolean;
  icon?: LucideIcon;
  loading?: boolean;
  loadingText?: string;
}

export function Button({
  variant = "secondary",
  compact,
  icon,
  loading,
  loadingText,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={buttonClass(variant, compact, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon icon={LoaderCircle} className="animate-spin" />
      ) : (
        icon && <Icon icon={icon} />
      )}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  compact,
  icon,
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  compact?: boolean;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, compact, className)}>
      {icon && <Icon icon={icon} />}
      {children}
    </Link>
  );
}
