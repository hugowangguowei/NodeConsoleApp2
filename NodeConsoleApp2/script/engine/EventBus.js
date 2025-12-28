
class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback, context = null) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push({ callback, context });
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(
            listener => listener.callback !== callback
        );
    }

    emit(event, payload) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(listener => {
            listener.callback.call(listener.context, payload);
        });
    }
}

export default new EventBus();
