#!/usr/bin/env python3
"""
Script de compilação e enriquecimento do catálogo RadioViva.
Baixa o catálogo de rádios do Brasil (1.600+ emissoras) do Radio-Browser,
mescla com a lista curada e com as rádios favoritas do usuário,
normaliza estados (UF), cidades, gêneros e salva em src/data/stations_brasil.json.
"""

import json
import os
import re
import urllib.request
import urllib.error

UF_MAP = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas",
    "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo",
    "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"
}

REGION_MAP = {
    "Sudeste": ["SP", "RJ", "MG", "ES"],
    "Sul": ["RS", "PR", "SC"],
    "Nordeste": ["BA", "PE", "CE", "RN", "PB", "AL", "SE", "MA", "PI"],
    "Centro-Oeste": ["DF", "GO", "MT", "MS"],
    "Norte": ["AM", "PA", "RO", "TO", "AC", "AP", "RR"]
}

# Rádios Curadas e Favoritos de Fábrica
CURATED_STATIONS = [
    {
        "id": "fav-jp-campinas",
        "name": "Jovem Pan FM Campinas - 89.9",
        "url": "https://paineldj5.com.br:20028/stream",
        "state": "SP",
        "city": "Campinas",
        "genre": "Pop / Jovem",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "fav-difusora-piracicaba",
        "name": "Difusora FM 102.3 Piracicaba",
        "url": "https://stream.zeno.fm/deqad1zbtv8uv",
        "state": "SP",
        "city": "Piracicaba",
        "genre": "Popular / Sertanejo",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "fav-98-rock-brasil",
        "name": "98 ROCK BRASIL",
        "url": "https://stm41.stmsrv.com:16614/stream?type=http&nocache=1897905694",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Rock",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-89-rock",
        "name": "89 FM A Rádio Rock",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_89FM_ADP.aac?dist=site-89fm",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Rock",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-alpha-fm",
        "name": "Alpha FM 101.7",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ALPHAFM_ADP.aac",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Adulto Contemporâneo",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-antena-1",
        "name": "Antena 1 FM 94.7",
        "url": "https://antenaone.crossradio.com.br/stream/1",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Adulto Contemporâneo",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-kiss-fm",
        "name": "Kiss FM 92.5",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_KISSFM_ADP.aac",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Rock Clássico",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-cbn-sp",
        "name": "CBN São Paulo - 90.5 FM",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/CBN_SPAAC.aac",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Notícias",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-bandnews-sp",
        "name": "BandNews FM São Paulo - 96.9",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/BANDNEWSFM_SPAAC_SC",
        "state": "SP",
        "city": "São Paulo",
        "genre": "Notícias",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-itatiaia-mg",
        "name": "Rádio Itatiaia - 95.7 FM",
        "url": "https://8903.brasilstream.com.br/stream",
        "state": "MG",
        "city": "Belo Horizonte",
        "genre": "Notícias / Esportes",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-gaucha-rs",
        "name": "Rádio Gaúcha - 93.7 FM",
        "url": "https://1132747t.ha.azioncdn.net/primary/gaucha_rbs.sdp/playlist.m3u8",
        "state": "RS",
        "city": "Porto Alegre",
        "genre": "Notícias / Futebol",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-jb-fm-rj",
        "name": "JB FM 99.9",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/JBFMAAC1.aac",
        "state": "RJ",
        "city": "Rio de Janeiro",
        "genre": "Adulto Contemporâneo",
        "is_favorite": True,
        "is_curated": True
    },
    {
        "id": "cur-alvorada-mg",
        "name": "Alvorada FM 94.9",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/ALVORADAAAC.aac",
        "state": "MG",
        "city": "Belo Horizonte",
        "genre": "MPB / Adulto",
        "is_favorite": False,
        "is_curated": True
    },
    {
        "id": "cur-metropole-ba",
        "name": "Rádio Metrópole 101.3 FM",
        "url": "https://stm1.painelvox.com:7100/stream",
        "state": "BA",
        "city": "Salvador",
        "genre": "Notícias",
        "is_favorite": False,
        "is_curated": True
    },
    {
        "id": "cur-jornal-pe",
        "name": "Rádio Jornal Recife 90.3 FM",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_JORNAL_RECAAC.aac",
        "state": "PE",
        "city": "Recife",
        "genre": "Notícias / Futebol",
        "is_favorite": False,
        "is_curated": True
    },
    {
        "id": "cur-mundo-livre-pr",
        "name": "Mundo Livre FM 93.9",
        "url": "https://ice.fabricahost.com.br/mundolivrefmctba",
        "state": "PR",
        "city": "Curitiba",
        "genre": "Rock / Alternativo",
        "is_favorite": False,
        "is_curated": True
    },
    {
        "id": "cur-atlantida-sc",
        "name": "Rádio Atlântida Floripa 100.9 FM",
        "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/ATLANTIDA_FLPAAC.aac",
        "state": "SC",
        "city": "Florianópolis",
        "genre": "Pop / Rock",
        "is_favorite": False,
        "is_curated": True
    },
    {
        "id": "cur-senado-df",
        "name": "Rádio Senado 91.7 FM",
        "url": "https://radiosenado.live-s.cdn.bitgravity.com/cdn-live-b5/_definst_/radiosenado/live/playlist.m3u8",
        "state": "DF",
        "city": "Brasília",
        "genre": "Cultura / Jornalismo",
        "is_favorite": False,
        "is_curated": True
    }
]

