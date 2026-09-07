-- ════════════════════════════════════════════════════════════════
--  012 ROLLBACK — a régi írási utak visszanyitása
--
--  ⚠ MIKOR KELL EZ ⚠
--  Akkor, és CSAK akkor, ha a rpw-config.js-ben visszaállítod
--  valamelyiket:
--
--    AUTH_REQUIRED = false   (a mentés visszaesik a rpw_patch / v2-re)
--    CLIENT_RPC    = false   (az ügyfél-feltöltés visszaesik a v2-re)
--
--  Ilyenkor ezt EGYIDEJŰLEG futtasd a config visszaállításával,
--  különben a mentés némán elhal.
--
--  FIGYELEM: ezzel újra nyitva lesz a bérlő-ellenőrzés nélküli írás.
--  Csak addig hagyd így, amíg a visszaállás tart.
-- ════════════════════════════════════════════════════════════════
begin;
-- Az anon-nak adjuk vissza, nem a PUBLIC-nak: a kliens az anon kulccsal
-- dolgozik, es a PUBLIC-ot mar nem kell ujra kinyitni.
grant execute on function public.rpw_patch(text, jsonb)                          to anon, authenticated;
grant execute on function public.rpw_patch_v2(text, jsonb, integer, text, text)  to anon, authenticated;
commit;

-- ELLENŐRZÉS: visszakaptak-e a jogot?
select has_function_privilege('anon','public.rpw_patch(text,jsonb)','EXECUTE')                        as rpw_patch,
       has_function_privilege('anon','public.rpw_patch_v2(text,jsonb,integer,text,text)','EXECUTE')    as rpw_patch_v2;
