/**
 * Menú de Invitado para BarClick
 * Carga dinámica desde la base de datos de Supabase basada en el código QR
 */

// Estado Global
let currentEvento = null;
let currentEmpresa = null;
let bebidas = [];
let cart = [];
let currentCategory = '';

// Elementos de la UI
const cartCount = document.getElementById('cartCount');
const bebidasGrid = document.getElementById('bebidasGrid');
const emptyState = document.getElementById('emptyState');
const cartItems = document.getElementById('cartItems');
const submitBtn = document.getElementById('submitBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const eventoCode = urlParams.get('evento');
    
    if (!eventoCode) {
        showError('Código de evento no válido. Contacte al personal.');
        return;
    }
    
    await initMenu(eventoCode);
});

async function initMenu(code) {
    try {
        // Cargar el evento y la empresa asociada
        const { data: evento, error: evError } = await window.supabaseClient
            .from('eventos')
            .select('*, empresas(*)')
            .eq('codigo_qr', code)
            .eq('activo', true)
            .single();
            
        if (evError || !evento) throw new Error('Evento no encontrado o inactivo.');
        
        currentEvento = evento;
        currentEmpresa = evento.empresas;
        
        // Cargar bebidas asociadas a la empresa del evento
        const { data: bData, error: bevError } = await window.supabaseClient
            .from('bebidas')
            .select('*')
            .eq('empresa_id', currentEmpresa.id)
            .eq('activo', true);
            
        if (bevError) throw bevError;
        
        // Aplanar los datos para facilitar el manejo
        bebidas = bData;
        
        // Actualizar UI básica
        document.getElementById('barName').textContent = currentEmpresa.nombre;
        document.getElementById('eventoName').textContent = currentEvento.nombre;
        
        renderCategories();
        renderBebidas();
        
    } catch (err) {
        console.error('Menu init error:', err);
        showError(err.message);
    } finally {
        hideLoading();
    }
}

// =============================================
// RENDERIZADO (UI)
// =============================================
function renderCategories() {
    const categories = [...new Set(bebidas.map(b => b.categoria).filter(Boolean))];
    const categoryNames = {
        'cocteles': 'Cocteles',
        'cervezas': 'Cervezas',
        'vinos': 'Vinos',
        'sin_alcohol': 'Sin Alcohol',
        'shots': 'Shots'
    };

    const container = document.getElementById('categoryFilter');
    if (!container) return;
    
    container.innerHTML = `
        <button onclick="filterCategory('')" class="category-btn px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${currentCategory === '' ? 'bg-accent text-bg' : 'bg-surface text-fg border border-border'}">
            Todos
        </button>
        ${categories.map(cat => `
            <button onclick="filterCategory('${cat}')" class="category-btn px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${currentCategory === cat ? 'bg-accent text-bg' : 'bg-surface text-fg border border-border'}">
                ${categoryNames[cat] || cat}
            </button>
        `).join('')}
    `;
}

