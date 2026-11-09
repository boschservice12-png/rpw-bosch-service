-- 015 ROLLBACK — SZÁNDÉKOSAN NINCS.
-- A "allow_all" szabály mindenkinek (anon is) teljes hozzáférést adott a 'foto'
-- tárolóhoz. Visszaállítása újranyitná a rést. Ha a régi fotókra mégis szükség
-- van, a Supabase felületéről, service-kulccsal érhetők el.
do $$
begin
  raise exception '015: a nyitott allow_all szabály szándékosan nem állítható vissza (2026-11-08).';
end $$;
