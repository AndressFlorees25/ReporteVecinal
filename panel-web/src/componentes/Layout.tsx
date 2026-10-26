import { signOut } from 'firebase/auth';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import { ROLES, puedeAdministrarUsuarios, puedeGestionar, type Rol } from '../tipos';

interface ItemMenu {
  ruta: string;
  texto: string;
  icono: string;
  visible: (rol: Rol) => boolean;
}

const MENU: ItemMenu[] = [
  { ruta: '/', texto: 'Dashboard', icono: '📊', visible: (rol) => rol !== 'CUADRILLA' },
  { ruta: '/reportes', texto: 'Reportes', icono: '📋', visible: (rol) => rol !== 'CUADRILLA' },
  { ruta: '/reportes', texto: 'Mis trabajos', icono: '👷', visible: (rol) => rol === 'CUADRILLA' },
  { ruta: '/emergencias', texto: 'Emergencias', icono: '🚨', visible: (rol) => rol !== 'CUADRILLA' },
  { ruta: '/avisos', texto: 'Avisos', icono: '📢', visible: (rol) => rol !== 'CUADRILLA' },
  { ruta: '/mapa', texto: 'Mapa', icono: '🗺️', visible: () => true },
  { ruta: '/denuncias', texto: 'Denuncias', icono: '🚩', visible: puedeGestionar },
  { ruta: '/usuarios', texto: 'Usuarios', icono: '👥', visible: puedeAdministrarUsuarios },
  { ruta: '/comunas', texto: 'Comunas', icono: '🏛️', visible: (rol) => rol === 'SUPERADMIN' },
];

export function Layout() {
  const funcionario = useFuncionario();
  const { comunas, comunaId, setComunaId } = useSesion();
  const comuna = comunas.find((c) => c.id === comunaId);
  // La página de comunas debe funcionar aunque todavía no exista ninguna.
  const enComunas = useLocation().pathname.startsWith('/comunas');

  return (
    <div className="layout">
      <aside className="barra-lateral">
        <div className="marca">
          <span className="marca-icono" aria-hidden>📍</span>
          <div>
            <strong>Reporte Vecinal</strong>
            <span>Panel municipal</span>
          </div>
        </div>

        {funcionario.rol === 'SUPERADMIN' ? (
          <label className="selector-comuna">
            Comuna
            <select value={comunaId ?? ''} onChange={(e) => setComunaId(e.target.value)}>
              {comunas.length === 0 && <option value="">Sin comunas</option>}
              {comunas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.activa ? '' : ' (inactiva)'}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="selector-comuna">
            Comuna
            <strong>{comuna?.nombre ?? '…'}</strong>
          </div>
        )}

        <nav>
          {MENU.filter((i) => i.visible(funcionario.rol)).map((i) => (
            <NavLink key={i.texto} to={i.ruta} end={i.ruta === '/'}
              className={({ isActive }) => `item-menu${isActive ? ' activo' : ''}`}>
              <span aria-hidden>{i.icono}</span> {i.texto}
            </NavLink>
          ))}
        </nav>

        <div className="usuario">
          <strong>{funcionario.nombre || funcionario.email}</strong>
          <span>{ROLES[funcionario.rol].nombre}</span>
          <button className="enlace" onClick={() => signOut(auth)}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="contenido">
        {comunaId || enComunas ? <Outlet /> : <SinComunas esSuperadmin={funcionario.rol === 'SUPERADMIN'} />}
      </main>
    </div>
  );
}

function SinComunas({ esSuperadmin }: { esSuperadmin: boolean }) {
  return (
    <div className="vacio">
      <h2>Aún no hay comunas</h2>
      <p>
        {esSuperadmin
          ? 'Crea la primera comuna en «Comunas» para empezar.'
          : 'Tu comuna todavía no está configurada. Contacta al administrador del sistema.'}
      </p>
      {esSuperadmin && <NavLink className="boton primario" to="/comunas">Ir a Comunas</NavLink>}
    </div>
  );
}
