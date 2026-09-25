import { copyScene, sceneFrames, type VideoScene } from './videoScene';
export type { VideoLayout, VideoPosition, VideoScene } from './videoScene';

/** One persistent output track. Editing Preview never changes the Program scene. */
export class RoomVideoProgram {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private videos = new Map<string, HTMLVideoElement>();
  private scene: VideoScene = { layout: 'full', sourceIds: [] };
  private transition: { previous: VideoScene; start: number; duration: number } | null = null;
  private timer: ReturnType<typeof setInterval>;
  private output: MediaStream;
  private disposed = false;

  constructor(private readonly isPreview = false) {
    this.canvas.width = 1280; this.canvas.height = 720;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Composition vidéo indisponible.');
    this.context = context;
    this.draw();
    this.output = this.canvas.captureStream(30);
    this.timer = setInterval(() => this.draw(), 1000 / 30);
  }
  get stream() { return this.output; }
  get program(): VideoScene { return copyScene(this.scene); }
  async add(id: string, stream: MediaStream) {
    if (this.disposed) throw new Error('Production fermée.');
    this.remove(id);
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    this.videos.set(id, video);
    try { await video.play(); }
    catch (error) { this.remove(id); throw error; }
  }
  remove(id: string) {
    const video = this.videos.get(id);
    if (video) { video.pause(); video.srcObject = null; this.videos.delete(id); }
  }
  clear() {
    [...this.videos.keys()].forEach((id) => this.remove(id));
    this.blank();
  }
  blank() {
    this.scene = { layout: 'full', sourceIds: [] }; this.transition = null;
    this.draw();
  }
  take(scene: VideoScene, duration = 0) {
    if (this.disposed) throw new Error('Production fermée.');
    const selected = scene.sourceIds.map((id) => this.videos.has(id) ? id : '');
    const frames = sceneFrames(scene);
    const count = selected.slice(0, frames.length).filter(Boolean).length;
    if (!count && !this.isPreview) throw new Error('Choisis une source vidéo disponible.');
    if (!this.isPreview && (scene.layout === 'split' || scene.layout === 'pip') && (!selected[0] || !selected[1])) {
      throw new Error('Ajoute et sélectionne deux sources pour cette disposition.');
    }
    this.transition = duration > 0 ? { previous: this.program, start: performance.now(), duration } : null;
    this.scene = copyScene({ ...scene, sourceIds: selected });
    this.draw();
  }
  private renderScene(scene: VideoScene, opacity: number) {
    const { context: ctx } = this;
    ctx.globalAlpha = opacity;
    const frames = sceneFrames(scene);
    for (let index = 0; index < frames.length; index++) {
      const video = this.videos.get(scene.sourceIds[index]);
      const frame = frames[index];
      const x = Math.round(frame.x * 1280), y = Math.round(frame.y * 720);
      const w = Math.round(frame.width * 1280), h = Math.round(frame.height * 720);
      if (!video && scene.layout === 'free' && !this.isPreview) continue;
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight
        || !(video.srcObject as MediaStream | null)?.getVideoTracks().some((track) => track.readyState === 'live')) {
        if (this.isPreview) {
          ctx.fillStyle = '#14161c'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
          ctx.fillStyle = '#a3a7b5'; ctx.font = '500 22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(video ? 'Signal indisponible' : `Source ${String.fromCharCode(65 + index)} · à ajouter`, x + w / 2, y + h / 2);
        }
        continue;
      }
      if (scene.fits?.[index] === 'cover') {
        const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
        const sw = w / scale, sh = h / scale;
        ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, x, y, w, h);
      } else {
        const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
        const vw = video.videoWidth * scale, vh = video.videoHeight * scale;
        ctx.drawImage(video, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh);
      }
    }
    ctx.globalAlpha = 1;
  }
  private draw() {
    const ctx = this.context;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720);
    if (this.transition) {
      const progress = Math.min(1, (performance.now() - this.transition.start) / this.transition.duration);
      this.renderScene(this.transition.previous, 1);
      this.renderScene(this.scene, progress);
      if (progress >= 1) this.transition = null;
    } else this.renderScene(this.scene, 1);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.output.getTracks().forEach((track) => track.stop());
    [...this.videos.keys()].forEach((id) => this.remove(id));
    this.scene = { layout: 'full', sourceIds: [] }; this.transition = null;
  }
}
