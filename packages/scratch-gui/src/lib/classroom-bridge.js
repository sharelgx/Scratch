class ClassroomBridge {
    constructor () {
        this._listeners = new Map();
        this._initialized = false;
        this._tutorialCache = null;
        this._tutorialCacheHash = null;
        this._latestSubmission = null;
        this._targetWindow = null;
        this._handleMessage = this._handleMessage.bind(this);
    }

    initialize () {
        if (this._initialized) return;
        window.addEventListener('message', this._handleMessage);
        this._initialized = true;
    }

    dispose () {
        if (!this._initialized) return;
        window.removeEventListener('message', this._handleMessage);
        this._initialized = false;
    }

    on (event, handler) {
        if (typeof handler !== 'function') return;
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(handler);
    }

    off (event, handler) {
        if (!this._listeners.has(event)) return;
        this._listeners.get(event).delete(handler);
    }

    _emit (event, payload) {
        if (!this._listeners.has(event)) return;
        this._listeners.get(event).forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('ClassroomBridge listener error', err);
            }
        });
    }

    _postMessage (message, targetWindow) {
        const target = targetWindow || this._targetWindow || window.parent;
        if (!target || typeof target.postMessage !== 'function') return;
        try {
            target.postMessage({
                source: 'scratch-classroom',
                ...message,
                payload: {
                    ...(message.payload || {}),
                    timestamp: Date.now()
                }
            }, '*');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[ClassroomBridge] postMessage failed', err);
        }
    }

    notifyReady (extra = {}) {
        const tutorialId = extra.tutorialId || this._tutorialCache?.tutorialId || this._tutorialCache?.id || null;
        this._postMessage({
            type: 'CLASSROOM_READY',
            payload: {
                tutorialId,
                stepCount: this._tutorialCache?.steps?.length || 0,
                ...extra
            }
        });
    }

    requestSave (extra = {}) {
        const tutorialId = extra.tutorialId || this._tutorialCache?.tutorialId || this._tutorialCache?.id || null;
        this._postMessage({
            type: 'REQUEST_SAVE',
            payload: {
                tutorialId,
                assignmentId: extra.assignmentId || this._tutorialCache?.assignmentId || null,
                stepIndex: typeof extra.stepIndex === 'number' ? extra.stepIndex : 0,
                autosave: Boolean(extra.autosave)
            }
        });
    }

    _hashPayload (payload) {
        const stableStringify = value => {
            if (value === null) return 'null';
            if (value === undefined) return 'undefined';
            if (typeof value !== 'object') {
                return JSON.stringify(value);
            }
            if (Array.isArray(value)) {
                return `[${value.map(stableStringify).join(',')}]`;
            }
            const keys = Object.keys(value).sort();
            return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        };
        try {
            return stableStringify(payload);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[ClassroomBridge] 无法生成 payload hash', err);
            return `${Date.now()}`;
        }
    }

    _handleMessage (event) {
        if (!event || !event.data || typeof event.data !== 'object') return;
        const {type, payload} = event.data;
        if (type === 'TUTORIAL_CONTEXT') {
            // eslint-disable-next-line no-console
            console.log('[ClassroomBridge] 收到 TUTORIAL_CONTEXT 消息', {
                tutorialId: payload?.tutorialId || payload?.id,
                stepsCount: payload?.steps?.length || 0,
                payload
            });
            
            this._targetWindow = event.source || window.parent;
            const incomingHash = this._hashPayload(payload);
            const isSamePayload = this._tutorialCacheHash === incomingHash;
            this._tutorialCacheHash = incomingHash;
            
            // eslint-disable-next-line no-console
            console.log('[ClassroomBridge] isSamePayload:', isSamePayload);
            
            if (!isSamePayload) {
                this._tutorialCache = payload;
                // eslint-disable-next-line no-console
                console.log('[ClassroomBridge] 触发 tutorial 事件', payload);
                this._emit('tutorial', payload);
            } else {
                // eslint-disable-next-line no-console
                console.log('[ClassroomBridge] 跳过重复的 tutorial payload');
            }
            this._postMessage({
                type: 'TUTORIAL_CONTEXT_ACK',
                payload: {
                    tutorialId: payload?.tutorialId || payload?.id || null,
                received: true
                }
            }, event.source);
        } else if (type === 'PROJECT_SAVED' || type === 'PROJECT_SAVE_FAILED') {
            this._latestSubmission = {type, payload};
            this._emit('submission-status', {type, payload});
        } else if (type === 'PROJECT_STATUS') {
            const normalized = String(payload?.status || '').toLowerCase();
            const derivedType = normalized === 'success' || normalized === 'ok'
                ? 'PROJECT_SAVED'
                : normalized === 'error' || normalized === 'failed'
                    ? 'PROJECT_SAVE_FAILED'
                    : 'PROJECT_STATUS';
            this._latestSubmission = {type: derivedType, payload};
            this._emit('submission-status', {type: derivedType, payload});
        }
    }

    getLatestTutorial () {
        return this._tutorialCache;
    }

    getLatestSubmission () {
        return this._latestSubmission;
    }
}

const bridge = new ClassroomBridge();
export default bridge;

