/* =========================================================
   Bassline — genera js/config.js a partir de .env
   Uso:  node build-config.mjs
   Ejecútalo cada vez que cambies .env (y antes de subir la web).
   ========================================================= */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ENV_FILE = new URL('./.env', import.meta.url);
const OUT_FILE = new URL('./js/config.js', import.meta.url);

if (!existsSync(ENV_FILE)) {
  console.error('✖ No encuentro .env. Copia .env.example como .env y rellénalo.');
  process.exit(1);
}

// --- Lee .env (formato CLAVE=valor; ignora líneas vacías y comentarios) ---
const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('✖ Faltan SUPABASE_URL o SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

// --- Seguridad: esta clave acaba en el navegador, así que solo vale la "anon" ---
try {
  const payload = JSON.parse(Buffer.from(SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString());
  if (payload.role && payload.role !== 'anon') {
    console.error(`✖ La clave tiene rol "${payload.role}". Usa la clave anon: nunca publiques la service_role.`);
    process.exit(1);
  }
} catch {
  if (/^sb_secret_/.test(SUPABASE_ANON_KEY)) {
    console.error('✖ Eso es una clave secreta (sb_secret_…). Usa la publishable/anon.');
    process.exit(1);
  }
}

// --- Escribe js/config.js (lo carga index.html antes de main.js) ---
const config = { SUPABASE_URL, SUPABASE_ANON_KEY };
writeFileSync(OUT_FILE,
  '/* Generado por build-config.mjs a partir de .env — no lo edites a mano. */\n' +
  `window.BASSLINE_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('✔ js/config.js generado');
