// ==========================================
// 1. CONFIGURACIÓN Y CREDENCIALES
// ==========================================
const SUPABASE_URL = "https://zjzogdkwclytoopphrfv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rk7M4..."; // Tu clave Publishable completa

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// COORDENADAS DEL TALLER Y RADIO DE TOLERANCIA
const TALLER_LAT = 40.74184370647294; // Sustituye por la latitud exacta de tu taller
const TALLER_LON = -4.0553354232072465; // Sustituye por la longitud exacta de tu taller
const RADIO_MAX_METROS = 80; // Margen en metros para naves o interiores

let currentUser = null;
let sesionActiva = null;

// ==========================================
// 2. REFERENCIAS AL DOM
// ==========================================
const authSection = document.getElementById('authSection');
const dashboardSection = document.getElementById('dashboardSection');
const logoutBtn = document.getElementById('logoutBtn');
const authMsg = document.getElementById('authMsg');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const nombreInput = document.getElementById('nombreInput');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');

const estadoInsignia = document.getElementById('estadoInsignia');
const fichajeStatusText = document.getElementById('fichajeStatusText');
const listaPresentes = document.getElementById('listaPresentes');
const contadorPresentes = document.getElementById('contadorPresentes');

// ==========================================
// 3. MATEMÁTICA Y GEOLOCALIZACIÓN (HAVERSINE)
// ==========================================
function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function validarUbicacionTaller() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Tu navegador no soporta geolocalización.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = calcularDistanciaMetros(pos.coords.latitude, pos.coords.longitude, TALLER_LAT, TALLER_LON);
        if (dist <= RADIO_MAX_METROS) {
          resolve(dist);
        } else {
          reject(`Estás a ${Math.round(dist)} m del taller. Debes estar a menos de ${RADIO_MAX_METROS} m.`);
        }
      },
      (err) => {
        let msg = "No se pudo obtener la posición.";
        if (err.code === 1) msg = "Permiso de ubicación denegado por el usuario.";
        reject(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ==========================================
// 4. FLUJO DE DISPARO POR NFC
// ==========================================
async function procesarDisparoNFC() {
  const params = new URLSearchParams(window.location.search);
  
  // Si la URL contiene ?action=nfc ejecuta el fichaje automático
  if (params.get('action') === 'nfc') {
    estadoInsignia.className = "badge-status procesando";
    estadoInsignia.textContent = "Verificando GPS...";
    fichajeStatusText.textContent = "Comprobando que estás dentro del taller...";

    try {
      await validarUbicacionTaller();
      fichajeStatusText.textContent = "Ubicación verificada. Registrando...";
      await alternarFichaje();
    } catch (errorGps) {
      alert("⛔ Error de presencia: " + errorGps);
      fichajeStatusText.textContent = "Acceso denegado: no estás en el taller.";
      actualizarEstadoVisual();
    } finally {
      // Limpiar el parámetro de la barra para evitar re-fichajes accidentales al recargar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

async function alternarFichaje() {
  if (sesionActiva) {
    // Salida
    const salidaDate = new Date();
    const entradaDate = new Date(sesionActiva.entrada);
    const min = Math.round((salidaDate - entradaDate) / 60000);

    await supabaseClient
      .from('fichajes')
      .update({
        salida: salidaDate.toISOString(),
        duracion_minutos: min,
        en_taller: false
      })
      .eq('id', sesionActiva.id);
  } else {
    // Entrada
    await supabaseClient
      .from('fichajes')
      .insert([{ user_id: currentUser.id, en_taller: true }]);
  }

  await cargarEstadoActual();
  await cargarMiembrosEnTaller();
}

// ==========================================
// 5. ESTADO Y VISTAS
// ==========================================
async function initApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    mostrarDashboard();
  } else {
    mostrarAuth();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      currentUser = session.user;
      mostrarDashboard();
    } else {
      currentUser = null;
      mostrarAuth();
    }
  });
}

function mostrarAuth() {
  authSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  authMsg.textContent = '';
}

async function mostrarDashboard() {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  
  await cargarEstadoActual();
  await cargarMiembrosEnTaller();
  await procesarDisparoNFC();
}

async function cargarEstadoActual() {
  if (!currentUser) return;

  const { data } = await supabaseClient
    .from('fichajes')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('en_taller', true)
    .order('entrada', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    sesionActiva = data[0];
  } else {
    sesionActiva = null;
  }
  actualizarEstadoVisual();
}

function actualizarEstadoVisual() {
  if (sesionActiva) {
    const hora = new Date(sesionActiva.entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    estadoInsignia.className = "badge-status dentro";
    estadoInsignia.textContent = "Dentro del Taller ✅";
    fichajeStatusText.textContent = `Registrado desde las ${hora}. Acerca el móvil al NFC para salir.`;
  } else {
    estadoInsignia.className = "badge-status fuera";
    estadoInsignia.textContent = "Fuera del Taller ⛔";
    fichajeStatusText.textContent = "Acerca el móvil a la pegatina NFC del taller para entrar.";
  }
}

// ==========================================
// 6. AUTENTICACIÓN
// ==========================================
registerBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const nombre = nombreInput.value.trim();

  if (!email || !password || !nombre) {
    authMsg.textContent = "Rellena correo, contraseña y nombre.";
    return;
  }

  authMsg.textContent = "Creando cuenta...";
  registerBtn.disabled = true;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    authMsg.textContent = error.message;
    registerBtn.disabled = false;
    return;
  }

  if (data.user) {
    await supabaseClient.from('profiles').insert([{ id: data.user.id, nombre, rol: 'Mecánico / Piloto' }]);
  }
  registerBtn.disabled = false;
});

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  authMsg.textContent = "Iniciando sesión...";
  loginBtn.disabled = true;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    authMsg.textContent = "Credenciales incorrectas.";
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// ==========================================
// 7. OCUPACIÓN EN TIEMPO REAL
// ==========================================
async function cargarMiembrosEnTaller() {
  const { data } = await supabaseClient
    .from('fichajes')
    .select('entrada, profiles(nombre, rol)')
    .eq('en_taller', true);

  listaPresentes.innerHTML = '';
  if (!data || data.length === 0) {
    contadorPresentes.textContent = "0 personas";
    listaPresentes.innerHTML = '<li class="member-empty">Nadie fichado en este momento.</li>';
    return;
  }

  contadorPresentes.textContent = `${data.length} ${data.length === 1 ? 'persona' : 'personas'}`;
  data.forEach(item => {
    const hora = new Date(item.entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const li = document.createElement('li');
    li.className = 'member-item';
    li.innerHTML = `
      <div>
        <p class="member-name">${item.profiles?.nombre || 'Miembro'}</p>
        <p class="member-role">${item.profiles?.rol || 'UPMKRT'}</p>
      </div>
      <span class="member-time">Entró ${hora}</span>
    `;
    listaPresentes.appendChild(li);
  });
}

initApp();