function renderBebidas() {
    const filtered = currentCategory 
        ? bebidas.filter(b => b.categoria === currentCategory)
        : bebidas;

    if (filtered.length === 0) {
        bebidasGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    bebidasGrid.innerHTML = filtered.map(bebida => {
        const inCart = cart.find(c => c.id === bebida.id);
        return `
            <div class="bebida-card bg-card border border-border rounded-2xl overflow-hidden fade-in">
                <div class="aspect-square relative overflow-hidden bg-surface">
                    ${bebida.imagen_url 
                        ? `<img src="${bebida.imagen_url}" alt="${bebida.nombre}" class="w-full h-full object-cover">`
                        : `<div class="w-full h-full flex items-center justify-center text-muted">
                            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                            </svg>
                        </div>`
                    }
                </div>
                <div class="p-3">
                    <h3 class="font-semibold text-fg text-sm leading-tight">${bebida.nombre}</h3>
                    <p class="text-[10px] text-muted mt-1 uppercase">${bebida.categoria || ''}</p>
                    
                    ${inCart 
                        ? `<div class="flex items-center justify-between mt-3">
                            <button onclick="removeFromCart('${bebida.id}')" class="w-10 h-10 bg-surface border border-border rounded-xl text-fg flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                                </svg>
                            </button>
                            <span class="text-accent font-bold text-lg">${inCart.cantidad}</span>
                            <button onclick="addToCart('${bebida.id}')" class="w-10 h-10 bg-accent rounded-xl text-bg flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                </svg>
                            </button>
                        </div>`
                        : `<button onclick="addToCart('${bebida.id}')" class="w-full mt-3 py-2.5 bg-surface border border-accent text-accent rounded-xl text-sm font-semibold hover:bg-accent hover:text-bg transition-colors">
                            Agregar
                        </button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// =============================================
// LÓGICA DEL CARRITO
// =============================================
window.filterCategory = (cat) => {
    currentCategory = cat;
    renderCategories();
    renderBebidas();
};

window.addToCart = (id) => {
    const bebida = bebidas.find(b => b.id === id);
    if (!bebida) return;

    const existing = cart.find(c => c.id === id);
    if (existing) {
        existing.cantidad++;
    } else {
        cart.push({ ...bebida, cantidad: 1 });
    }

    updateCartUI();
    renderBebidas();
};

window.removeFromCart = (id) => {
    const existingIndex = cart.findIndex(c => c.id === id);
    if (existingIndex > -1) {
        cart[existingIndex].cantidad--;
        if (cart[existingIndex].cantidad <= 0) {
            cart.splice(existingIndex, 1);
        }
    }

    updateCartUI();
    renderBebidas();
};

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.cantidad, 0);
    
    if (count > 0) {
        cartCount.textContent = count;
        cartCount.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Pedido';
    } else {
        cartCount.classList.add('hidden');
        submitBtn.disabled = true;
    }

    renderCartItems();
}

function renderCartItems() {
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="text-muted text-center py-4">El carrito esta vacio</p>';
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <div class="flex items-center gap-3 bg-surface rounded-xl p-3">
            <div class="w-14 h-14 rounded-lg overflow-hidden bg-card flex-shrink-0">
                ${item.imagen_url ? `<img src="${item.imagen_url}" class="w-full h-full object-cover">` : '<div class="bg-card w-full h-full"></div>'}
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium text-fg truncate">${item.nombre}</p>
                <p class="text-sm text-muted">Cantidad: ${item.cantidad}</p>
            </div>
            <button onclick="removeFromCart('${item.id}')" class="p-2 text-muted hover:text-danger">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </div>
    `).join('');
}

window.toggleCart = () => {
    const drawer = document.getElementById('cartDrawer');
    drawer.classList.toggle('hidden');
    document.body.style.overflow = drawer.classList.contains('hidden') ? '' : 'hidden';
};

// =============================================
// ENVÍO DE PEDIDO
// =============================================
window.submitPedido = async (e) => {
    e.preventDefault();
    const form = e.target;
    
    if (cart.length === 0) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    
    try {
        // 1. Crear el registro del pedido
        const { data: pedido, error: pError } = await window.supabaseClient
            .from('pedidos')
            .insert([{
                evento_id: currentEvento.id,
                invitado_nombre: form.nombre.value.trim(),
                invitado_telefono: form.telefono.value.trim() || null,
                notas: form.notas.value.trim() || null,
                estado: 'pendiente'
            }])
            .select()
            .single();
            
        if (pError) throw pError;
        
        // 2. Crear los detalles del pedido
        const detalles = cart.map(item => ({
            pedido_id: pedido.id,
            bebida_id: item.id,
            cantidad: item.cantidad
        }));
        
        const { error: dError } = await window.supabaseClient
            .from('pedido_detalles')
            .insert(detalles);
            
        if (dError) throw dError;
        
        // 3. Éxito
        showSuccessModal();
        resetCart();
        
    } catch (err) {
        alert('Error al enviar pedido: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Pedido';
    }
};

function resetCart() {
    cart = [];
    updateCartUI();
    renderBebidas();
    toggleCart();
    document.getElementById('pedidoForm').reset();
}

function showSuccessModal() {
    document.getElementById('successModal').classList.remove('hidden');
    document.getElementById('successModal').classList.add('flex');
}

window.closeSuccessModal = () => {
    document.getElementById('successModal').classList.add('hidden');
    document.getElementById('successModal').classList.remove('flex');
};

// =============================================
// HELPERS
// =============================================
function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function showError(msg) {
    if (loadingOverlay) {
        loadingOverlay.innerHTML = `
            <div class="text-center p-6">
                <svg class="w-16 h-16 text-danger mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <p class="text-fg font-bold text-lg">${msg}</p>
                <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-accent text-bg rounded-xl font-bold">Reintentar</button>
            </div>
        `;
    }
}
