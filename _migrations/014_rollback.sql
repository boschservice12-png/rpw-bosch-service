-- 014_rollback.sql
-- ------------------------------------------------------------------
-- EZ A MIGRACIO NEM VONHATO VISSZA.
--
-- A 014 a 41 RPW-munkat es az 533 audit-sort VEGLEG torolte. Ferenc
-- 2026-09-03-an kifejezetten ugy dontott, hogy archiv masolat NE
-- keszuljon ("ne keszuljon, tunjon el vegleg"), ezert — a 011/013-tol
-- elteroen — nincs rpw_archiv-ba mentett peldany, amibol visszatolteni
-- lehetne.
--
-- Ez a fajl azert letezik, hogy a "minden migraciohoz tartozik rollback"
-- hazirendet ne csendben szegjuk meg, hanem HANGOSAN mondjuk ki: itt
-- nincs visszaut. Ha valaki lefuttatja, hibat kap, nem hamis biztonsagot.
--
-- Az egyetlen elmeleti tartalek a Supabase napi automatikus mentese.
-- Az a torles napjan ~18 orasnal frissebb adatot NEM tartalmaz, tehat az
-- aznapi munkat sem hozza vissza. Visszaallitas csak a Supabase
-- feluleterol, TELJES projekt-visszaallitassal lehetseges — ami minden
-- mast is visszavinne a mentes idopontjara (dolgozok, PIN-ek, posztok).
-- ------------------------------------------------------------------

do $$
begin
  raise exception
    'A 014 nem vonhato vissza: a 41 munka es az 533 audit-sor archiv masolat nelkul lett torolve (tulajdonosi dontes, 2026-09-03). Lasd a fajl fejlecet.';
end $$;
