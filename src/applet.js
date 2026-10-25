/**
 * RadioViva - Applet para Linux Mint Cinnamon
 * Rádios de todo o Brasil com catálogo de 1.600+ emissoras.
 * Botões diretos e rápidos: Play/Pause, Stop, Volume -, Volume +, Mudo, Slider.
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

        imports.searchPath.unshift(metadata.path);

        const { MpvPlayer, PlaybackStatus } = imports.core.mpv_player;
        const { CatalogManager, UF_NAMES, REGION_MAP } = imports.core.catalog_manager;
        const { SleepTimer } = imports.core.sleep_timer;

        this.PlaybackStatus = PlaybackStatus;
        this.UF_NAMES = UF_NAMES;
        this.REGION_MAP = REGION_MAP;

        this.catalog = new CatalogManager(metadata.path);

        this.player = new MpvPlayer({
            onStatusChange: this._onPlayerStatusChange.bind(this),
            onMetadataChange: this._onPlayerMetadataChange.bind(this),
            onVolumeChange: this._onPlayerVolumeChange.bind(this),
            onRecordingChange: this._onPlayerRecordingChange.bind(this)
        });

        this.sleepTimer = new SleepTimer(this.player, {
            onTick: () => this._updateSleepTimerLabel(),
            onFinished: () => {
                Main.notify("RadioViva", "Sleep Timer finalizado. Reprodução desligada.");
                this._updateSleepTimerLabel();
            },
            onCancelled: () => this._updateSleepTimerLabel()
        });

        this._initSettings();
        this._initUi();
        this._buildMenu();
        this._buildContextMenu();

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
        this.set_applet_tooltip("RadioViva - Rádios do Brasil");

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
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
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

        // 1. Barra de Botões Superiores (Play/Pause, Stop, Vol -, Vol +, Mute)
        this._buildControlToolbar();

        // 2. Info da Rádio tocando
        this._buildInfoSection();

        // 3. Slider de Volume
        this.volumeSlider = new PopupMenu.PopupSliderMenuItem(this.player.currentVolume / 100);
        this.volumeSlider.connect("value-changed", (slider, val) => {
            const vol = Math.round(val * 100);
            this.player.setVolume(vol);
            if (this.keepVolume) {
                this.initialVolume = vol;
            }
        });
        this.menu.addMenuItem(this.volumeSlider);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 4. Barra de Busca Rápida
        this._buildSearchBar();

        // Contêiner de Busca Dinâmica
        this.searchResultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.searchResultsSection);

        // Contêiner Principal de Rádios
        this.mainSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.mainSection);

        // 5. Lista Direta das Principais Rádios / Favoritos (Acesso Imediato)
        this._buildFavoritesList();

        this.mainSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 6. Submenus de Exploração
        this._buildStatesSubmenu();
        this._buildGenresSubmenu();
        this._buildSleepTimerSubmenu();
        this._buildUtilityMenuItems();
    }

    _buildControlToolbar() {
        const toolbar = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            style: "padding: 8px 6px; spacing: 6px;"
        });

        // 1. Botão Play / Pause
        const playBtn = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 8px 16px; margin: 2px;",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        this.playBtnIcon = new St.Icon({
            icon_name: "media-playback-start-symbolic",
            icon_size: 22,
            icon_type: St.IconType.SYMBOLIC
        });
        playBtn.set_child(this.playBtnIcon);
        playBtn.connect("button-release-event", (_, event) => {
            if (event.get_button() !== 3) {
                this.player.togglePause();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // 2. Botão Stop (Parar)
        const stopBtn = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 8px 16px; margin: 2px;",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        const stopIcon = new St.Icon({
            icon_name: "media-playback-stop-symbolic",
            icon_size: 22,
            icon_type: St.IconType.SYMBOLIC
        });
        stopBtn.set_child(stopIcon);
        stopBtn.connect("button-release-event", (_, event) => {
            if (event.get_button() !== 3) {
                this.player.stop();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // 3. Botão Volume Menos (-)
        const volDownBtn = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 8px 12px; margin: 2px;",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        const volDownIcon = new St.Icon({
            icon_name: "audio-volume-low-symbolic",
            icon_size: 18,
            icon_type: St.IconType.SYMBOLIC
        });
        volDownBtn.set_child(volDownIcon);
        volDownBtn.connect("button-release-event", (_, event) => {
            if (event.get_button() !== 3) {
                this.player.changeVolume(-5);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // 4. Botão Volume Mais (+)
        const volUpBtn = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 8px 12px; margin: 2px;",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        const volUpIcon = new St.Icon({
            icon_name: "audio-volume-high-symbolic",
            icon_size: 18,
            icon_type: St.IconType.SYMBOLIC
        });
        volUpBtn.set_child(volUpIcon);
        volUpBtn.connect("button-release-event", (_, event) => {
            if (event.get_button() !== 3) {
                this.player.changeVolume(5);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // 5. Botão Mudo
        const muteBtn = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 8px 12px; margin: 2px;",
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        this.muteBtnIcon = new St.Icon({
            icon_name: "audio-volume-muted-symbolic",
            icon_size: 18,
            icon_type: St.IconType.SYMBOLIC
        });
        muteBtn.set_child(this.muteBtnIcon);
        muteBtn.connect("button-release-event", (_, event) => {
            if (event.get_button() !== 3) {
                this.player.toggleMute();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        toolbar.add_child(playBtn);
        toolbar.add_child(stopBtn);
        toolbar.add_child(volDownBtn);
        toolbar.add_child(volUpBtn);
        toolbar.add_child(muteBtn);

        this.menu.box.add_child(toolbar);
    }

    _buildInfoSection() {
        this.infoBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: "padding: 4px 12px 6px 12px;"
        });

        this.infoStationLabel = new St.Label({
            text: "RadioViva",
            style: "font-weight: bold; font-size: 1.1em; text-align: center;"
        });
        this.infoTrackLabel = new St.Label({
            text: "Selecione uma rádio abaixo para ouvir",
            style: "font-size: 0.9em; opacity: 0.8; text-align: center;"
        });

        this.infoBox.add_child(this.infoStationLabel);
        this.infoBox.add_child(this.infoTrackLabel);
        this.menu.box.add_child(this.infoBox);
    }

    _buildSearchBar() {
        const searchBox = new St.BoxLayout({
            vertical: false,
            style: "padding: 4px 10px 6px 10px;"
        });
        this.searchEntry = new St.Entry({
            hint_text: "🔍 Buscar rádio, cidade ou estado...",
            can_focus: true,
            x_expand: true,
            style: "padding: 5px 8px; border-radius: 5px;"
        });

        this.searchEntry.clutter_text.connect("text-changed", () => {
            const query = this.searchEntry.get_text();
            this._onSearchQueryChanged(query);
        });

        searchBox.add_child(this.searchEntry);
        this.menu.box.add_child(searchBox);
    }

    _onSearchQueryChanged(query) {
        this.searchResultsSection.removeAll();

        if (!query || !query.trim()) {
            this.searchResultsSection.actor.hide();
            this.mainSection.actor.show();
            return;
        }

        this.mainSection.actor.hide();
        this.searchResultsSection.actor.show();

        const results = this.catalog.search(query, 15);
        if (results.length === 0) {
            this.searchResultsSection.addMenuItem(new PopupMenu.PopupMenuItem("Nenhuma rádio encontrada", { reactive: false }));
            return;
        }

        results.forEach(station => {
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${badge}${station.name}`,
                "media-playback-start-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => this._playStation(station));
            this.searchResultsSection.addMenuItem(item);
        });
    }

    _buildFavoritesList() {
        const favs = this.catalog.getFavorites();
        favs.forEach(station => {
            const badge = station.state ? `[${station.state}] ` : "";
            const item = new PopupMenu.PopupIconMenuItem(
                `${badge}${station.name}`,
                "media-playback-start-symbolic",
                St.IconType.SYMBOLIC
            );
            item.connect("activate", () => this._playStation(station));
            this.mainSection.addMenuItem(item);
        });
    }

    _buildStatesSubmenu() {
        const statesSubmenu = new PopupMenu.PopupSubMenuMenuItem("📍 Todas as Rádios por Estado");

        for (const [regionKey, regionData] of Object.entries(this.REGION_MAP)) {
            const regSubmenu = new PopupMenu.PopupSubMenuMenuItem(regionData.name);

            regionData.ufs.forEach(uf => {
                const ufName = this.UF_NAMES[uf] || uf;
                const stationsInUf = this.catalog.getByState(uf);

                if (stationsInUf.length > 0) {
                    const ufSubmenu = new PopupMenu.PopupSubMenuMenuItem(`${uf} - ${ufName} (${stationsInUf.length})`);

                    stationsInUf.slice(0, 35).forEach(station => {
                        const item = new PopupMenu.PopupMenuItem(station.name);
                        item.connect("activate", () => this._playStation(station));
                        ufSubmenu.menu.addMenuItem(item);
                    });

                    regSubmenu.menu.addMenuItem(ufSubmenu);
                }
            });

            statesSubmenu.menu.addMenuItem(regSubmenu);
        }

        this.mainSection.addMenuItem(statesSubmenu);
    }

    _buildGenresSubmenu() {
        const genresSubmenu = new PopupMenu.PopupSubMenuMenuItem("🎵 Rádios por Gênero");
        const genres = this.catalog.getGenresList();

        genres.forEach(genre => {
            const list = this.catalog.getByGenre(genre);
            if (list.length > 0) {
                const sub = new PopupMenu.PopupSubMenuMenuItem(`${genre} (${list.length})`);
                list.slice(0, 25).forEach(station => {
                    const item = new PopupMenu.PopupMenuItem(station.name);
                    item.connect("activate", () => this._playStation(station));
                    sub.menu.addMenuItem(item);
                });
                genresSubmenu.menu.addMenuItem(sub);
            }
        });

        this.mainSection.addMenuItem(genresSubmenu);
    }

    _buildSleepTimerSubmenu() {
        this.timerSubmenu = new PopupMenu.PopupSubMenuMenuItem("⏱️ Sleep Timer (Desligar)");

        [15, 30, 45, 60].forEach(min => {
            const item = new PopupMenu.PopupMenuItem(`Desligar em ${min} minutos`);
            item.connect("activate", () => {
                this.sleepTimer.start(min);
                Main.notify("RadioViva", `Temporizador ativado: ${min} minutos.`);
            });
            this.timerSubmenu.menu.addMenuItem(item);
        });

        const cancelItem = new PopupMenu.PopupMenuItem("Desativar Timer");
        cancelItem.connect("activate", () => this.sleepTimer.cancel());
        this.timerSubmenu.menu.addMenuItem(cancelItem);

        this.mainSection.addMenuItem(this.timerSubmenu);
    }

    _buildUtilityMenuItems() {
        const settingsItem = new PopupMenu.PopupIconMenuItem("⚙️ Configurações...", "preferences-system-symbolic", St.IconType.SYMBOLIC);
        settingsItem.connect("activate", () => {
            Util.spawnCommandLine(`xlet-settings applet ${this.metadata.uuid} -i ${this.instanceId}`);
        });
        this.mainSection.addMenuItem(settingsItem);
    }

    _buildContextMenu() {
        this._applet_context_menu.removeAll();

        const stopItem = new PopupMenu.PopupIconMenuItem("⏹️ Parar Reprodução", "media-playback-stop-symbolic", St.IconType.SYMBOLIC);
        stopItem.connect("activate", () => this.player.stop());
        this._applet_context_menu.addMenuItem(stopItem);

        const playPauseItem = new PopupMenu.PopupIconMenuItem("⏯️ Play / Pause", "media-playback-start-symbolic", St.IconType.SYMBOLIC);
        playPauseItem.connect("activate", () => this.player.togglePause());
        this._applet_context_menu.addMenuItem(playPauseItem);

        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const volUpItem = new PopupMenu.PopupIconMenuItem("🔊 Aumentar Volume", "audio-volume-high-symbolic", St.IconType.SYMBOLIC);
        volUpItem.connect("activate", () => this.player.changeVolume(5));
        this._applet_context_menu.addMenuItem(volUpItem);

        const volDownItem = new PopupMenu.PopupIconMenuItem("🔉 Diminuir Volume", "audio-volume-low-symbolic", St.IconType.SYMBOLIC);
        volDownItem.connect("activate", () => this.player.changeVolume(-5));
        this._applet_context_menu.addMenuItem(volDownItem);

        const muteItem = new PopupMenu.PopupIconMenuItem("🔇 Mudo", "audio-volume-muted-symbolic", St.IconType.SYMBOLIC);
        muteItem.connect("activate", () => this.player.toggleMute());
        this._applet_context_menu.addMenuItem(muteItem);

        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupIconMenuItem("⚙️ Configurações...", "preferences-system-symbolic", St.IconType.SYMBOLIC);
        settingsItem.connect("activate", () => {
            Util.spawnCommandLine(`xlet-settings applet ${this.metadata.uuid} -i ${this.instanceId}`);
        });
        this._applet_context_menu.addMenuItem(settingsItem);
    }

    _playStation(station) {
        if (!station || !station.url) return;

        this.catalog.addRecent(station);
        this.player.play(station);

        this.infoStationLabel.set_text(station.name);
        this.infoTrackLabel.set_text("Conectando...");
    }

    _onPlayerStatusChange(status) {
        if (status === this.PlaybackStatus.PLAYING) {
            this.playBtnIcon.set_icon_name("media-playback-pause-symbolic");
            if (this.iconPath) this.set_applet_icon_path(this.iconPath);
        } else if (status === this.PlaybackStatus.PAUSED) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.infoTrackLabel.set_text("Pausado");
        } else if (status === this.PlaybackStatus.LOADING) {
            this.infoTrackLabel.set_text("Sintonizando rádio...");
        } else if (status === this.PlaybackStatus.STOPPED) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.infoTrackLabel.set_text("Parado");
        } else if (status === this.PlaybackStatus.ERROR) {
            this.playBtnIcon.set_icon_name("media-playback-start-symbolic");
            this.infoTrackLabel.set_text("Falha ao conectar à transmissão");
        }

        this._updatePanelDisplay();
        this._updateTooltip();
    }

    _onPlayerMetadataChange(meta) {
        const title = meta.title || "Ao vivo";
        this.infoTrackLabel.set_text(title);
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
            Main.notify("RadioViva", `Gravando: ${filePath}`);
        } else if (filePath) {
            Main.notify("RadioViva", `Gravação salva: ${filePath}`);
        }
    }

    _updateSleepTimerLabel() {
        if (this.sleepTimer.isActive) {
            this.timerSubmenu.label.set_text(`⏱️ Sleep Timer (${this.sleepTimer.getFormattedTime()})`);
        } else {
            this.timerSubmenu.label.set_text("⏱️ Sleep Timer (Desligar)");
        }
    }

    _updateTooltip() {
        const station = this.player.currentStation;
        if (!station || this.player.status === this.PlaybackStatus.STOPPED) {
            this.set_applet_tooltip("RadioViva - Rádios do Brasil (Parado)");
            return;
        }

        const vol = this.player.currentVolume;
        const track = this.player.currentTitle ? `\n🎵 ${this.player.currentTitle}` : "";
        this.set_applet_tooltip(`RadioViva: ${station.name}${track}\n🔊 Volume: ${vol}%`);
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
