interface Entry<V> { value: V; expiresAt: number; }

export default class TtlCache<V> {
    private _store = new Map<string, Entry<V>>();

    public get (key:string): V | undefined {
        const entry = this._store.get(key)

        if (!entry) return undefined

        if (Date.now() > entry.expiresAt) {
            
        }
    }
}