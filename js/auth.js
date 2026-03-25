/**
 * Gestión de Autenticación para BarClick
 */

const authState = {
    loading: false
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const tabIndicator = document.getElementById('tabIndicator');

    // Inicializar pestañas
    window.switchTab = (tab) => {
        if (tab === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            tabLogin.classList.remove('text-muted');
            tabLogin.classList.add('text-fg');
            tabRegister.classList.remove('text-fg');
            tabRegister.classList.add('text-muted');
            tabIndicator.style.transform = 'translateX(0)';
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            tabLogin.classList.add('text-muted');
            tabLogin.classList.remove('text-fg');
            tabRegister.classList.add('text-fg');
            tabRegister.classList.remove('text-muted');
            tabIndicator.style.transform = 'translateX(calc(100% + 8px))';
        }
    };

    // Toggle Password Visibility
    window.togglePassword = (id) => {
        const input = document.getElementById(id);
        input.type = input.type === 'password' ? 'text' : 'password';
    };

    // Manejar Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (authState.loading) return;

            const email = loginForm.email.value;
            const password = loginForm.password.value;

            setLoading(true, 'Iniciando sesión...');

            try {
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;

                // Intentar Cargar datos extra del usuario (empresa_id, rol)
                let { data: userData, error: userError } = await window.supabaseClient
                    .from('usuarios')
                    .select('*, empresas(*)')
                    .eq('id', data.user.id)
                    .single();

                // --- LÓGICA FAIL-SAFE: Si el perfil no existe en DB, lo intentamos crear ---
                if (userError && (userError.code === 'PGRST116' || userError.status === 406)) {
                    console.warn("Perfil no encontrado en 'usuarios'. Intentando auto-creación...");
                    
                    const meta = data.user.user_metadata || {};
                    
                    // 1. Buscar si ya existe una empresa con ese nombre o crear una genérica
                    let empresaId;
                    const { data: empData } = await window.supabaseClient
                        .from('empresas')
                        .select('id')
                        .eq('nombre', meta.company_name || 'Mi Negocio')
                        .limit(1);
                    
                    if (empData && empData.length > 0) {
                        empresaId = empData[0].id;
                    } else {
                        const { data: newEmp, error: empError } = await window.supabaseClient
                            .from('empresas')
                            .insert([{ 
                                nombre: meta.company_name || 'Mi Negocio',
                                slug: 'bar-' + Math.random().toString(36).substring(7)
                            }])
                            .select().single();
                        
                        if (empError) throw new Error("No se pudo crear la empresa: " + empError.message);
                        if (!newEmp) throw new Error("Error inesperado al crear la empresa (null).");
                        empresaId = newEmp.id;
                    }

                    // 2. Crear el usuario en la tabla pública
                    const { data: newUser, error: createError } = await window.supabaseClient
                        .from('usuarios')
                        .insert([{
                            id: data.user.id,
                            empresa_id: empresaId,
                            nombre: meta.full_name || 'Usuario',
                            email: data.user.email,
                            rol: 'admin'
                        }])
                        .select('*, empresas(*)').single();
                    
                    if (createError) throw createError;
                    if (!newUser) throw new Error("Error inesperado al crear el perfil (null).");
                    userData = newUser;
                } else if (userError) {
                    throw userError;
                }

                // Guardar en sesión local
                localStorage.setItem('barclick_session', JSON.stringify({
                    user: userData,
                    empresa: userData.empresas
                }));

                // Redirección por rol
                window.location.href = userData.rol === 'admin' ? 'dashboard.html' : 'bartender.html';

            } catch (err) {
                showMessage('error', "Error de acceso: " + err.message);
                console.error('Login error context:', err);
            } finally {
                setLoading(false);
            }
        });
    }

    // Manejar Registro
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (authState.loading) return;

            const fullName = registerForm.fullName.value.trim();
            const companyName = registerForm.companyName.value.trim();
            const email = registerForm.email.value.trim().toLowerCase();
            const password = registerForm.password.value;

            console.log("Intentando registro con:", { email, fullName, companyName });

            setLoading(true, 'Creando cuenta...');

            try {
                if (!window.supabaseClient) {
                    throw new Error("El cliente de Supabase no está inicializado.");
                }

                const { data, error } = await window.supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            company_name: companyName,
                            is_new_company: 'true'
                        }
                    }
                });

                if (error) {
                    console.error("Error detallado de Supabase Auth:", error);
                    throw error;
                }

                if (data.user && (data.session || data.user.identities?.length > 0)) {
                    // Cuenta creada (con o sin sesión dependiendo de si requiere confirmación)
                    if (data.session) {
                        showMessage('success', 'Cuenta creada exitosamente. Redirigiendo...');
                        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
                    } else {
                        showMessage('success', 'Cuenta creada. Revisa tu email para confirmarla (si está activo).');
                    }
                } else if (data.user && data.user.identities?.length === 0) {
                    throw new Error("Este correo ya está registrado.");
                }

            } catch (err) {
                showMessage('error', err.message);
                console.error('Register error context:', err);
            } finally {
                setLoading(false);
            }
        });
    }
});

function setLoading(show, text = 'Cargando...') {
    authState.loading = show;
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    
    if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

function showMessage(type, text) {
    const msgDiv = document.getElementById('authMessage');
    if (!msgDiv) return;

    const inner = msgDiv.querySelector('div');
    msgDiv.classList.remove('hidden');
    inner.textContent = text;
    
    if (type === 'error') {
        inner.className = 'p-4 rounded-xl text-sm bg-danger/20 text-danger border border-danger/20';
    } else {
        inner.className = 'p-4 rounded-xl text-sm bg-success/20 text-success border border-success/20';
    }

    setTimeout(() => {
        msgDiv.classList.add('hidden');
    }, 5000);
}

// Función global para Logout
window.logout = async () => {
    try {
        await window.supabaseClient.auth.signOut();
        localStorage.removeItem('barclick_session');
        window.location.href = 'index.html';
    } catch (err) {
        console.error('Error logging out:', err);
        window.location.href = 'index.html';
    }
};
