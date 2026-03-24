/**
 * Configuración de cliente Supabase para BarClick
 */

const SUPABASE_URL = 'https://yhipgvlxrwesmyralizs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloaXBndmx4cndlc215cmFsaXpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTI3NzksImV4cCI6MjA4OTk2ODc3OX0.IkpazU-XM7oRf5cNYB1luSK16-hf13qzYe-UdtFHBCM';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('CRÍTICO: Las credenciales de Supabase no han sido configuradas.');
}

// Crear instancia evitando colisión de nombres con el objeto global 'supabase'
const clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso global
window.supabaseClient = clientInstance;
