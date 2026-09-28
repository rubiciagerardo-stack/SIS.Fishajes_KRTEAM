// ==========================================
// 1. CONFIGURACIÓN Y CREDENCIALES
// ==========================================
const SUPABASE_URL = "https://zjzogdkwclytoopphrfv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rk7M4cbOMMgUEb7v83uSYQ_Uz9eBMVs"; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Token grabado en la pegatina NFC
const TOKEN_NFC_VALIDO = "UPMKRT_TALLER_2026";

// Coordenadas del taller y tolerancia
const TALLER_LAT = 0; 
const TALLER_LON = 0; 
const RADIO_MAX_METROS = 80;

let currentUser = null;
let sesionActiva = null;

// Elementos DOM
const bloqueBloqueo = document.getElementById('bloqueBloqueo');
const authSection = document.getElementById('authSection');
const fichajeSection = document.getElementById('fichajeSection');
const estadoInsignia = document.getElementById('estadoInsignia');
const fichajeStatusText = document.getElementById('fichajeStatusText');
const authMsg = document.getElementById('authMsg');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const nombreInput = document.getElementById('nombreInput');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');

// ==========================================
// 2. CÁLCULO HAVERSINE Y GPS
// ==========================================
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function validarUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject("Tu navegador no soporta geolocalización.");
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
        const dist = calcularDistancia(userLat, userLon, TALLER_LAT, TALLER_LON);

        console.log(`Tu ubicación actual: Lat ${userLat}, Lon ${userLon}`);
        console.log(`Coordenadas objetivo: Lat ${TALLER_LAT}, Lon ${TALLER_LON}`);
        console.log(`Distancia calculada: ${Math.round(dist)} metros (Límite: ${RADIO_MAX_METROS} m)`);

        if (dist <= RADIO_MAX_METROS) {
          resolve(dist);
        } else {
          // RECHAZO ESTRICTO: Fuera del radio
          reject(`Estás a ${Math.round(dist)} m del taller. Debes estar a menos de ${RADIO_MAX_METROS} m para fichar.`);
        }
      },
      (err) => {
        let msg = "No se pudo obtener la posición GPS.";
        if (err.code === 1) msg = "Permiso de ubicación denegado en el navegador.";
        if (err.code === 2) msg = "Ubicación o GPS desactivado en tu dispositivo.";
        if (err.code === 3) msg = "Tiempo de espera de GPS agotado.";
        console.error("Error Geolocation:", err);
        reject(msg);
      },
      { 
        enableHighAccuracy: true, // Forzar lectura real del sensor
        timeout: 10000, 
        maximumAge: 0            // No usar lecturas guardadas en caché
      }
    );
  });
}

async function mostrarPantallaFichaje() {
  bloqueBloqueo.classList.add('hidden');
  authSection.classList.add('hidden');
  fichajeSection.classList.remove('hidden');

  estadoInsignia.className = "badge-status procesando";
  estadoInsignia.textContent = "Comprobando Ubicación GPS...";
  fichajeStatusText.textContent = "Calculando distancia al taller...";

  try {
    const dist = await validarUbicacion();
    
    // Solo si la distancia fue aprobada procede aquí
    fichajeStatusText.textContent = `Ubicación verificada (${Math.round(dist)} m). Registrando fichaje...`;
    await procesarEntradaSalida();
  } catch (errGps) {
    // Si falla o estás fuera, SE DETIENE AQUÍ Y NO TOCA SUPABASE
    console.warn("Fichaje bloqueado por ubicación:", errGps);
    estadoInsignia.className = "badge-status fuera";
    estadoInsignia.textContent = "Fichaje Denegado ⛔";
    fichajeStatusText.textContent = errGps;
    alert("⛔ " + errGps);
  }
}

// ==========================================
// 3. CONTROL DE ACCESO NFC Y FLUJO
// ==========================================
async function iniciarFlujoNFC() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  // Si no trae el token de la pegatina, acceso denegado
  if (token !== TOKEN_NFC_VALIDO) {
    bloqueBloqueo.classList.remove('hidden');
    authSection.classList.add('hidden');
    fichajeSection.classList.add('hidden');
    return;
  }

  // Comprobar autenticación
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    mostrarPantallaFichaje();
  } else {
    mostrarAuth();
  }
}

function mostrarAuth() {
  bloqueBloqueo.classList.add('hidden');
  authSection.classList.remove('hidden');
  fichajeSection.classList.add('hidden');
}

async function mostrarPantallaFichaje() {
  bloqueBloqueo.classList.add('hidden');
  authSection.classList.add('hidden');
  fichajeSection.classList.remove('hidden');

  estadoInsignia.className = "badge-status procesando";
  estadoInsignia.textContent = "Comprobando Ubicación GPS...";
  fichajeStatusText.textContent = "Verificando que estás físicamente en el taller...";

  try {
    const dist = await validarUbicacion();
    fichajeStatusText.textContent = `Ubicación correcta (${Math.round(dist)} m). Fichando...`;
    await procesarEntradaSalida();
  } catch (errGps) {
    estadoInsignia.className = "badge-status fuera";
    estadoInsignia.textContent = "Fichaje Denegado ⛔";
    fichajeStatusText.textContent = errGps;
  }
}

async function procesarEntradaSalida() {
  // Comprobar si ya estaba dentro
  const { data } = await supabaseClient
    .from('fichajes')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('en_taller', true)
    .order('entrada', { ascending: false })
    .limit(1);

  sesionActiva = (data && data.length > 0) ? data[0] : null;

  if (sesionActiva) {
    // Marcar salida
    const salidaDate = new Date();
    const entradaDate = new Date(sesionActiva.entrada);
    const min = Math.round((salidaDate - entradaDate) / 60000);

    await supabaseClient
      .from('fichajes')
      .update({ salida: salidaDate.toISOString(), duracion_minutos: min, en_taller: false })
      .eq('id', sesionActiva.id);

    estadoInsignia.className = "badge-status fuera";
    estadoInsignia.textContent = "Salida Registrada 🚪";
    fichajeStatusText.textContent = `Has salido del taller. Tiempo total: ${min} minutos.`;
  } else {
    // Marcar entrada
    await supabaseClient
      .from('fichajes')
      .insert([{ user_id: currentUser.id, en_taller: true }]);

    const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    estadoInsignia.className = "badge-status dentro";
    estadoInsignia.textContent = "Entrada Registrada ✅";
    fichajeStatusText.textContent = `¡Bienvenido al taller! Fichado a las ${hora}.`;
  }
}

// ==========================================
// 4. EVENTOS DE LOGIN Y REGISTRO
// ==========================================
loginBtn.addEventListener('click', async () => {
  authMsg.textContent = "Verificando credenciales...";
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });
  if (error) {
    authMsg.textContent = "Credenciales incorrectas.";
  } else {
    currentUser = data.user;
    mostrarPantallaFichaje();
  }
});

registerBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const nombre = nombreInput.value.trim();

  if (!email || !password || !nombre) {
    authMsg.textContent = "Rellena todos los campos.";
    return;
  }

  authMsg.textContent = "Creando cuenta...";
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    authMsg.textContent = error.message;
    return;
  }

  if (data.user) {
    await supabaseClient.from('profiles').insert([{ id: data.user.id, nombre, rol: 'Miembro UPMKRT' }]);
    currentUser = data.user;
    mostrarPantallaFichaje();
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.reload();
});

iniciarFlujoNFC();
