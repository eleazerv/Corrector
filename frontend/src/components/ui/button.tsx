import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "publish" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-primary bg-surface text-primary hover:bg-primary-soft",
  tertiary: "text-primary underline-offset-4 hover:underline",
  publish: "bg-accent text-white hover:bg-accent-hover",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-soft",
};

const DISABLED =
  "disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-text-muted disabled:no-underline";

export function buttonClass(variant: ButtonVariant = "secondary", compact = false, extra = "") {
  const size = compact ? "min-h-11 md:min-h-9 px-3" : "min-h-11 px-5";
  const pad = variant === "tertiary" ? "px-2" : "";
  return [
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-[120ms] ease-out text-center",
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
