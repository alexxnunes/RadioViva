#!/usr/bin/env python3
"""
Testa a conectividade dos streams das principais rádios do catálogo RadioViva.
"""

import json
import os
import urllib.request
import urllib.error

def test_stream_url(name, url, timeout=6):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            code = resp.getcode()
            content_type = resp.headers.get("Content-Type", "")
            return True, f"HTTP {code} ({content_type})"
    except urllib.error.HTTPError as e:
        return False, f"HTTPError {e.code}"
    except Exception as e:
        return False, str(e)

def main():
    catalog_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "stations_brasil.json")
    with open(catalog_path, "r", encoding="utf-8") as f:
        stations = json.load(f)

    curated = [s for s in stations if s.get("is_curated") or s.get("is_favorite")][:10]
    print(f"=== Testando {len(curated)} streams principais do RadioViva ===")

    success_count = 0
    for s in curated:
        name = s["name"]
        url = s["url"]
        ok, detail = test_stream_url(name, url)
        status_sym = "✓" if ok else "✗"
        print(f"[{status_sym}] {name:<35} -> {detail}")
        if ok:
            success_count += 1

    print(f"\nResultado: {success_count}/{len(curated)} streams conectados com sucesso.")
    assert success_count >= len(curated) * 0.7, "Pelo menos 70% dos streams curados devem responder."

if __name__ == "__main__":
    main()
