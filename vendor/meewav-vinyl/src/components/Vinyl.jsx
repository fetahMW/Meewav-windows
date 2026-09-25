import React, { PureComponent, createRef } from 'react';
import { MW_PATH } from './BrandMark.jsx';
import './vinyl.css';
import { BASE_RPM, GROOVES, REVOLUTION_MS, playbackRate, pointerTilt } from '../record-utils.js';

let instanceNumber = 0;

/**
 * Un vinyle autonome, sans image bitmap ni dépendance d'animation.
 * Props : playing, rpm, label, resetKey, reducedMotion, onToggle.
 * Les reflets et le centre métallique restent fixes : seul le disque tourne.
 */
export default class Vinyl extends PureComponent {
  static defaultProps = {
    playing: false,
    rpm: BASE_RPM,
    label: 'Meewav',
    resetKey: 0,
    reducedMotion: false,
    interactive: true,
  };

  rotor = createRef();
  pose = createRef();
  hitArea = createRef();
  animation = null;
  frame = null;
  filterId = `meewav-paper-${++instanceNumber}`;

  componentDidMount() {
    if (this.rotor.current?.animate) {
      this.animation = this.rotor.current.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: REVOLUTION_MS, iterations: Infinity, easing: 'linear' },
      );
      this.animation.pause();
      this.animation.currentTime = 0;
      this.syncAnimation();
    }
    document.addEventListener('visibilitychange', this.syncAnimation);
  }

  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.animation) {
      // Pauser avant de modifier le temps évite un décalage d'une frame.
      this.animation.pause();
      this.animation.playbackRate = playbackRate(this.props.rpm);
      this.animation.currentTime = 0;
      this.clearTilt();
    }
    if (this.props.reducedMotion && !previous.reducedMotion) this.clearTilt();
    this.syncAnimation();
  }

  componentWillUnmount() {
    this.animation?.cancel();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.syncAnimation);
  }

  syncAnimation = () => {
    if (!this.animation) return;
    const rate = playbackRate(this.props.rpm);
    // updatePlaybackRate conserve l'angle courant lors d'un changement de vitesse.
    if (this.animation.playbackRate !== rate) this.animation.updatePlaybackRate(rate);
    const active = this.props.playing && !this.props.reducedMotion && !document.hidden;
    if (active && this.animation.playState !== 'running') this.animation.play();
    if (!active && this.animation.playState !== 'paused') this.animation.pause();
  };

  onPointerMove = (event) => {
    if (this.props.reducedMotion || event.pointerType === 'touch') return;
    const rect = this.hitArea.current?.getBoundingClientRect();
    const tilt = pointerTilt(event.clientX, event.clientY, rect);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.pose.current?.style.setProperty('--tilt-x', `${tilt.x.toFixed(2)}deg`);
      this.pose.current?.style.setProperty('--tilt-y', `${tilt.y.toFixed(2)}deg`);
      this.frame = null;
    });
  };

  clearTilt = () => {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pose.current?.style.setProperty('--tilt-x', '0deg');
    this.pose.current?.style.setProperty('--tilt-y', '0deg');
  };

  render() {
    const { playing, reducedMotion, label, onToggle, className = '', style, interactive } = this.props;
    const isPlaying = playing && !reducedMotion;
    const Disc = interactive ? 'button' : 'div';
    const controls = interactive ? {
      type: 'button', onClick: onToggle,
      'aria-label': isPlaying ? 'Arrêter la rotation du vinyle' : 'Faire tourner le vinyle',
      'aria-pressed': isPlaying, disabled: reducedMotion,
    } : { 'aria-hidden': true };
    return (
      <div className={`vinyl-shell ${className}`} style={style} ref={this.hitArea}
        onPointerMove={interactive ? this.onPointerMove : undefined} onPointerLeave={interactive ? this.clearTilt : undefined}>
        <div className="vinyl-pose" ref={this.pose}>
          <Disc className="vinyl" {...controls}
            data-testid="vinyl">
            <span className="vinyl-base" />
            <span className="vinyl-rotor" ref={this.rotor}>
              <span className="vinyl-microgrooves" />
              <svg className="vinyl-grooves" viewBox="0 0 1000 1000" aria-hidden="true">
                <g fill="none">
                  {GROOVES.map(({ radius, opacity, width }) => (
                    <circle key={radius} cx="500" cy="500" r={radius}
                      stroke="white" strokeWidth={width} opacity={opacity} />
                  ))}
                  {[238, 310, 372, 431, 471].map((r) => (
                    <g key={r}>
                      <circle cx="500" cy="500" r={r} stroke="#030304" strokeWidth="3.5" opacity=".8" />
                      <circle cx="500" cy="500" r={r + 2} stroke="#838383" strokeWidth=".6" opacity=".15" />
                    </g>
                  ))}
                </g>
              </svg>
              <span className="vinyl-runout" />
              <span className="vinyl-label">
                <svg viewBox="0 0 400 400" aria-hidden="true">
                  <defs>
                    <filter id={this.filterId} x="0%" y="0%" width="100%" height="100%">
                      <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch" seed="8" />
                      <feColorMatrix type="saturate" values="0" />
                      <feComponentTransfer><feFuncA type="linear" slope=".18" /></feComponentTransfer>
                      <feComposite in2="SourceGraphic" operator="in" />
                    </filter>
                  </defs>
                  <circle cx="200" cy="200" r="198" fill="#222224" />
                  <circle cx="200" cy="200" r="198" filter={`url(#${this.filterId})`} opacity=".8" />
                  <circle cx="200" cy="200" r="197" fill="none" stroke="#b4b4b4" strokeOpacity=".13" />
                  <circle cx="200" cy="200" r="142" fill="none" stroke="#000" strokeOpacity=".35" />
                  <circle cx="200" cy="200" r="141" fill="none" stroke="#fff" strokeOpacity=".035" />
                  <path d={MW_PATH} transform="translate(118 102) scale(.72)"
                    fill="none" stroke="var(--accent, #a675f5)" strokeWidth="10.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <text x="202" y="289" fill="#f0edf1" textAnchor="middle"
                    fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
                    fontWeight="300" fontSize="36" letterSpacing="3.5">{label}</text>
                </svg>
              </span>
            </span>
            <span className="vinyl-specular" />
            <span className="vinyl-hairlines" />
            <span className="vinyl-edge" />
            <span className="vinyl-spindle" />
          </Disc>
        </div>
      </div>
    );
  }
}
