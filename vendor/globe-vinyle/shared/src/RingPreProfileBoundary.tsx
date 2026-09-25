import { Component, type ReactNode } from "react";

// Keep a profile render or lazy-import failure inside the overlay. The WebGL
// canvas and navigation belong to the parent and must remain mounted.
export class RingPreProfileBoundary extends Component<
  { children: ReactNode; onClose: () => void }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="ring-preprofile-error" role="alert">
      <span>Ce pré-profil n’a pas pu s’ouvrir.</span>
      <button type="button" onClick={this.props.onClose}>Fermer</button>
    </div>;
  }
}
