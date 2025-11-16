// Simple WebSocket helper with auto‑reconnect and heartbeat support.

type Listener = (message: MessageEvent<string>) => void;

export interface WebSocketOptions {
	url?: string; // defaults to ws://localhost:8000/ws
	/** How long (ms) between heartbeats. Set to 0 to disable. */
	heartbeatIntervalMs?: number;
	/** Base delay (ms) before reconnect; real delay uses exponential backoff. */
	reconnectDelayMs?: number;
	/** Maximum delay (ms) between reconnect attempts. */
	maxReconnectDelayMs?: number;
}

export class StableWebSocket {
	private url: string;
	private ws: WebSocket | null = null;
	private listeners: Set<Listener> = new Set();
	private heartbeatIntervalId: number | null = null;
	private reconnectTimeoutId: number | null = null;
	private reconnectAttempts = 0;
	private manualClose = false;

	private readonly heartbeatIntervalMs: number;
	private readonly reconnectDelayMs: number;
	private readonly maxReconnectDelayMs: number;

	constructor(options: WebSocketOptions = {}) {
		const {
			url,
			heartbeatIntervalMs = 15_000,
			reconnectDelayMs = 1_000,
			maxReconnectDelayMs = 30_000
		} = options;

		this.url = url ?? this.defaultUrl();
		this.heartbeatIntervalMs = heartbeatIntervalMs;
		this.reconnectDelayMs = reconnectDelayMs;
		this.maxReconnectDelayMs = maxReconnectDelayMs;

		this.connect();
	}

	private defaultUrl(): string {
		const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const host = window.location.hostname ?? 'localhost';
		const port = 8000;
		return `${protocol}://${host}:${port}/ws`;
	}

	private connect() {
		this.ws = new WebSocket(this.url);
		this.manualClose = false;

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.startHeartbeat();
		};

		this.ws.onmessage = (event) => {
			// Ignore heartbeat replies if you don't care about them in the UI
			if (typeof event.data === 'string' && event.data === 'pong') return;
			this.listeners.forEach((listener) => listener(event as MessageEvent<string>));
		};

		this.ws.onerror = () => {
			// Errors will usually be followed by onclose, where we handle reconnect.
		};

		this.ws.onclose = () => {
			this.stopHeartbeat();

			if (!this.manualClose) {
				this.scheduleReconnect();
			}
		};
	}

	private startHeartbeat() {
		if (this.heartbeatIntervalMs <= 0) return;
		this.stopHeartbeat();

		this.heartbeatIntervalId = window.setInterval(() => {
			this.send('ping');
		}, this.heartbeatIntervalMs);
	}

	private stopHeartbeat() {
		if (this.heartbeatIntervalId !== null) {
			window.clearInterval(this.heartbeatIntervalId);
			this.heartbeatIntervalId = null;
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimeoutId !== null) return;

		this.reconnectAttempts += 1;
		const backoff = Math.min(
			this.maxReconnectDelayMs,
			this.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1)
		);

		this.reconnectTimeoutId = window.setTimeout(() => {
			this.reconnectTimeoutId = null;
			this.connect();
		}, backoff);
	}

	send(message: string) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(message);
		}
	}

	addMessageListener(listener: Listener) {
		this.listeners.add(listener);
	}

	removeMessageListener(listener: Listener) {
		this.listeners.delete(listener);
	}

	close() {
		this.manualClose = true;
		this.stopHeartbeat();

		if (this.reconnectTimeoutId !== null) {
			window.clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = null;
		}

		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.close();
		}
	}
}


