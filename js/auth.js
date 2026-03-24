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

                // Cargar datos extra del usuario (empresa_id, rol)
                const { data: userData, error: userError } = await window.supabaseClient
                    .from('usuarios')
                    .select('*, empresas(*)')
                    .eq('id', data.user.id)
                    .single();

                if (userError) throw userError;

                // Guardar en sesión local (opcional, Supabase ya lo hace pero para coherencia con dashboard)
                localStorage.setItem('barclick_session', JSON.stringify({
                    user: userData,
                    empresa: userData.empresas
                }));

                // Redirección por rol
                if (userData.rol === 'admin') {
                    window.location.href = 'dashboard.html';
                } else {
                    window.location.href = 'bartender.html';
                }

            } catch (err) {
                showMessage('error', err.message);
                console.error('Login error:', err);
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

            const fullName = registerForm.fullName.value;
            const companyName = registerForm.companyName.value;
            const email = registerForm.email.value;
            const password = registerForm.password.value;

            setLoading(true, 'Creando cuenta...');

            try {
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

                if (error) throw error;

                if (data.user && data.session) {
                    // En registro con auto-confirmación habilitada
                    showMessage('success', 'Cuenta creada exitosamente. Redirigiendo...');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                } else {
                    // Si requiere confirmación de email
                    showMessage('success', 'Revisa tu email para confirmar tu cuenta.');
                }

            } catch (err) {
                showMessage('error', err.message);
                console.error('Register error:', err);
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
