import { ArrowRight, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import './room-launch-confirmation.css';

export default function RoomLaunchConfirmation({ title, description, buttonLabel, pending, onLaunch, children, disabled = false }: {
  title: string;
  description: string;
  buttonLabel: string;
  pending: boolean;
  onLaunch: () => Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return <section className="room-launch-confirmation" aria-label="Lancement de la Room">
    <span className="room-launch-confirmation__icon"><Radio aria-hidden="true" /></span>
    <small>LANCEMENT DE LA ROOM</small>
    <h3>{title}</h3>
    <p>{description}</p>
    {children}
    <button type="button" disabled={pending || disabled} onClick={() => void onLaunch()}>
      {pending ? 'Ouverture en cours…' : buttonLabel}<ArrowRight aria-hidden="true" />
    </button>
  </section>;
}
