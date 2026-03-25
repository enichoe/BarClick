/**
 * Panel de Administración para BarClick
 * Integración dinámica con Supabase (Auth, Database, Storage, Realtime)
 */

// Estado Global
let currentUser = null;
let currentEmpresa = null;
let pedidos = [];
let eventos = [];
let bebidas = [];
let bartenders = [];

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    if (session) {
        await initDashboard();
    } else {
        window.location.href = 'index.html';
    }
});

// =============================================
// AUTENTICACIÓN Y SESIÓN
// =============================================
async function checkAuth() {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    
    if (error || !session) return null;

    // Obtener datos detallados del usuario y su empresa
    const { data: userData, error: userError } = await window.supabaseClient
        .from('usuarios')
        .select('*, empresas(*)')
        .eq('id', session.user.id)
        .single();

    if (userError || !userData) {
        console.error('No se pudieron cargar los datos del usuario:', userError);
        return null;
    }

    if (!userData.empresas) {
        console.error('El usuario no tiene una empresa asociada.');
        return null;
    }

    currentUser = userData;
    currentEmpresa = userData.empresas;

    // Actualizar UI con datos del usuario
    updateUserUI();
    return session;
}

function updateUserUI() {
    document.getElementById('userName').textContent = currentUser.nombre;
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.nombre.charAt(0).toUpperCase();
    
    // Cargar perfil en el formulario
    const form = document.getElementById('perfilForm');
    if (form) {
        if (form.nombre) form.nombre.value = currentEmpresa.nombre || '';
        if (form.telefono) form.telefono.value = currentEmpresa.telefono || '';
        if (form.instagram) form.instagram.value = currentEmpresa.instagram || '';
        if (form.facebook) form.facebook.value = currentEmpresa.facebook || '';
        
        if (currentEmpresa.logo_url) {
            const preview = document.getElementById('logoPreview');
            const placeholder = document.getElementById('logoPlaceholder');
            preview.src = currentEmpresa.logo_url;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    }
}

// =============================================
// CARGA DE DATOS
// =============================================
async function initDashboard() {
    showLoading(true, 'Iniciando panel...');
    
    try {
        await Promise.all([
            loadEventos(),
            loadBebidas(),
            loadBartenders(),
            loadPedidos()
        ]);
        
        setupRealtime();
    } catch (err) {
        console.error('Dashboard init error:', err);
        alert('Error al cargar datos del panel: ' + err.message);
    } finally {
        showLoading(false);
    }
}

async function loadEventos() {
    const { data, error } = await window.supabaseClient
        .from('eventos')
        .select('*')
        .eq('empresa_id', currentEmpresa.id)
        .order('fecha', { ascending: false });

    if (error) throw error;
    eventos = data;
    renderEventos();
}

async function loadBebidas() {
    const { data, error } = await window.supabaseClient
        .from('bebidas')
        .select('*')
        .eq('empresa_id', currentEmpresa.id)
        .order('nombre');

    if (error) throw error;
    bebidas = data;
    renderBebidas();
}

async function loadBartenders() {
    const { data, error } = await window.supabaseClient
        .from('usuarios')
        .select('*')
        .eq('empresa_id', currentEmpresa.id)
        .eq('rol', 'bartender')
        .order('nombre');

    if (error) throw error;
    bartenders = data;
    renderBartenders();
}

async function loadPedidos() {
    // Cargar pedidos del día para eventos de esta empresa
    const { data, error } = await window.supabaseClient
        .from('pedidos')
        .select('*, evento_id:eventos!inner(id, empresa_id), pedido_detalles(*, bebidas(*))')
        .eq('eventos.empresa_id', currentEmpresa.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Normalizar datos para la UI
    pedidos = data.map(p => ({
        ...p,
        detalles: p.pedido_detalles.map(d => ({
            ...d,
            bebida: d.bebidas
        }))
    }));

    renderPedidos();
    updateStats();
}

// =============================================
// RENDERIZADO (UI)
// =============================================
function renderEventos() {
    const container = document.getElementById('eventosList');
    if (eventos.length === 0) {
        container.innerHTML = '<p class="text-muted col-span-full text-center py-12">No hay eventos creados</p>';
        return;
    }
    
    container.innerHTML = eventos.map(evento => `
        <div class="bg-card border border-border rounded-2xl p-6 card-hover group">
            <div class="flex items-center justify-between mb-4">
                <div class="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div class="flex gap-2">
                    <button onclick="showQR('${evento.id}')" class="p-2 text-muted hover:text-accent transition-colors" title="Ver QR">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1l-3 3h-3l-1 1v5l1 1h3l3 3h1v1M8 8H6v10h2M15 8h2v10h-2"/>
                        </svg>
                    </button>
                    <button onclick="deleteEvento('${evento.id}')" class="p-2 text-muted hover:text-danger transition-colors" title="Eliminar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
            <h3 class="text-lg font-bold text-fg mb-1 uppercase">${evento.nombre}</h3>
            <p class="text-sm text-muted mb-4">${formatDate(evento.fecha)} ${evento.hora_inicio ? '• ' + evento.hora_inicio : ''}</p>
            <div class="flex items-center gap-2 text-xs text-muted">
                <span class="px-2 py-0.5 bg-surface border border-border rounded-full">${evento.codigo_qr}</span>
                <span class="${evento.activo ? 'text-success' : 'text-danger'}">• ${evento.activo ? 'Activo' : 'Vencido'}</span>
            </div>
        </div>
    `).join('');
}

function renderBebidas() {
    const container = document.getElementById('bebidasList');
    if (bebidas.length === 0) {
        container.innerHTML = '<p class="text-muted col-span-full text-center py-12">No hay bebidas creadas</p>';
        return;
    }
    
    container.innerHTML = bebidas.map(bebida => `
        <div class="bg-card border border-border rounded-2xl overflow-hidden card-hover">
            <div class="aspect-square bg-surface relative overflow-hidden">
                ${bebida.imagen_url 
                    ? `<img src="${bebida.imagen_url}" alt="${bebida.nombre}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-muted">
                        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                    </div>`
                }
                <span class="absolute top-2 right-2 px-2 py-1 bg-card/80 backdrop-blur text-xs rounded-full ${bebida.activo ? 'text-success' : 'text-muted'}">
                    ${bebida.activo ? 'Activo' : 'Inactivo'}
                </span>
            </div>
            <div class="p-4">
                <h4 class="font-semibold text-fg">${bebida.nombre}</h4>
                <p class="text-xs text-muted mt-1 line-clamp-2">${bebida.descripcion || 'Sin descripción'}</p>
                <span class="inline-block px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full mt-2 uppercase">
                    ${bebida.categoria || 'Sin categoría'}
                </span>
                <div class="flex gap-2 mt-4">
                    <button onclick="toggleBebidaActivo('${bebida.id}')" class="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs hover:text-fg transition-colors">
                        ${bebida.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onclick="deleteBebida('${bebida.id}')" class="px-3 py-2 bg-surface border border-border rounded-lg text-danger hover:bg-danger/10 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderBartenders() {
    const container = document.getElementById('bartendersList');
    if (bartenders.length === 0) {
        container.innerHTML = '<p class="text-muted col-span-full text-center py-12">No hay bartenders registrados</p>';
        return;
    }
    
    container.innerHTML = bartenders.map(b => `
        <div class="bg-card border border-border rounded-2xl p-5 card-hover flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-xl">
                    ${b.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h4 class="font-semibold text-fg">${b.nombre}</h4>
                    <p class="text-xs text-muted font-mono">${b.email}</p>
                </div>
            </div>
            <button onclick="deleteBartender('${b.id}')" class="p-2 text-muted hover:text-danger transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function renderPedidos() {
    const colPendiente = document.getElementById('colPendiente');
    const colPreparando = document.getElementById('colPreparando');
    const colListo = document.getElementById('colListo');
    
    // Agrupar pedidos por estado
    const pendientes = pedidos.filter(p => p.estado === 'pendiente');
    const preparando = pedidos.filter(p => p.estado === 'preparando');
    const listos = pedidos.filter(p => p.estado === 'listo');
    
    // Actualizar contadores
    document.getElementById('countPendiente').textContent = pendientes.length;
    document.getElementById('countPreparando').textContent = preparando.length;
    document.getElementById('countListo').textContent = listos.length;
    
    // Renderizar cada columna
    const renderCol = (list) => list.map(p => renderPedidoCard(p)).join('') || '<p class="text-muted text-center py-8 text-sm">Sin pedidos</p>';
    
    colPendiente.innerHTML = renderCol(pendientes);
    colPreparando.innerHTML = renderCol(preparando);
    colListo.innerHTML = renderCol(listos);
    
    // Dashboard Recent Orders
    const recentOrders = document.getElementById('recentOrders');
    if (recentOrders) {
        recentOrders.innerHTML = pedidos.slice(0, 5).map(p => `
            <div class="p-4 bg-surface/50 border border-border rounded-xl flex items-center justify-between">
                <div>
                    <p class="font-semibold text-fg">${p.invitado_nombre}</p>
                    <p class="text-xs text-muted">${p.detalles.length} bebidas • ${formatTime(p.created_at)}</p>
                </div>
                <span class="px-2 py-1 text-[10px] font-bold uppercase rounded-full ${
                    p.estado === 'pendiente' ? 'bg-warning/20 text-warning' : 
                    p.estado === 'preparando' ? 'bg-blue-500/20 text-blue-500' : 
                    'bg-success/20 text-success'
                }">${p.estado}</span>
            </div>
        `).join('') || '<p class="text-muted text-sm text-center">No hay actividad reciente</p>';
    }
}

function renderPedidoCard(p) {
    return `
        <div class="kanban-card bg-surface border border-border rounded-xl p-4 slide-in ${p.estado}">
            <div class="flex items-center justify-between mb-2">
                <p class="font-bold text-fg">${p.invitado_nombre}</p>
                <span class="text-[10px] text-muted font-mono">${formatTime(p.created_at)}</span>
            </div>
            <div class="space-y-1 mb-4">
                ${p.detalles.map(d => `
                    <div class="flex items-center justify-between text-sm py-1 border-b border-border/50">
                        <span class="text-muted">${d.bebida?.nombre || 'Bebida'}</span>
                        <span class="font-bold">x${d.cantidad}</span>
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-2">
                ${p.estado === 'pendiente' ? `
                    <button onclick="updatePedidoEstado('${p.id}', 'preparando')" class="flex-1 py-2 bg-blue-500/20 text-blue-500 rounded-lg text-xs font-bold hover:bg-blue-500/30 transition-colors">PREPARAR</button>
                ` : ''}
                ${p.estado === 'preparando' ? `
                    <button onclick="updatePedidoEstado('${p.id}', 'listo')" class="flex-1 py-2 bg-success/20 text-success rounded-lg text-xs font-bold hover:bg-success/30 transition-colors">LISTO</button>
                ` : ''}
                ${p.estado === 'listo' ? `
                    <button onclick="updatePedidoEstado('${p.id}', 'entregado')" class="flex-1 py-2 bg-accent/20 text-accent rounded-lg text-xs font-bold hover:bg-accent/30 transition-colors">ENTREGADO</button>
                ` : ''}
            </div>
        </div>
    `;
}

function updateStats() {
    const pendientes = pedidos.filter(p => p.estado === 'pendiente').length;
    const preparando = pedidos.filter(p => p.estado === 'preparando').length;
    const listos = pedidos.filter(p => p.estado === 'listo').length;
    const total = pedidos.length;
    
    document.getElementById('statPendientes').textContent = pendientes;
    document.getElementById('statPreparando').textContent = preparando;
    document.getElementById('statListos').textContent = listos;
    document.getElementById('statTotal').textContent = total;
}

// =============================================
// ACCIONES Y CRUD (DYNAMICO)
// =============================================
window.savePerfil = async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = document.getElementById('logoInput').files[0];
    
    showLoading(true, 'Actualizando perfil...');
    
    try {
        let logo_url = currentEmpresa.logo_url;
        
        if (file) {
            logo_url = await uploadToStorage(file, 'logos', currentEmpresa.id);
        }

        const { error } = await window.supabaseClient
            .from('empresas')
            .update({
                nombre: form.nombre.value,
                telefono: form.telefono.value,
                instagram: form.instagram.value,
                facebook: form.facebook.value,
                logo_url
            })
            .eq('id', currentEmpresa.id);

        if (error) throw error;
        
        // Refrescar estado local
        currentEmpresa = { ...currentEmpresa, nombre: form.nombre.value, logo_url };
        updateUserUI();
        alert('Perfil actualizado correctamente');
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    } finally {
        showLoading(false);
    }
};

window.saveEvento = async (e) => {
    e.preventDefault();
    const form = e.target;
    const codigoQr = generateQRCode();
    
    showLoading(true, 'Creando evento...');
    
    try {
        const { error } = await window.supabaseClient
            .from('eventos')
            .insert([{
                empresa_id: currentEmpresa.id,
                nombre: form.nombre.value.toUpperCase(),
                fecha: form.fecha.value,
                hora_inicio: form.horaInicio.value || null,
                hora_fin: form.horaFin.value || null,
                ubicacion: form.ubicacion.value || null,
                codigo_qr: codigoQr
            }]);

        if (error) throw error;
        
        closeModal('eventoModal');
        form.reset();
        await loadEventos();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        showLoading(false);
    }
};

window.saveBebida = async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = document.getElementById('bebidaImgInput').files[0];
    
    showLoading(true, 'Guardando bebida...');
    
    try {
        let imagen_url = null;
        if (file) {
            imagen_url = await uploadToStorage(file, 'bebidas', Date.now());
        }

        const { error } = await window.supabaseClient
            .from('bebidas')
            .insert([{
                empresa_id: currentEmpresa.id,
                nombre: form.nombre.value,
                descripcion: form.descripcion.value || null,
                categoria: form.categoria.value,
                imagen_url,
                activo: true
            }]);

        if (error) throw error;
        
        closeModal('bebidaModal');
        form.reset();
        await loadBebidas();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        showLoading(false);
    }
};

window.updatePedidoEstado = async (pedidoId, nuevoEstado) => {
    try {
        const { error } = await window.supabaseClient
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedidoId);

        if (error) throw error;
        // La UI se actualizará vía Realtime
    } catch (err) {
        alert('Error al actualizar: ' + err.message);
    }
};

window.toggleBebidaActivo = async (id) => {
    const bebida = bebidas.find(b => b.id === id);
    if (!bebida) return;

    try {
        const { error } = await window.supabaseClient
            .from('bebidas')
            .update({ activo: !bebida.activo })
            .eq('id', id);

        if (error) throw error;
        await loadBebidas();
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

window.deleteEvento = async (id) => {
    if (!confirm('¿Seguro que quieres eliminar este evento?')) return;
    try {
        const { error } = await window.supabaseClient.from('eventos').delete().eq('id', id);
        if (error) throw error;
        await loadEventos();
    } catch (err) { alert(err.message); }
};

window.deleteBebida = async (id) => {
    if (!confirm('¿Seguro que quieres eliminar esta bebida?')) return;
    try {
        const { error } = await window.supabaseClient.from('bebidas').delete().eq('id', id);
        if (error) throw error;
        await loadBebidas();
    } catch (err) { alert(err.message); }
};

// =============================================
// STORAGE HELPERS
// =============================================
async function uploadToStorage(file, folder, id) {
    const ext = file.name.split('.').pop();
    const fileName = `${folder}/${id}_${Date.now()}.${ext}`;
    
    const { data, error } = await window.supabaseClient.storage
        .from('barclick')
        .upload(fileName, file, {
            upsert: true
        });

    if (error) throw error;

    const { data: { publicUrl } } = window.supabaseClient.storage
        .from('barclick')
        .getPublicUrl(fileName);

    return publicUrl;
}

// Función para manejar la previsualización del logo
window.handleLogoUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('logoPreview');
        const placeholder = document.getElementById('logoPlaceholder');
        if (preview && placeholder) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    };
    reader.readAsDataURL(file);
};

// =============================================
// REALTIME
// =============================================
function setupRealtime() {
    window.supabaseClient
        .channel('public:pedidos')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'pedidos' 
        }, payload => {
            console.log('Realtime update received:', payload);
            loadPedidos(); // Recargar todos para asegurar coherencia en la UI
            if (payload.eventType === 'INSERT') {
                playNotification();
            }
        })
        .subscribe();
}

function playNotification() {
    const audio = document.getElementById('notificationSound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio error:', e));
    }
}

// =============================================
// SISTEMA DE NAVEGACIÓN (TABS)
// =============================================
window.showTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) item.classList.add('active');
    });
    
    const titles = {
        dashboard: { title: 'Dashboard', subtitle: 'Resumen de actividad' },
        perfil: { title: 'Mi Perfil', subtitle: 'Configura tu negocio' },
        eventos: { title: 'Eventos', subtitle: 'Gestiona tus eventos' },
        bebidas: { title: 'Carta de Bebidas', subtitle: 'Administra tu menú' },
        bartenders: { title: 'Bartenders', subtitle: 'Tu equipo de trabajo' },
        pedidos: { title: 'Pedidos', subtitle: 'Gestión en tiempo real' }
    };
    
    document.getElementById('pageTitle').textContent = titles[tabName]?.title || 'Dashboard';
    document.getElementById('pageSubtitle').textContent = titles[tabName]?.subtitle || '';
    
    if (window.innerWidth < 1024) toggleSidebar();
};

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('-translate-x-full');
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.openModal = (id) => {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

// =============================================
// QR CODE HELPERS
// =============================================
window.showQR = (eventoId) => {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;
    
    document.getElementById('qrEventoName').textContent = evento.nombre;
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    
    const baseUrl = window.location.href.split('/').slice(0, -1).join('/');
    const qrUrl = `${baseUrl}/menu.html?evento=${evento.codigo_qr}`;
    
    // Usar la librería qrcode.min.js que ya está en el HTML
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, qrUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#0a0a0a', light: '#ffffff' }
    }, (error) => {
        if (!error) qrContainer.appendChild(canvas);
        else console.error('QR Error:', error);
    });
    
    openModal('qrModal');
};

window.downloadQR = () => {
    const canvas = document.querySelector('#qrCode canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR_${document.getElementById('qrEventoName').textContent}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
};

// =============================================
// HELPERS GENERALES
// =============================================
function generateQRCode() {
    return 'BC-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

function formatDate(dateStr) {
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('es-ES', options);
}

function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function showLoading(show, text = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    if (overlay) {
        if (show) { overlay.classList.remove('hidden'); overlay.classList.add('flex'); }
        else { overlay.classList.add('hidden'); overlay.classList.remove('flex'); }
    }
}
