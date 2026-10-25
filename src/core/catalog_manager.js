/**
 * RadioViva - Catalog Manager
 * Gerencia a base de dados de 1.600+ rádios do Brasil,
 * persistência de favoritos, histórico recente e rádios personalizadas.
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

var REGION_MAP = {
    "Sudeste": {
        name: "Sudeste",
        ufs: ["SP", "RJ", "MG", "ES"]
    },
    "Sul": {
        name: "Sul",
        ufs: ["RS", "PR", "SC"]
    },
    "Nordeste": {
        name: "Nordeste",
        ufs: ["BA", "PE", "CE", "RN", "PB", "AL", "SE", "MA", "PI"]
    },
    "Centro-Oeste": {
        name: "Centro-Oeste",
        ufs: ["DF", "GO", "MT", "MS"]
    },
    "Norte": {
        name: "Norte",
        ufs: ["AM", "PA", "RO", "TO", "AC", "AP", "RR"]
    }
};

var UF_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas",
    "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo",
    "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins", "BR": "Nacional / Rede"
};

var CatalogManager = class CatalogManager {
    constructor(appletDir) {
        this.appletDir = appletDir;
        this.configDir = `${GLib.get_user_config_dir()}/radioviva`;
        this.userDataPath = `${this.configDir}/user_data.json`;

        this.stations = [];
        this.stationMap = new Map();
        this.userData = {
            favorites: [],
            recents: [],
            custom: []
        };

        this._loadCatalog();
        this._loadUserData();
    }

    _loadCatalog() {
        const catalogPath = `${this.appletDir}/data/stations_brasil.json`;
        try {
            const file = Gio.File.new_for_path(catalogPath);
            const [success, contents] = file.load_contents(null);
            if (success) {
                const decoder = new TextDecoder("utf-8");
                this.stations = JSON.parse(decoder.decode(contents));
                this.stations.forEach(s => this.stationMap.set(s.id, s));
            }
        } catch (e) {
            global.logError(`[RadioViva] Erro ao carregar catálogo: ${e.message}`);
            this.stations = [];
        }
    }

    _loadUserData() {
        try {
            const file = Gio.File.new_for_path(this.userDataPath);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder("utf-8");
                    this.userData = JSON.parse(decoder.decode(contents));
                    this.userData.favorites = this.userData.favorites || [];
                    this.userData.recents = this.userData.recents || [];
                    this.userData.custom = this.userData.custom || [];

                    // Mescla estações customizadas no catálogo
                    this.userData.custom.forEach(c => {
                        this.stationMap.set(c.id, c);
                        this.stations.unshift(c);
                    });
                    return;
                }
            }
        } catch (e) {
            global.logError(`[RadioViva] Erro ao ler user_data.json: ${e.message}`);
        }

        // Se não existir, define favoritos de fábrica
        this._initDefaultUserData();
    }

    _initDefaultUserData() {
        const defaultFavorites = [];
        this.stations.forEach(s => {
            if (s.is_favorite) {
                defaultFavorites.push(s.id);
            }
        });

        this.userData = {
            favorites: defaultFavorites,
            recents: [],
            custom: []
        };
        this.saveUserData();
    }

    saveUserData() {
        try {
            const dir = Gio.File.new_for_path(this.configDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }

            const file = Gio.File.new_for_path(this.userDataPath);
            const dataStr = JSON.stringify(this.userData, null, 2);
            file.replace_contents(dataStr, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            global.logError(`[RadioViva] Falha ao salvar user_data: ${e.message}`);
        }
    }

    getFavorites() {
        const favs = [];
        for (const id of this.userData.favorites) {
            const s = this.stationMap.get(id);
            if (s) favs.push(s);
        }
        return favs;
    }

    isFavorite(stationId) {
        return this.userData.favorites.includes(stationId);
    }

    toggleFavorite(station) {
        if (!station || !station.id) return false;

        const idx = this.userData.favorites.indexOf(station.id);
        let nowFavorite = false;
        if (idx >= 0) {
            this.userData.favorites.splice(idx, 1);
            nowFavorite = false;
        } else {
            this.userData.favorites.unshift(station.id);
            nowFavorite = true;
        }

        this.saveUserData();
        return nowFavorite;
    }

    getRecents(limit = 6) {
        const recents = [];
        for (const id of this.userData.recents.slice(0, limit)) {
            const s = this.stationMap.get(id);
            if (s) recents.push(s);
        }
        return recents;
    }

    addRecent(station) {
        if (!station || !station.id) return;
        const list = this.userData.recents.filter(id => id !== station.id);
        list.unshift(station.id);
        this.userData.recents = list.slice(0, 15);
        this.saveUserData();
    }

    getTopBrasil(limit = 12) {
        return this.stations.filter(s => s.is_curated).slice(0, limit);
    }

    getRegions() {
        return REGION_MAP;
    }

    getByState(uf) {
        const target = (uf || "").toUpperCase();
        return this.stations.filter(s => s.state === target);
    }

    getGenresList() {
        const genres = new Set();
        this.stations.forEach(s => {
            if (s.genre) genres.add(s.genre);
        });
        return Array.from(genres).sort();
    }

    getByGenre(genre) {
        return this.stations.filter(s => s.genre === genre);
    }

    search(query, limit = 25) {
        if (!query || !query.trim()) return [];
        const q = query.trim().toLowerCase();

        const results = [];
        const isFav = (id) => this.userData.favorites.includes(id);

        for (const s of this.stations) {
            const name = (s.name || "").toLowerCase();
            const city = (s.city || "").toLowerCase();
            const state = (s.state || "").toLowerCase();
            const genre = (s.genre || "").toLowerCase();

            if (name.includes(q) || city.includes(q) || state === q || genre.includes(q)) {
                results.push(s);
            }
        }

        // Ordenar: Favoritos primeiro, depois exatos, depois os demais
        results.sort((a, b) => {
            const favA = isFav(a.id) ? 1 : 0;
            const favB = isFav(b.id) ? 1 : 0;
            if (favA !== favB) return favB - favA;

            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            const matchA = nameA.startsWith(q) ? 1 : 0;
            const matchB = nameB.startsWith(q) ? 1 : 0;
            if (matchA !== matchB) return matchB - matchA;

            return 0;
        });

        return results.slice(0, limit);
    }

    addCustomStation(name, url, state = "SP", genre = "Personalizada") {
        if (!name || !url) return null;
        const newStation = {
            id: `custom-${Date.now()}`,
            name: name.trim(),
            url: url.trim(),
            state: (state || "BR").toUpperCase(),
            city: "",
            genre: genre || "Personalizada",
            is_favorite: true,
            is_curated: false,
            is_custom: true
        };

        this.userData.custom.push(newStation);
        this.userData.favorites.unshift(newStation.id);
        this.stationMap.set(newStation.id, newStation);
        this.stations.unshift(newStation);
        this.saveUserData();

        return newStation;
    }
};
