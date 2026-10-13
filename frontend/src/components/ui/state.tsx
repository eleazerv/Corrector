"use client";
// tampilan standar "sedang memuat" dan "gagal memuat" untuk semua halaman.
import { LoaderCircle, RotateCw } from "lucide-react";
import { Button } from "./button";
import { Icon } from "./icon";
import { Banner } from "./panels";

export function Loading({ text = "Memuat…" }: { text?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-10 text-text-muted">
      <Icon icon={LoaderCircle} className="animate-spin" />
      {text}
    </p>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Banner
      tone="danger"
      title={title}
      action={
        onRetry && (
          <Button icon={RotateCw} onClick={onRetry}>
            Coba lagi
          </Button>
        )
      }
    >
      {message}
    </Banner>
  );
}
