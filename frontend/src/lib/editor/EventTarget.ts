export type EventMap = Record<string, { type: string } & Record<string, any>>;

export type Listener<T> = (event: T) => void;

export class EventTarget<M extends EventMap> {
	private _listeners = new Map<keyof M, Set<Listener<any>>>();

	public addEventListener<K extends keyof M>(
		type: K,
		listener: Listener<M[K]>
	): void {
		let listeners = this._listeners.get(type);
		if (!listeners) {
			listeners = new Set();
			this._listeners.set(type, listeners);
		}
		listeners.add(listener);
	}

	public removeEventListener<K extends keyof M>(
		type: K,
		listener: Listener<M[K]>
	): void {
		const listeners = this._listeners.get(type);
		if (listeners) {
			listeners.delete(listener);
		}
	}

	public dispatchEvent<K extends keyof M>(event: M[K]): void {
		const listeners = this._listeners.get(event.type);
		if (listeners) {
			listeners.forEach((listener) => listener(event));
		}
	}
}
