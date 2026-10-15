-- trait_conflicts dipakai juga untuk catatan manual yang MIRIP (duplikat) dengan catatan lama.
-- contradict = bertentangan (catatan baru dinonaktifkan sampai dosen memilih)
-- duplicate  = isinya sama (catatan baru tetap aktif; dosen bisa gabung / pakai yang baru / biarkan)
alter table public.trait_conflicts
  add column if not exists kind text not null default 'contradict'
  check (kind in ('contradict', 'duplicate'));
