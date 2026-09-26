import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panels";
import { Container } from "@/components/ui/page";

export function MissingState({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return (
    <Container>
      <EmptyState icon={SearchX} title={`${what} tidak ditemukan.`} action={<ButtonLink href={back}>{backLabel}</ButtonLink>}>
        Tautan mungkin sudah tidak berlaku, atau data ini dibuat di sesi lain. Data contoh kembali ke awal setiap halaman
        dimuat ulang.
      </EmptyState>
    </Container>
  );
}
