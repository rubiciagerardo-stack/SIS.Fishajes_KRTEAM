const SUPABASE_URL = "https://zjzogdkwclytoopphrfv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rk7M4cbOMMgUEb7v83uSYQ_Uz9eBMVs"; // Tu clave anon legacy

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const listaPresentes = document.getElementById('listaPresentes');
const contadorPresentes = document.getElementById('contadorPresentes');

async function actualizarTablon() {
  const { data, error } = await supabaseClient
    .from('fichajes')
    .select('entrada, profiles(nombre, rol)')
    .eq('en_taller', true);

  if (error || !data || data.length === 0) {
    contadorPresentes.textContent = "0 personas";
    listaPresentes.innerHTML = '<li class="member-empty">No hay nadie en el taller ahora mismo.</li>';
    return;
  }

  contadorPresentes.textContent = `${data.length} ${data.length === 1 ? 'persona' : 'personas'}`;
  listaPresentes.innerHTML = '';

  data.forEach(item => {
    const hora = new Date(item.entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const li = document.createElement('li');
    li.className = 'member-item';
    li.innerHTML = `
      <div>
        <p class="member-name">${item.profiles?.nombre || 'Miembro'}</p>
        <p class="member-role">${item.profiles?.rol || 'UPMKRT'}</p>
      </div>
      <span class="member-time">Entró a las ${hora}</span>
    `;
    listaPresentes.appendChild(li);
  });
}

actualizarTablon();
// Auto-refresco cada 30 segundos
setInterval(actualizarTablon, 30000);
