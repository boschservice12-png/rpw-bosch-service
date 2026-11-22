# GENERÁLT: deploy/configure.sh — kézzel ne szerkeszd (a következő futás felülírja). Forrás: deploy/templates/Caddyfile.tpl
# Egy domain, egy alkalmazás: minden kérés a Symfonyhoz megy (az a meglévő felületet is kiszolgálja),
# a rögzített könyvtárak (public/vendor) közvetlenül. HTTPS: a Caddy magától kéri és újítja (Let's Encrypt).
{
	__GLOBAL_EMAIL__
}

(rpw_app) {
	root * __RPW_HOME__/current/symfony/public
	encode zstd gzip
	# MÉRET-LÁNC (2026-11-22, tests/Unit/LimitsChainTest.php őrzi):
	#   fotó/irat feltöltése a helyi tárba: az alkalmazás max. 25 MB-ot fogad → itt 26 MB
	#   minden más (OCR, levél: max. 12 MB; mentés: max. 2 MB) → itt 13 MB
	@upload path /storage/v1/object/upload/*
	@notupload not path /storage/v1/object/upload/*
	request_body @upload {
		max_size 26MB
	}
	request_body @notupload {
		max_size 13MB
	}
	# rejtett és belső fájlok soha (.env, .git, …)
	@hidden path */.*
	respond @hidden 404
	@static file
	handle @static {
		file_server
	}
	handle {
		php_fastcgi unix//run/php/rpw.sock {
			try_files index.php
		}
	}
}

__DOMAIN__ {
	import rpw_app
	# a biztonsági fejléceket (CSP, X-Frame-Options, …) a Symfony adja; itt az, ami minden válaszra kell
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		-Server
		-X-Powered-By
	}
	log {
		output file /var/log/caddy/rpw-access.log {
			roll_size 50MiB
			roll_keep 10
		}
		format json
	}
}

# Belső egészség-cím: csak a gépen belülről érhető el (127.0.0.1), a tűzfal sem engedi kívülről.
# A telepítő ezen méri az új kiadást — DNS és tanúsítvány nélkül is.
http://127.0.0.1:8081 {
	bind 127.0.0.1
	import rpw_app
}
