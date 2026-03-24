/**
 * Panel de Bartender para BarClick
 * Visualización y gestión de pedidos en tiempo real
 */

// Estado Global
let currentUser = null;
let currentEmpresa = null;
let pedidos = [];
let eventos = [];

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    if (session) {
        await initBartender();
    } else {
        window.location.href = 'index.html';
    }
});

async function checkAuth() {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error || !session) return null;

    const { data: userData, error: userError } = await window.supabaseClient
        .from('usuarios')
        .select('*, empresas(*)')
        .eq('id', session.user.id)
        .single();

    if (userError || !userData) return null;

    currentUser = userData;
    currentEmpresa = userData.empresas;

    return session;
}

async function initBartender() {
    try {
        await Promise.all([
            loadEventos(),
            loadPedidos()
        ]);
        
        setupRealtime();
    } catch (err) {
        console.error('Bartender init error:', err);
        alert('Error al cargar panel: ' + err.message);
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
    
    // Poblar filtro si existe
    const filter = document.getElementById('eventoFilter');
    if (filter) {
        filter.innerHTML = '<option value="">Todos los eventos</option>' +
            eventos.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    }
}

async function loadPedidos() {
    const { data, error } = await window.supabaseClient
        .from('pedidos')
        .select('*, evento_id:eventos!inner(id, empresa_id), pedido_detalles(*, bebidas(*))')
        .eq('eventos.empresa_id', currentEmpresa.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Normalizar
    pedidos = data.map(p => ({
        ...p,
        detalles: p.pedido_detalles.map(d => ({
            ...d,
            bebida: d.bebidas
        }))
    }));

    renderPedidos();
}

function renderPedidos() {
    const colPendiente = document.getElementById('colPendiente');
    const colPreparando = document.getElementById('colPreparando');
    const colListo = document.getElementById('colListo');
    
    const filter = document.getElementById('eventoFilter');
    const selectedEvento = filter ? filter.value : '';
    
    const currentPedidos = selectedEvento 
        ? pedidos.filter(p => p.evento_id.id === selectedEvento)
        : pedidos;
    
    const grouping = {
        pendiente: currentPedidos.filter(p => p.estado === 'pendiente'),
        preparando: currentPedidos.filter(p => p.estado === 'preparando'),
        listo: currentPedidos.filter(p => p.estado === 'listo')
    };
    
    // Actualizar contadores
    document.getElementById('countPendiente').textContent = grouping.pendiente.length;
    document.getElementById('countPreparando').textContent = grouping.preparando.length;
    document.getElementById('countListo').textContent = grouping.listo.length;
    
    const renderCol = (list) => list.map(p => renderPedidoCard(p)).join('') || '<p class="text-muted text-center py-8 text-sm">Sin pedidos</p>';
    
    colPendiente.innerHTML = renderCol(grouping.pendiente);
    colPreparando.innerHTML = renderCol(grouping.preparando);
    colListo.innerHTML = renderCol(grouping.listo);
}

function renderPedidoCard(p) {
    const time = new Date(p.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    let actionBtn = '';
    if (p.estado === 'pendiente') {
        actionBtn = `<button onclick="updateEstado('${p.id}', 'preparando')" class="w-full py-3 bg-blue-500 text-white rounded-xl font-bold mt-4 hover:scale-[1.02] shadow-lg shadow-blue-500/20 active:scale-100 transition-all">PREPARAR</button>`;
    } else if (p.estado === 'preparando') {
        actionBtn = `<button onclick="updateEstado('${p.id}', 'listo')" class="w-full py-3 bg-success text-white rounded-xl font-bold mt-4 hover:scale-[1.02] shadow-lg shadow-green-500/20 active:scale-100 transition-all">LISTO</button>`;
    } else if (p.estado === 'listo') {
        actionBtn = `<button onclick="updateEstado('${p.id}', 'entregado')" class="w-full py-3 bg-accent text-bg rounded-xl font-bold mt-4 hover:scale-[1.02] active:scale-100 transition-all">ENTREGADO</button>`;
    }

    return `
        <div class="order-card p-5 bg-surface border border-border rounded-2xl slide-in ${p.estado}">
            <div class="flex items-center justify-between mb-4">
                <p class="text-lg font-black text-fg tracking-tight uppercase">${p.invitado_nombre}</p>
                <p class="text-[10px] text-muted font-mono bg-card px-2 py-1 rounded-lg">${time}</p>
            </div>
            <div class="space-y-2">
                ${p.detalles.map(d => `
                    <div class="flex items-center justify-between bg-card p-3 rounded-xl">
                        <span class="font-medium text-fg">${d.bebida?.nombre || 'Bebida'}</span>
                        <span class="text-accent font-black text-xl">x${d.cantidad}</span>
                    </div>
                `).join('')}
            </div>
            ${p.notas ? `<p class="mt-3 text-xs text-warning bg-warning/10 p-2 rounded-lg italic">"${p.notas}"</p>` : ''}
            ${actionBtn}
        </div>
    `;
}

window.updateEstado = async (id, nuevoEstado) => {
    try {
        const { error } = await window.supabaseClient
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', id);

        if (error) throw error;
        // La actualización de la UI se maneja mediante Realtime
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

window.filterPedidos = () => {
    const filter = document.getElementById('eventoFilter');
    const eventoActualElem = document.getElementById('eventoActual');
    if (eventoActualElem) {
        const selected = filter.options[filter.selectedIndex].text;
        eventoActualElem.textContent = selected === 'Todos los eventos' ? 'Pedidos recientes' : selected;
    }
    renderPedidos();
};

function setupRealtime() {
    window.supabaseClient
        .channel('bartender:pedidos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
            loadPedidos(); // Recargar todos para asegurar coherencia
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
        audio.play().catch(e => console.log('Audio overlap or interaction required'));
    }
}

window.logout = async () => {
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem('barclick_session');
    window.location.href = 'index.html';
};
