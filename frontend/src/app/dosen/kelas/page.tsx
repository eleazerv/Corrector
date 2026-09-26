"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/page";
import { ClassTable, CreateClassModal } from "@/components/dosen/class-parts";

export default function KelasPage() {
  const [creating, setCreating] = useState(false);
  return (
    <Container>
      <PageHeader
        crumbs={[{ href: "/dosen", label: "Dashboard" }, { label: "Kelas" }]}
        title="Kelas"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Buat Kelas
          </Button>
        }
      />
      <ClassTable onCreate={() => setCreating(true)} />
      <CreateClassModal open={creating} onClose={() => setCreating(false)} />
    </Container>
  );
}
