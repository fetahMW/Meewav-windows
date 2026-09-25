/** Scope local private data without importing authentication into repository factories. */
let scope = "legacy";
export function setScenePrivateScope(value: string) { scope = value; }
export function getScenePrivateScope() { return scope; }
export function scenePrivateKey(key: string, identity = scope) { return identity === "legacy" ? key : `${key}:account:${encodeURIComponent(identity)}`; }
export function scopedSceneStorage(identity = scope): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (typeof window === "undefined") return null;
  return {
    getItem: (key) => window.localStorage.getItem(scenePrivateKey(key, identity)),
    setItem: (key, value) => window.localStorage.setItem(scenePrivateKey(key, identity), value),
    removeItem: (key) => window.localStorage.removeItem(scenePrivateKey(key, identity)),
  };
}
export function scopedSceneRepository<T extends object>(factory: (identity: string) => T): T {
  const repositories = new Map<string, T>();
  return new Proxy({} as T, { get(_target, property) {
    let repository = repositories.get(scope);
    if (!repository) { repository = factory(scope); repositories.set(scope, repository); }
    return Reflect.get(repository, property);
  } });
}
