import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { configuracionCompleta } from './firebase';
import { AceptarInvitacion, SinAcceso, VerificarCorreo } from './paginas/acceso/EstadosSesion';
import { Login } from './paginas/acceso/Login';
import { PantallaAcceso } from './paginas/acceso/PantallaAcceso';
import { Avisos } from './paginas/Avisos';
import { Comunas } from './paginas/Comunas';
import { Dashboard } from './paginas/Dashboard';
import { Denuncias } from './paginas/Denuncias';
import { DetalleReporte } from './paginas/DetalleReporte';
import { Emergencias } from './paginas/Emergencias';
import { Mapa } from './paginas/Mapa';
import { Reportes } from './paginas/Reportes';
import { Usuarios } from './paginas/Usuarios';
import { SesionProvider, useFuncionario, useSesion } from './sesion/SesionContext';
import { puedeAdministrarUsuarios, puedeGestionar, type Rol } from './tipos';

export default function App() {
  if (!configuracionCompleta) {
    return (
      <PantallaAcceso titulo="Falta configurar Firebase">
        <p>Crea <code>panel-web/.env.local</code> a partir de <code>.env.example</code> y reinicia.</p>
      </PantallaAcceso>
    );
  }
  return (
    <SesionProvider>
      <BrowserRouter>
        <Enrutador />
      </BrowserRouter>
    </SesionProvider>
  );
}

function Enrutador() {
  const { estado } = useSesion();

  switch (estado.tipo) {
    case 'cargando':
      return <div className="cargando-pantalla">Cargando…</div>;
    case 'sinSesion':
      return <Login />;
    case 'sinVerificar':
      return <VerificarCorreo usuario={estado.usuario} />;
    case 'invitado':
      return <AceptarInvitacion usuario={estado.usuario} invitacion={estado.invitacion} />;
    case 'sinAcceso':
      return <SinAcceso usuario={estado.usuario} />;
    case 'desactivado':
      return <SinAcceso usuario={estado.usuario} desactivado />;
    case 'activo':
      return (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<InicioSegunRol />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="reportes/:id" element={<DetalleReporte />} />
            <Route path="mapa" element={<Mapa />} />
            <Route path="avisos" element={<SoloRoles permitido={(r) => r !== 'CUADRILLA'}><Avisos /></SoloRoles>} />
            <Route path="emergencias" element={<SoloRoles permitido={(r) => r !== 'CUADRILLA'}><Emergencias /></SoloRoles>} />
            <Route path="denuncias" element={<SoloRoles permitido={puedeGestionar}><Denuncias /></SoloRoles>} />
            <Route path="usuarios" element={<SoloRoles permitido={puedeAdministrarUsuarios}><Usuarios /></SoloRoles>} />
            <Route path="comunas" element={<SoloRoles permitido={(r) => r === 'SUPERADMIN'}><Comunas /></SoloRoles>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
  }
}

/** La cuadrilla parte en sus trabajos asignados; el resto, en el dashboard. */
function InicioSegunRol() {
  const { rol } = useFuncionario();
  return rol === 'CUADRILLA' ? <Navigate to="/reportes" replace /> : <Dashboard />;
}

/** Oculta páginas a roles sin permiso (las reglas de Firestore igual lo impedirían). */
function SoloRoles({ permitido, children }: { permitido: (rol: Rol) => boolean; children: ReactNode }) {
  const { rol } = useFuncionario();
  return permitido(rol) ? children : <Navigate to="/" replace />;
}
