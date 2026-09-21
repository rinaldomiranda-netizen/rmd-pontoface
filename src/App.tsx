import React from 'react';
import { supabase } from './lib/supabaseClient';
import EmployeePunch from './pages/EmployeePunch';
import AdminAuth from './pages/AdminAuth';
import AdminDashboard from './pages/AdminDashboard';

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
  const isAdmin = location.pathname.startsWith('/admin');
  return isAdmin ? <AdminApp /> : <EmployeePunch />;
}

export default App;
