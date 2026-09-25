export function createTerritoryFocus(reducedMotion = false) {
  return {
    cityCode: null, quarterId: null, revision: 0, progress: 1, previousProgress: 1,
    strength: 0, fromStrength: 0, targetStrength: 0,
    flightTerritoryId: null, flightSettling: false,
    setFlightTerritory(id) {
      const next = id || null;
      const changed = next !== this.flightTerritoryId || this.flightSettling;
      this.flightTerritoryId = next;
      this.flightSettling = false;
      return changed;
    },
    get flightHighlight() {
      if (!this.flightTerritoryId) return 0;
      return this.flightSettling ? 1 - this.progress ** 2 * (3 - 2 * this.progress) : 1;
    },
    set(destination, immediate = false) {
      const cityCode = destination?.cityCode || null, quarterId = destination?.quarterId || null;
      const destinationId = quarterId || (cityCode ? `fr-commune-${cityCode}` : null);
      if (this.flightTerritoryId === destinationId && destinationId) this.flightSettling = true;
      else this.setFlightTerritory(null);
      if (cityCode === this.cityCode && quarterId === this.quarterId && (!immediate || this.progress === 1)) return;
      this.previousProgress = this.progress;
      this.fromStrength = this.strength;
      this.cityCode = cityCode; this.quarterId = quarterId;
      this.targetStrength = cityCode || quarterId ? 1 : 0;
      this.progress = reducedMotion || immediate ? 1 : 0;
      if (reducedMotion || immediate) this.strength = this.targetStrength;
      this.revision++;
    },
    tick(dt) {
      if (this.progress >= 1) return this.flightSettling ? this.setFlightTerritory(null) : false;
      this.progress = Math.min(1, this.progress + Math.min(dt, 0.05) / 0.65);
      const t = this.progress * this.progress * (3 - 2 * this.progress);
      this.strength = this.fromStrength + (this.targetStrength - this.fromStrength) * t;
      if (this.progress === 1 && this.flightSettling) this.setFlightTerritory(null);
      return true;
    },
    brightness(feature) {
      if (!this.cityCode && !this.quarterId) return 1;
      if (this.quarterId) return feature.id === this.quarterId ? 1 : 0;
      const p = feature.properties;
      const code = p.cityCode || (feature.id?.startsWith('fr-paris-') ? '75056' :
        p.kind === 'commune' ? p.code || feature.id?.replace('fr-commune-', '') : null);
      return code === this.cityCode ? 1 : 0;
    },
  };
}
