import type { ReactNode } from 'react';

/** Marco común de las pantallas sin sesión completa (login, verificación, invitación…). */
export function PantallaAcceso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="pantalla-acceso">
      <div className="tarjeta-acceso">
        <div className="marca">
          <span className="marca-icono" aria-hidden>📍</span>
          <div>
            <strong>Reporte Vecinal</strong>
            <span>Panel municipal</span>
          </div>
        </div>
        <h1>{titulo}</h1>
        {children}
      </div>
    </div>
  );
}
