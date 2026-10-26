/**
 * RadioViva - Applet para Linux Mint Cinnamon
 * Interface limpa, rápida e 100% nativa.
 * Integração com a janela de configurações e catálogo de 1.300+ rádios do Brasil.
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
        this.PlaybackStatus = PlaybackStatus;

        // Inicializa o motor de áudio MPV
        this.player = new MpvPlayer({
            onStatusChange: this._onPlayerStatusChange.bind(this),
            onMetadataChange: this._onPlayerMetadataChange.bind(this),
            onVolumeChange: this._onPlayerVolumeChange.bind(this)
        });

        this._initSettings();
        this._initUi();
        this._buildMenu();
        this._buildContextMenu();

        // Scroll no ícone do painel para controle de volume
        this.actor.connect("scroll-event", this._onScrollEvent.bind(this));
    }

    _initSettings() {
        this.settings = new Settings.AppletSettings(this, this.metadata.uuid, this.instanceId);

        this.settings.bindProperty(Settings.BindingDirection.IN, "user-stations", "userStations", this._onUserStationsChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-station-on-panel", "showStationOnPanel", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panel-text-type", "panelTextType", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-panel-text-length", "maxPanelTextLength", this._updatePanelDisplay.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-notifications", "showNotifications", null, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "initial-volume", "initialVolume", null, null);
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

        // Seção ativa (só exibida quando uma rádio está tocando ou pausada)
        this.activeSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.activeSection);

        // Info do Now Playing
        this.nowPlayingItem = new PopupMenu.PopupMenuItem("Nenhuma rádio sintonizada", { reactive: false });
        this.activeSection.addMenuItem(this.nowPlayingItem);

        // Botão Stop (Parar)
        this.stopItem = new PopupMenu.PopupIconMenuItem("⏹️  Parar Reprodução", "media-playback-stop-symbolic", St.IconType.SYMBOLIC);
        this.stopItem.connect("activate", () => this.player.stop());
        this.activeSection.addMenuItem(this.stopItem);

        // Botão Play/Pause
        this.playPauseItem = new PopupMenu.PopupIconMenuItem("⏸️  Pausar", "media-playback-pause-symbolic", St.IconType.SYMBOLIC);
        this.playPauseItem.connect("activate", () => this.player.togglePause());
        this.activeSection.addMenuItem(this.playPauseItem);

        // Slider de Volume
        this.volumeSlider = new PopupMenu.PopupSliderMenuItem(this.player.currentVolume / 100);
        this.volumeSlider.connect("value-changed", (slider, val) => {
            const vol = Math.round(val * 100);
            this.player.setVolume(vol);
            if (this.keepVolume) {
                this.initialVolume = vol;
            }
        });
        this.activeSection.addMenuItem(this.volumeSlider);

        this.activeSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.activeSection.addMenuItem(this.activeSeparator);

        // Inicialmente esconde a seção ativa se nada estiver tocando
        this.activeSection.actor.visible = false;

        // Seção das Rádios do Usuário (Minhas Rádios)
        this.stationsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.stationsSection);
        this._populateUserStations();

        // Separador e Acesso às Configurações
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const configItem = new PopupMenu.PopupIconMenuItem("⚙️  Configurar Rádios...", "preferences-system-symbolic", St.IconType.SYMBOLIC);
        configItem.connect("activate", () => {
            Util.spawnCommandLine(`xlet-settings applet ${this.metadata.uuid} -i ${this.instanceId}`);
        });
        this.menu.addMenuItem(configItem);
    }

    _onUserStationsChanged() {
        this._populateUserStations();
    }

    _populateUserStations() {
        this.stationsSection.removeAll();

        const stations = this.userStations || [];
        const enabledStations = stations.filter(s => s.inc !== false);

        if (enabledStations.length === 0) {
            const emptyItem = new PopupMenu.PopupMenuItem("Nenhuma rádio configurada. Clique abaixo em 'Configurar Rádios'", { reactive: false });
            this.stationsSection.addMenuItem(emptyItem);
            return;
        }

        enabledStations.forEach(station => {
            const isCurrentPlaying = (this.player.currentStation && this.player.currentStation.url === station.url && this.player.status !== this.PlaybackStatus.STOPPED);
            const iconName = isCurrentPlaying ? "media-playback-start-symbolic" : "audio-x-generic-symbolic";

            const item = new PopupMenu.PopupIconMenuItem(station.name, iconName, St.IconType.SYMBOLIC);
            item.connect("activate", () => {
                this._playStation(station);
            });
            this.stationsSection.addMenuItem(item);
        });
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

        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupIconMenuItem("⚙️ Configurações...", "preferences-system-symbolic", St.IconType.SYMBOLIC);
        settingsItem.connect("activate", () => {
            Util.spawnCommandLine(`xlet-settings applet ${this.metadata.uuid} -i ${this.instanceId}`);
        });
        this._applet_context_menu.addMenuItem(settingsItem);
    }

    _playStation(station) {
        if (!station || !station.url) return;
        this.player.play(station);
        this._updateNowPlayingInfo();
    }

    _updateNowPlayingInfo() {
        const station = this.player.currentStation;
        if (!station || this.player.status === this.PlaybackStatus.STOPPED) {
            this.activeSection.actor.visible = false;
            return;
        }

        this.activeSection.actor.visible = true;
        const track = this.player.currentTitle ? `\n${this.player.currentTitle}` : "";
        this.nowPlayingItem.label.set_text(`📻 ${station.name}${track}`);
    }

    _onPlayerStatusChange(status) {
        if (status === this.PlaybackStatus.PLAYING) {
            this.playPauseItem.label.set_text("⏸️  Pausar");
            this.playPauseItem.setIconSymbolicName("media-playback-pause-symbolic");
            this.set_applet_icon_symbolic_name("media-playback-start-symbolic");
            if (this.iconPath) this.set_applet_icon_path(this.iconPath);
        } else if (status === this.PlaybackStatus.PAUSED) {
            this.playPauseItem.label.set_text("▶️  Continuar Reprodução");
            this.playPauseItem.setIconSymbolicName("media-playback-start-symbolic");
        } else if (status === this.PlaybackStatus.STOPPED) {
            this.set_applet_icon_symbolic_name("radio-symbolic");
            if (this.iconPath) this.set_applet_icon_path(this.iconPath);
        }

        this._updateNowPlayingInfo();
        this._populateUserStations();
        this._updatePanelDisplay();
        this._updateTooltip();
    }

    _onPlayerMetadataChange(meta) {
        this._updateNowPlayingInfo();
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

    _updateTooltip() {
        const station = this.player.currentStation;
        if (!station || this.player.status === this.PlaybackStatus.STOPPED) {
            this.set_applet_tooltip("RadioViva - Rádios do Brasil");
            return;
        }

        const vol = this.player.currentVolume;
        const track = this.player.currentTitle ? `\n🎵 ${this.player.currentTitle}` : "";
        this.set_applet_tooltip(`RadioViva: ${station.name}${track}\n🔊 Volume: ${vol}%`);
    }

    on_applet_removed_from_panel() {
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
