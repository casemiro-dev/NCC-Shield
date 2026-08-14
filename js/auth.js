async function getCurrentUser() {
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session ? session.user : null;
  } catch (e) {
    return null;
  }
}

async function guardPage() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace('login.html');
    return null;
  }
  return user;
}

async function logout() {
  try {
    if (supabaseClient) await supabaseClient.auth.signOut({ scope: 'local' });
  } catch (e) {
    // continua o logout local mesmo se a rede falhar
  }
  try {
    const chave = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    localStorage.removeItem(chave);
    sessionStorage.removeItem(chave);
  } catch (e) {}
  window.location.replace('login.html');
}

function setupLogout() {
  const btn = document.getElementById('btn-sair');
  if (btn) btn.addEventListener('click', logout);
}

async function getProfile(userId) {
  try {
    const { data } = await supabaseClient.rpc('get_meu_perfil');
    if (data && data.length) return data[0];
  } catch (e) {}
  try {
    const { data } = await supabaseClient
      .from('profiles')
      .select('nome')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  } catch (e) {
    return null;
  }
}