// Simple WebSocket helper with auto-reconnect and heartbeat support.

export interface BinaryMessage {
	json: any;
	blobs: Blob[];
}

type Listener = (message: BinaryMessage) => void;

export interface WebSocketOptions {
	url?: string; // defaults to ws://localhost:8000/ws
	/** How long (ms) between heartbeats. Set to 0 to disable. */
	heartbeatIntervalMs?: number;
	/** Base delay (ms) before reconnect; real delay uses exponential backoff. */
	reconnectDelayMs?: number;
	/** Maximum delay (ms) between reconnect attempts. */
	maxReconnectDelayMs?: number;
}

export class CanvasKitWebSocket {
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
		this.ws.binaryType = 'arraybuffer';
		this.manualClose = false;

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.startHeartbeat();
		};

		this.ws.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				this.handleBinaryMessage(event.data);
			} else {
				// In case the server sends text frames unexpectedly
				console.warn('Received text frame, expected binary', event.data);
			}
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

	private handleBinaryMessage(buffer: ArrayBuffer) {
		const view = new DataView(buffer);
		let offset = 0;

		// 1. Read JSON Length (4 bytes)
		if (view.byteLength < 4) return;
		const jsonLen = view.getUint32(offset, false); // big-endian
		offset += 4;

		// 2. Read JSON Payload
		if (view.byteLength < offset + jsonLen) return;
		const jsonBytes = new Uint8Array(buffer, offset, jsonLen);
		offset += jsonLen;

		const textDecoder = new TextDecoder('utf-8');
		const jsonStr = textDecoder.decode(jsonBytes);

		let jsonData: any;
		try {
			jsonData = JSON.parse(jsonStr);
		} catch (e) {
			console.error('Failed to parse JSON from binary message', e);
			return;
		}

		// Handle heartbeat pong internally
		if (jsonData && (jsonData === 'pong' || jsonData.event === 'pong')) {
			return;
		}

		// 3. Read Blobs
		const blobs: Blob[] = [];
		while (offset < view.byteLength) {
			// Read Blob Length (4 bytes)
			if (offset + 4 > view.byteLength) break;
			const blobLen = view.getUint32(offset, false);
			offset += 4;

			// Read Blob Data
			if (offset + blobLen > view.byteLength) break;
			const blobData = buffer.slice(offset, offset + blobLen);
			blobs.push(new Blob([blobData]));
			offset += blobLen;
		}

		const message: BinaryMessage = {
			json: jsonData,
			blobs: blobs
		};

		this.listeners.forEach((listener) => listener(message));
	}

	private startHeartbeat() {
		if (this.heartbeatIntervalMs <= 0) return;
		this.stopHeartbeat();

		this.heartbeatIntervalId = window.setInterval(() => {
			this.send({ event: 'ping' });
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

	/**
	 * Sends data as JSON UTF-8 bytes.
	 */
	send(data: any) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const jsonStr = JSON.stringify(data);
			const encoder = new TextEncoder();
			const bytes = encoder.encode(jsonStr);
			this.ws.send(bytes);
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
