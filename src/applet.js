/**
 * RadioViva - Applet para Linux Mint Cinnamon
 * Rádios de todo o Brasil com catálogo de 1.600+ emissoras,
 * player moderno na barra, controle de volume, gravação e sleep timer.
 */

const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Main = imports.ui.main;

class RadioVivaApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.metadata = metadata;
        this.instanceId = instance_id;
        this.orientation = orientation;

        // Adiciona pasta do applet ao caminho de busca do CJS
        imports.searchPath.unshift(metadata.path);

        const { MpvPlayer, PlaybackStatus } = imports.core.mpv_player;
        const { CatalogManager, UF_NAMES, REGION_MAP } = imports.core.catalog_manager;
        const { SleepTimer } = imports.core.sleep_timer;

        this.PlaybackStatus = PlaybackStatus;
        this.UF_NAMES = UF_NAMES;
        this.REGION_MAP = REGION_MAP;

        this.catalog = new CatalogManager(metadata.path);

        // Inicializa o player MPV
        this.player = new MpvPlayer({
            onStatusChange: this._onPlayerStatusChange.bind(this),
            onMetadataChange: this._onPlayerMetadataChange.bind(this),
            onVolumeChange: this._onPlayerVolumeChange.bind(this),
            onRecordingChange: this._onPlayerRecordingChange.bind(this)
        });

        // Inicializa o temporizador
        this.sleepTimer = new SleepTimer(this.player, {
            onTick: (sec) => this._updateSleepTimerLabel(),
            onFinished: () => {
                Main.notify("RadioViva", "Sleep Timer finalizado. Reprodução desligada.");
                this._updateSleepTimerLabel();
            },
            onCancelled: () => this._updateSleepTimerLabel()
        });

        this._initSettings();
        this._initUi();
        this._buildMenu();

        // Scroll do mouse no ícone para alterar volume
        this.actor.connect("scroll-event", this._onScrollEvent.bind(this));
    }

    _initSettings() {
        this.settings = new Settings.AppletSettings(this, this.metadata.uuid, this.instanceId);

        this.settings.bindProperty(Settings.BindingDirection.IN, "show-station-on-panel", "showStationOnPanel", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panel-text-type", "panelTextType", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-panel-text-length", "maxPanelTextLength", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-notifications", "showNotifications", null, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "initial-volume", "initialVolume", null, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "record-directory", "recordDirectory", null, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "keep-volume-between-sessions", "keepVolume", null, null);

        if (this.initialVolume && typeof this.initialVolume === "number") {
            this.player.currentVolume = this.initialVolume;
        }
    }

    _initUi() {
        this.set_applet_tooltip("RadioViva - Rádios de todo o Brasil");

        // Ícone padrão
        this.iconPath = `${this.metadata.path}/icon.png`;
        const iconFile = Gio.File.new_for_path(this.iconPath);
        if (iconFile.query_exists(null)) {
            this.set_applet_icon_path(this.iconPath);
        } else {
            this.set_applet_icon_symbolic_name("radio-symbolic");
        }

        this._updatePanelDisplay();
    }

    _updatePanelDisplay() {
        if (!this.showStationOnPanel) {
            this.set_applet_label("");
            return;
        }

        const station = this.player.currentStation;
        if (!station || this.player.status === this.PlaybackStatus.STOPPED) {
            this.set_applet_label("");
            return;
        }

        let text = "";
        const type = this.panelTextType || "station";
        const maxLen = this.maxPanelTextLength || 24;

        if (type === "station") {
            text = station.name;
        } else if (type === "track") {
            text = this.player.currentTitle || station.name;
        } else {
            text = this.player.currentTitle ? `${station.name}: ${this.player.currentTitle}` : station.name;
        }

        if (text.length > maxLen) {
            text = text.substring(0, maxLen - 1) + "…";
        }

        this.set_applet_label(` ${text}`);
    }

    _onScrollEvent(actor, event) {
        const direction = event.get_scroll_direction();
        let delta = 0;
        if (direction === Clutter.ScrollDirection.UP) {
            delta = 5;
        } else if (direction === Clutter.ScrollDirection.DOWN) {
            delta = -5;
        }

        if (delta !== 0) {
            this.player.changeVolume(delta);
            this._showVolumeOsd();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _showVolumeOsd() {
        const vol = this.player.currentVolume;
        this.set_applet_tooltip(`RadioViva - Volume: ${vol}%`);
        if (this.volumeSlider) {
            this.volumeSlider.setValue(vol / 100);
        }
    }

    on_applet_clicked(event) {
        this.menu.toggle();
    }

    on_applet_middle_clicked(event) {
        this.player.togglePause();
    }

    _buildMenu() {
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, this.orientation);
        this.menuManager.addMenu(this.menu);

        // 1. Player Card Superior
        this._buildPlayerCard();

        // 2. Barra de Busca
        this._buildSearchBar();

        // Separador
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Contêiner de Resultados de Busca
        this.searchResultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.searchResultsSection);

        // Contêiner de Navegação Padrão (Submenus)
        this.navSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.navSection);

        // 3. Submenus
        this._buildFavoritesSubmenu();
        this._buildRecentsSubmenu();
        this._buildTopBrasilSubmenu();
        this._buildStatesSubmenu();
        this._buildGenresSubmenu();

        // Separador de utilitários
        this.navSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._buildSleepTimerSubmenu();
        this._buildUtilityMenuItems();
    }

    _buildPlayerCard() {
        this.playerCard = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this.playerCard.actor.add_style_class_name("radioviva-player-card");

        const vbox = new St.BoxLayout({ vertical: true, x_expand: true });

        // Linha 1: Badge UF + Nome da Rádio
        const line1 = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
        this.cardBadge = new St.Label({ text: "BR", style_class: "radioviva-uf-badge" });
        this.cardStationName = new St.Label({
            text: "Selecione uma Rádio",
            style_class: "radioviva-station-name",
            x_expand: true
        });
        line1.add_child(this.cardBadge);
        line1.add_child(this.cardStationName);
        vbox.add_child(line1);

        // Linha 2: Música / Programa
        this.cardTrack = new St.Label({
            text: "Pronto para tocar",
            style_class: "radioviva-track-title"
        });
        vbox.add_child(this.cardTrack);

        // Linha 3: Controles
        const controls = new St.BoxLayout({
            vertical: false,
            style_class: "radioviva-controls-row",
            y_align: Clutter.ActorAlign.CENTER
        });

        // Botão Play/Pause
        this.playBtn = new St.Button({ style_class: "radioviva-action-button" });
        this.playBtnIcon = new St.Icon({ icon_name: "media-playback-start-symbolic", icon_size: 16 });
        this.playBtn.set_child(this.playBtnIcon);
        this.playBtn.connect("clicked", () => this.player.togglePause());

        // Botão Stop
        this.stopBtn = new St.Button({ style_class: "radioviva-action-button" });
        this.stopBtn.set_child(new St.Icon({ icon_name: "media-playback-stop-symbolic", icon_size: 16 }));
        this.stopBtn.connect("clicked", () => this.player.stop());

        // Botão Favoritar
        this.favBtn = new St.Button({ style_class: "radioviva-action-button" });
        this.favBtnIcon = new St.Icon({ icon_name: "non-starred-symbolic", icon_size: 16 });
        this.favBtn.set_child(this.favBtnIcon);
        this.favBtn.connect("clicked", () => this._onToggleCurrentFavorite());

        // Botão Gravação
        this.recBtn = new St.Button({ style_class: "radioviva-action-button" });
        this.recBtnIcon = new St.Icon({ icon_name: "media-record-symbolic", icon_size: 16 });
        this.recBtn.set_child(this.recBtnIcon);
        this.recBtn.connect("clicked", () => this._onToggleRecording());

        // Botão Copiar Título
        this.copyBtn = new St.Button({ style_class: "radioviva-action-button" });
        this.copyBtn.set_child(new St.Icon({ icon_name: "edit-copy-symbolic", icon_size: 16 }));
        this.copyBtn.connect("clicked", () => this._copyCurrentTrack());

        controls.add_child(this.playBtn);
        controls.add_child(this.stopBtn);
        controls.add_child(this.favBtn);
        controls.add_child(this.recBtn);
        controls.add_child(this.copyBtn);
        vbox.add_child(controls);

        this.playerCard.actor.add_child(vbox);
        this.menu.addMenuItem(this.playerCard);

        // Volume Slider
        this.volumeSlider = new PopupMenu.PopupSliderMenuItem(this.player.currentVolume / 100);
        this.volumeSlider.connect("value-changed", (slider, val) => {
            const vol = Math.round(val * 100);
            this.player.setVolume(vol);
            if (this.keepVolume) {
                this.initialVolume = vol;
            }
        });
        this.menu.addMenuItem(this.volumeSlider);
    }

    _buildSearchBar() {
        this.searchItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this.searchEntry = new St.Entry({
            hint_text: "🔍 Buscar rádio, cidade, estado ou gênero...",
            style_class: "radioviva-search-entry",
            can_focus: true,
            x_expand: true
        });

        this.searchEntry.clutter_text.connect("text-changed", () => {
            const query = this.searchEntry.get_text();
            this._onSearchQueryChanged(query);
        });

        this.searchItem.actor.add_child(this.searchEntry);
        this.menu.addMenuItem(this.searchItem);
    }

    _onSearchQueryChanged(query) {
        this.searchResultsSection.removeAll();

        if (!query || !query.trim()) {
            this.searchResultsSection.actor.hide();
            this.navSection.actor.show();
            return;
        }

        this.navSection.actor.hide();
        this.searchResultsSection.actor.show();

        const results = this.catalog.search(query, 20);
        if (results.length === 0) {
            const noRes = new PopupMenu.PopupMenuItem("Nenhuma rádio encontrada para este termo", { reactive: false });
            this.searchResultsSection.addMenuItem(noRes);
            return;
        }

        const header = new PopupMenu.PopupMenuItem(`Resultados encontrados (${results.length}):`, { reactive: false });
        this.searchResultsSection.addMenuItem(header);

        results.forEach(station => {
            const isFav = this.catalog.isFavorite(station.id);
            const prefix = isFav ? "⭐ " : "";
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${prefix}${badge}${station.name}`,
                "audio-x-generic-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => {
                this._playStation(station);
            });
            this.searchResultsSection.addMenuItem(item);
        });
    }

    _buildFavoritesSubmenu() {
        this.favSubmenu = new PopupMenu.PopupSubMenuMenuItem("⭐ Favoritos");
        this.navSection.addMenuItem(this.favSubmenu);
        this._populateFavorites();
    }

    _populateFavorites() {
        this.favSubmenu.menu.removeAll();
        const favs = this.catalog.getFavorites();

        if (favs.length === 0) {
            this.favSubmenu.menu.addMenuItem(new PopupMenu.PopupMenuItem("Nenhum favorito salvo", { reactive: false }));
            return;
        }

        favs.forEach(station => {
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${badge}${station.name}`,
                "starred-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => this._playStation(station));
            this.favSubmenu.menu.addMenuItem(item);
        });
    }

    _buildRecentsSubmenu() {
        this.recentSubmenu = new PopupMenu.PopupSubMenuMenuItem("🕒 Tocadas Recentemente");
        this.navSection.addMenuItem(this.recentSubmenu);
        this._populateRecents();
    }

    _populateRecents() {
        this.recentSubmenu.menu.removeAll();
        const recents = this.catalog.getRecents();

        if (recents.length === 0) {
            this.recentSubmenu.menu.addMenuItem(new PopupMenu.PopupMenuItem("Histórico vazio", { reactive: false }));
            return;
        }

        recents.forEach(station => {
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${badge}${station.name}`,
                "document-open-recent-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => this._playStation(station));
            this.recentSubmenu.menu.addMenuItem(item);
        });
    }

    _buildTopBrasilSubmenu() {
        const topSubmenu = new PopupMenu.PopupSubMenuMenuItem("🇧🇷 Top Rádios do Brasil");
        const topStations = this.catalog.getTopBrasil();

        topStations.forEach(station => {
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${badge}${station.name}`,
                "emblem-favorite-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => this._playStation(station));
            topSubmenu.menu.addMenuItem(item);
        });

        this.navSection.addMenuItem(topSubmenu);
    }

    _buildStatesSubmenu() {
        const statesSubmenu = new PopupMenu.PopupSubMenuMenuItem("📍 Rádios por Estado");

        for (const [regionKey, regionData] of Object.entries(this.REGION_MAP)) {
            const regSubmenu = new PopupMenu.PopupSubMenuMenuItem(regionData.name);

            regionData.ufs.forEach(uf => {
                const ufName = this.UF_NAMES[uf] || uf;
                const stationsInUf = this.catalog.getByState(uf);

                if (stationsInUf.length > 0) {
                    const ufSubmenu = new PopupMenu.PopupSubMenuMenuItem(`${uf} - ${ufName} (${stationsInUf.length})`);

                    stationsInUf.slice(0, 40).forEach(station => {
                        const city = station.city ? ` (${station.city})` : "";
                        const item = new PopupMenu.PopupMenuItem(`${station.name}${city}`);
                        item.connect("activate", () => this._playStation(station));
                        ufSubmenu.menu.addMenuItem(item);
                    });

                    regSubmenu.menu.addMenuItem(ufSubmenu);
                }
            });

            statesSubmenu.menu.addMenuItem(regSubmenu);
        }

        this.navSection.addMenuItem(statesSubmenu);
    }

    _buildGenresSubmenu() {
        const genresSubmenu = new PopupMenu.PopupSubMenuMenuItem("🎵 Rádios por Gênero");
        const genres = this.catalog.getGenresList();

        genres.forEach(genre => {
            const list = this.catalog.getByGenre(genre);
            if (list.length > 0) {
                const sub = new PopupMenu.PopupSubMenuMenuItem(`${genre} (${list.length})`);
                list.slice(0, 30).forEach(station => {
                    const badge = station.state ? `[${station.state}] ` : "";
                    const item = new PopupMenu.PopupMenuItem(`${badge}${station.name}`);
                    item.connect("activate", () => this._playStation(station));
                    sub.menu.addMenuItem(item);
                });
                genresSubmenu.menu.addMenuItem(sub);
            }
        });

        this.navSection.addMenuItem(genresSubmenu);
    }

    _buildSleepTimerSubmenu() {
        this.timerSubmenu = new PopupMenu.PopupSubMenuMenuItem("⏱️ Sleep Timer");

        [15, 30, 45, 60, 90].forEach(min => {
            const item = new PopupMenu.PopupMenuItem(`Desligar em ${min} minutos`);
            item.connect("activate", () => {
                this.sleepTimer.start(min);
                Main.notify("RadioViva", `Temporizador ativado para desligar em ${min} minutos.`);
            });
            this.timerSubmenu.menu.addMenuItem(item);
        });

        this.cancelTimerItem = new PopupMenu.PopupMenuItem("Desativar Temporizador");
        this.cancelTimerItem.connect("activate", () => {
            this.sleepTimer.cancel();
            Main.notify("RadioViva", "Sleep Timer desativado.");
        });
        this.timerSubmenu.menu.addMenuItem(this.cancelTimerItem);

        this.navSection.addMenuItem(this.timerSubmenu);
    }

    _buildUtilityMenuItems() {
        // Abrir pasta de gravações
        const openRecDirItem = new PopupMenu.PopupIconMenuItem(
            "📁 Abrir Pasta de Gravações",
            "folder-music-symbolic",
            St.IconType.SYMBOLIC
        );
        openRecDirItem.connect("activate", () => {
            const dir = (this.recordDirectory || "~/Música/RadioViva").replace("~", GLib.get_home_dir());
            const dirFile = Gio.File.new_for_path(dir);
            if (!dirFile.query_exists(null)) {
                dirFile.make_directory_with_parents(null);
            }
            Util.spawnCommandLine(`xdg-open "${dir}"`);
        });
        this.navSection.addMenuItem(openRecDirItem);

        // Adicionar rádio personalizada
        const addCustomItem = new PopupMenu.PopupIconMenuItem(
            "➕ Adicionar Rádio por URL",
            "list-add-symbolic",
            St.IconType.SYMBOLIC
        );
        addCustomItem.connect("activate", () => {
            this._showAddCustomDialog();
        });
        this.navSection.addMenuItem(addCustomItem);

        // Configurações
        const settingsItem = new PopupMenu.PopupIconMenuItem(
            "⚙️ Configurações...",
            "preferences-system-symbolic",
            St.IconType.SYMBOLIC
        );
        settingsItem.connect("activate", () => {
            Util.spawnCommandLine(`xlet-settings applet ${this.metadata.uuid} -i ${this.instanceId}`);
        });
        this.navSection.addMenuItem(settingsItem);
    }

    _playStation(station) {
        if (!station || !station.url) return;

        this.catalog.addRecent(station);
        this._populateRecents();

        this.player.play(station);

        this.cardBadge.set_text(station.state || "BR");
        this.cardStationName.set_text(station.name);
        this.cardTrack.set_text("Conectando...");
        this._updateFavButtonIcon();
    }

    _onPlayerStatusChange(status) {
        if (status === this.PlaybackStatus.PLAYING) {
            this.playBtnIcon.set_icon_name("media-playback-pause-symbolic");
            this.set_applet_icon_symbolic_name("media-playback-start-symbolic");
            if (this.iconPath) this.set_applet_icon_path(this.iconPath);
        } else if (status === this.PlaybackStatus.PAUSED) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.cardTrack.set_text("Pausado");
        } else if (status === this.PlaybackStatus.LOADING) {
            this.cardTrack.set_text("Sintonizando transmissão...");
        } else if (status === this.PlaybackStatus.STOPPED) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.cardTrack.set_text("Parado");
        } else if (status === this.PlaybackStatus.ERROR) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.cardTrack.set_text("Erro ao conectar à rádio");
            Main.notify("RadioViva", "Falha na transmissão. Tentando reconectar...");
        }

        this._updatePanelDisplay();
        this._updateTooltip();
    }

    _onPlayerMetadataChange(meta) {
        const title = meta.title || "Transmissão ao vivo";
        this.cardTrack.set_text(title);
        this._updatePanelDisplay();
        this._updateTooltip();

        if (this.showNotifications && meta.title && meta.station) {
            Main.notify(`RadioViva - ${meta.station.name}`, meta.title);
        }
    }

    _onPlayerVolumeChange(volume) {
        if (this.volumeSlider) {
            this.volumeSlider.setValue(volume / 100);
        }
        this._updateTooltip();
    }

    _onPlayerRecordingChange(isRecording, filePath) {
        if (isRecording) {
            this.recBtn.add_style_class_name("radioviva-record-active");
            Main.notify("RadioViva - Gravação Iniciada", `Gravando transmissão para:\n${filePath}`);
        } else {
            this.recBtn.remove_style_class_name("radioviva-record-active");
            if (filePath) {
                Main.notify("RadioViva - Gravação Concluída", `Arquivo salvo com sucesso em:\n${filePath}`);
            }
        }
    }

    _onToggleCurrentFavorite() {
        const station = this.player.currentStation;
        if (!station) return;

        const isFav = this.catalog.toggleFavorite(station);
        this._updateFavButtonIcon();
        this._populateFavorites();

        const msg = isFav ? `"${station.name}" adicionada aos Favoritos.` : `"${station.name}" removida dos Favoritos.`;
        Main.notify("RadioViva", msg);
    }

    _updateFavButtonIcon() {
        const station = this.player.currentStation;
        if (station && this.catalog.isFavorite(station.id)) {
            this.favBtnIcon.set_icon_name("starred-symbolic");
        } else {
            this.favBtnIcon.set_icon_name("non-starred-symbolic");
        }
    }

    _onToggleRecording() {
        if (this.player.isRecording) {
            this.player.stopRecording();
        } else {
            const dir = (this.recordDirectory || "~/Música/RadioViva").replace("~", GLib.get_home_dir());
            this.player.startRecording(dir);
        }
    }

    _copyCurrentTrack() {
        const track = this.player.currentTitle;
        const station = this.player.currentStation ? this.player.currentStation.name : "";
        const textToCopy = track ? `${track} (${station})` : station;

        if (textToCopy) {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, textToCopy);
            Main.notify("RadioViva", `Copiado para a área de transferência:\n"${textToCopy}"`);
        }
    }

    _updateSleepTimerLabel() {
        if (this.sleepTimer.isActive) {
            this.timerSubmenu.label.set_text(`⏱️ Sleep Timer (${this.sleepTimer.getFormattedTime()})`);
        } else {
            this.timerSubmenu.label.set_text("⏱️ Sleep Timer");
        }
    }

    _updateTooltip() {
        const station = this.player.currentStation;
        if (!station || this.player.status === this.PlaybackStatus.STOPPED) {
            this.set_applet_tooltip("RadioViva - Rádios de todo o Brasil (Parado)");
            return;
        }

        const vol = this.player.currentVolume;
        const track = this.player.currentTitle ? `\n🎵 ${this.player.currentTitle}` : "";
        const state = station.state ? ` [${station.state}]` : "";
        this.set_applet_tooltip(`RadioViva: ${station.name}${state}${track}\n🔊 Volume: ${vol}%`);
    }

    _showAddCustomDialog() {
        // Abre diálogo simples de inserção usando zenity ou script nativo
        const script = `zenity --forms --title="RadioViva - Adicionar Rádio" --text="Insira os dados da rádio:" --add-entry="Nome da Rádio" --add-entry="URL do Stream (ex: https://...)" --add-entry="Estado (UF, ex: SP)" --separator="|"`;
        Util.spawnCommandLineAsyncIO(script, (stdout, stderr) => {
            if (stdout && stdout.trim()) {
                const parts = stdout.trim().split("|");
                const name = parts[0];
                const url = parts[1];
                const uf = parts[2] || "SP";
                if (name && url) {
                    const newStation = this.catalog.addCustomStation(name, url, uf);
                    this._populateFavorites();
                    Main.notify("RadioViva", `Rádio "${name}" adicionada com sucesso aos Favoritos!`);
                    this._playStation(newStation);
                }
            }
        });
    }

    on_applet_removed_from_panel() {
        if (this.sleepTimer) {
            this.sleepTimer.destroy();
        }
        if (this.player) {
            this.player.destroy();
        }
        if (this.settings) {
            this.settings.finalize();
        }
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new RadioVivaApplet(metadata, orientation, panel_height, instance_id);
}
