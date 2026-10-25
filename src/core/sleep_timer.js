/**
 * RadioViva - Sleep Timer (Temporizador de Desligamento)
 * Permite programar o desligamento automático do áudio com contagem regressiva.
 */

const GLib = imports.gi.GLib;

var SleepTimer = class SleepTimer {
    constructor(player, callbacks = {}) {
        this.player = player;
        this.callbacks = Object.assign({
            onTick: (remainingSeconds) => {},
            onFinished: () => {},
            onCancelled: () => {}
        }, callbacks);

        this.remainingSeconds = 0;
        this.timeoutId = 0;
        this.isActive = false;
    }

    start(minutes) {
        this.cancel();

        if (minutes <= 0) return;

        this.remainingSeconds = minutes * 60;
        this.isActive = true;
        this.callbacks.onTick(this.remainingSeconds);

        this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this.remainingSeconds--;
            this.callbacks.onTick(this.remainingSeconds);

            if (this.remainingSeconds <= 0) {
                this.isActive = false;
                this.timeoutId = 0;
                this.player.stop();
                this.callbacks.onFinished();
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    cancel() {
        if (this.timeoutId > 0) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
        }
        if (this.isActive) {
            this.isActive = false;
            this.remainingSeconds = 0;
            this.callbacks.onCancelled();
        }
    }

    getFormattedTime() {
        if (!this.isActive || this.remainingSeconds <= 0) return "";
        const m = Math.floor(this.remainingSeconds / 60);
        const s = this.remainingSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    destroy() {
        this.cancel();
    }
};
