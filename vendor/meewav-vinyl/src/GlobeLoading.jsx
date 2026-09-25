import React, { PureComponent } from 'react';
import Vinyl from './components/Vinyl.jsx';
import './globe-loading.css';

// Uses the supplied rotor animation, independent of the WebGL frame loop.
export default class GlobeLoading extends PureComponent {
  state = { reducedMotion: typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches };
  media = null;

  componentDidMount() {
    this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.media.addEventListener('change', this.onMotionChange);
    this.onMotionChange();
  }

  componentWillUnmount() {
    this.media?.removeEventListener('change', this.onMotionChange);
  }

  onMotionChange = () => this.setState({ reducedMotion: this.media.matches });

  render() {
    return <div className="meewav-vinyl-loading" role="status" aria-live="polite">
      <div className="meewav-vinyl-loading__artwork" aria-hidden="true">
        <Vinyl playing interactive={false} reducedMotion={this.state.reducedMotion} />
      </div>
      <p className="meewav-vinyl-loading__text">{this.props.label ?? 'Chargement du globe…'}</p>
    </div>;
  }
}