def normalize_state(raw_state, name=""):
    raw = (raw_state or "").strip().lower()
    full_text = f"{raw} {name.lower()}"

    # Verificação por UF direta
    for uf, nome in UF_MAP.items():
        if re.search(rf"\b{uf.lower()}\b", raw):
            return uf
        if nome.lower() in raw:
            return uf

    # Verificação por cidades conhecidas no nome ou no estado bruto
    city_uf_hints = {
        "campinas": "SP", "piracicaba": "SP", "ribeirão preto": "SP", "santos": "SP",
        "são paulo": "SP", "sorocaba": "SP", "sao paulo": "SP", "rio de janeiro": "RJ",
        "niterói": "RJ", "belo horizonte": "MG", "porto alegre": "RS", "curitiba": "PR",
        "florianópolis": "SC", "salvador": "BA", "recife": "PE", "fortaleza": "CE",
        "brasília": "DF", "brasilia": "DF", "goiânia": "GO", "goiania": "GO",
        "cuiabá": "MT", "campo grande": "MS", "manaus": "AM", "belém": "PA", "belem": "PA",
        "vitória": "ES", "vitoria": "ES", "maceió": "AL", "natal": "RN", "joão pessoa": "PB",
        "aracaju": "SE", "teresina": "PI", "são luís": "MA", "porto velho": "RO",
        "boa vista": "RR", "rio branco": "AC", "macapá": "AP", "palmas": "TO"
    }

    for city, uf in city_uf_hints.items():
        if city in full_text:
            return uf

    return "BR"  # Nacional / Indefinido

def detect_genre(tags_str, name=""):
    full = f"{tags_str} {name}".lower()
    if any(k in full for k in ["rock", "metal", "punk"]):
        return "Rock"
    if any(k in full for k in ["noticia", "notícia", "news", "jornal", "esporte", "sport", "futebol"]):
        return "Notícias"
    if any(k in full for k in ["sertanejo", "modao", "modão", "raiz"]):
        return "Sertanejo"
    if any(k in full for k in ["mpb", "bossa", "samba", "pagode"]):
        return "MPB / Samba"
    if any(k in full for k in ["gospel", "evangel", "crista", "louvor", "catolica", "católica", "fe"]):
        return "Gospel"
    if any(k in full for k in ["flashback", "anos 80", "anos 70", "anos 90", "retro", "oldies"]):
        return "Flashback"
    if any(k in full for k in ["jazz", "blues", "instrumental", "classica", "clássica"]):
        return "Jazz / Instrumental"
    if any(k in full for k in ["pop", "hits", "jovem", "dance", "electronic", "top"]):
        return "Pop / Hits"
    return "Variados"

def fetch_radio_browser():
    url = "https://de1.api.radio-browser.info/json/stations/search?countrycode=BR&hidebroken=true&limit=10000"
    print(f"[*] Conectando à API do Radio-Browser ({url})...")
    req = urllib.request.Request(url, headers={"User-Agent": "RadioViva/1.0 (Linux Mint Cinnamon Applet)"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[+] Baixadas {len(data)} estações do Brasil via API.")
            return data
    except Exception as e:
        print(f"[!] Falha ao consultar Radio-Browser API: {e}")
        return []

def main():
    api_stations = fetch_radio_browser()
    
    seen_urls = set()
    catalog = []

    # 1. Adicionar estações curadas primeiro
    for s in CURATED_STATIONS:
        url = s["url"].strip()
        seen_urls.add(url)
        catalog.append(s)

    # 2. Processar e adicionar as 1.600+ rádios do Radio-Browser
    for item in api_stations:
        raw_url = item.get("url_resolved") or item.get("url") or ""
        raw_url = raw_url.strip()
        if not raw_url or raw_url in seen_urls:
            continue

        name = item.get("name", "").strip()
        if not name or len(name) < 2:
            continue

        uf = normalize_state(item.get("state"), name)
        tags = item.get("tags") or ""
        genre = detect_genre(tags, name)

        seen_urls.add(raw_url)
        catalog.append({
            "id": item.get("stationuuid") or f"rb-{len(catalog)+1}",
            "name": name,
            "url": raw_url,
            "state": uf,
            "city": item.get("state") if uf != "BR" and item.get("state") != uf else "",
            "genre": genre,
            "favicon": item.get("favicon") or "",
            "bitrate": item.get("bitrate") or 0,
            "codec": item.get("codec") or "",
            "votes": item.get("votes") or 0,
            "is_favorite": False,
            "is_curated": False
        })

    print(f"[+] Total de rádios catalogadas no RadioViva: {len(catalog)}")

    # Contagem por Estado
    by_uf = {}
    for st in catalog:
        uf = st["state"]
        by_uf[uf] = by_uf.get(uf, 0) + 1

    top_ufs = sorted(by_uf.items(), key=lambda x: x[1], reverse=True)
    print(f"[+] Distribuição por estado: {top_ufs[:10]}")

    # Salvar em src/data/stations_brasil.json
    output_dir = os.path.join(os.path.dirname(__file__), "..", "src", "data")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "stations_brasil.json")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print(f"[✓] Arquivo salvo com sucesso: {output_file} ({os.path.getsize(output_file) / 1024:.1f} KB)")

if __name__ == "__main__":
    main()
