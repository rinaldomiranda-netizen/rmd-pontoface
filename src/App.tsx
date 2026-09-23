import React from 'react';
import { supabase } from './lib/supabaseClient';
import EmployeePunch from './pages/EmployeePunch';
import EmployeePunchBalance from './pages/EmployeePunchBalance';
import AdminAuth from './pages/AdminAuth';
import AdminDashboard from './pages/AdminDashboard';
import PlatformAdmin from './pages/PlatformAdmin';
import ClaimInvite from './pages/ClaimInvite';

function MainPortal() {
  return (
    <main className="portal-page">
      <section className="portal-shell" aria-labelledby="portal-title">
        <div className="portal-eyebrow">RMD PontoFace</div>
        <h1 id="portal-title">Acesse seu ambiente</h1>
        <p className="portal-subtitle">
          Escolha a área correspondente ao seu acesso.
        </p>

        <div className="portal-options">
          <a className="portal-option portal-option-primary" href="/entrar">
            <span className="portal-option-label">ENTRAR</span>
            <span>Acesso direto ao sistema</span>
          </a>
          <a className="portal-option" href="/rmd">
            <span className="portal-option-label">RMD</span>
            <span>Administração da plataforma</span>
          </a>
          <a className="portal-option" href="/admin">
            <span className="portal-option-label">EMPRESA</span>
            <span>Gestão da operação e dos funcionários</span>
          </a>
          <div className="portal-option portal-option-disabled">
            <span className="portal-option-label">FUNCIONÁRIO</span>
            <span>Acesse pelo link individual recebido da empresa</span>
          </div>
        </div>

        <p className="portal-footer">Acesso seguro para cada ambiente.</p>
      </section>
    </main>
  );
}

function AdminApp() {
  const [membership, setMembership] = React.useState<{ companyId: string; role: string } | null | undefined>(undefined);

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) setMembership(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setMembership(null);
  }

  if (!membership) {
    return <AdminAuth onReady={(companyId, role) => setMembership({ companyId, role })} />;
  }
  return <AdminDashboard companyId={membership.companyId} role={membership.role} onLogout={logout} />;
}

function App() {
  const path = location.pathname;
  if (path === '/entrar' || path === '/entrar/') return <AdminApp />;
  if (path.startsWith('/rmd')) return <PlatformAdmin />;
  if (path.startsWith('/convite')) return <ClaimInvite />;
  if (path.startsWith('/admin')) return <AdminApp />;
  if (path.startsWith('/funcionario/')) return <EmployeePunchBalance />;
  return <MainPortal />;
}

export default App;
