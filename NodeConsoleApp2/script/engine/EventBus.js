
class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback, context = null) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push({ callback, context });

		// 返回取消订阅函数，便于模块化系统释放监听
		return () => this.off(event, callback);
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
