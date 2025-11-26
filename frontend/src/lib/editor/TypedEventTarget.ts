export type EventMap = Record<string, { type: string } & Record<string, any>>;

export type Listener<T> = (event: T) => void;

export class TypedEventTarget<M extends EventMap> {
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
		// We assume event.type matches the key K.
		// In a strict world, we'd validate this, but for now we trust the type system
		// and cast event.type to keyof M for the map lookup.
		const listeners = this._listeners.get(event.type as keyof M);
		if (listeners) {
			listeners.forEach((listener) => listener(event));
		}
	}
}
