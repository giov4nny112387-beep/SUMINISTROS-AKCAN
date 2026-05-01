/**
 * SISTEMA DE ALMACÉN E INVENTARIO INTERNO
 * Basado en importaciones WMS JDA - Versión Optimizada por Promedio Mensual y Sugeridos B2B
 */

const DB_KEYS = {
    PROD: 'almacen_products',
    SALIDAS: 'almacen_salidas',
    SET: 'almacen_settings',
    PEDIDOS: 'almacen_pedidos' // NUEVO: Para guardar historial de pedidos
};

let products = JSON.parse(localStorage.getItem(DB_KEYS.PROD)) ||[];
let salidas = JSON.parse(localStorage.getItem(DB_KEYS.SALIDAS)) ||[];
let pedidosLocal = JSON.parse(localStorage.getItem(DB_KEYS.PEDIDOS)) ||[];
let settings = JSON.parse(localStorage.getItem(DB_KEYS.SET)) || { adminPass: 'ADMIN1' };

let cart =[];
let currentUserRole = null;
let currentArea = '';
let viewAllPosItems = false;

let currentPage = 1;
const itemsPerPage = 50;

// URL DEL SCRIPT DE GOOGLE SHEETS
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxUA55zaQPuv8pTQEttTzBQxitvR36PcS_oImB3EWnORg9mpZCcrV4gUvnk1x7Pwvr0/exec';

const formatMoney = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
const generateId = (prefix) => prefix + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
const setElemText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
const saveDB = (key, data) => localStorage.setItem(key, JSON.stringify(data));

const showToast = (msg, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class='bx ${type === 'success' ? 'bx-check' : 'bx-error-circle'}'></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};

const updateSystemClock = () => {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const el = document.getElementById('current-datetime');
    if (el) el.textContent = new Date().toLocaleDateString('es-CO', opts);
};

document.addEventListener('DOMContentLoaded', () => {
    updateSystemClock(); setInterval(updateSystemClock, 60000);
    setupNavigation();
    document.getElementById('pos-search').addEventListener('input', (e) => renderPOSGrid(e.target.value));
    document.getElementById('inv-search').addEventListener('input', (e) => {
        currentPage = 1; renderInventory(e.target.value);
    });
});

window.toggleMobileMenu = () => {
    document.querySelector('.erp-sidebar').classList.toggle('open');
};

const showAdminForm = () => { document.getElementById('login-buttons-container').style.display = 'none'; document.getElementById('login-admin-container').style.display = 'flex'; };
const hideAdminForm = () => { document.getElementById('login-admin-container').style.display = 'none'; document.getElementById('login-buttons-container').style.display = 'flex'; };
const showCoordForm = () => { document.getElementById('login-buttons-container').style.display = 'none'; document.getElementById('login-coord-container').style.display = 'flex'; };
const hideCoordForm = () => { document.getElementById('login-coord-container').style.display = 'none'; document.getElementById('login-buttons-container').style.display = 'flex'; };

const login = (role) => {
    if (role === 'admin' && document.getElementById('login-admin-pass').value !== settings.adminPass) {
        return showToast('Contraseña incorrecta', 'error');
    }
    currentUserRole = role;
    document.getElementById('modal-login-fullscreen').style.display = 'none';
    document.getElementById('user-role-display').textContent = role === 'admin' ? 'Administrador Bodega' : 'Coordinador Pedidos';
    document.getElementById('user-avatar').textContent = role === 'admin' ? 'AD' : 'CO';
    
    if (role === 'coordinador') {
        document.body.classList.add('role-cashier');
        currentArea = document.getElementById('login-coord-area').value;
        document.getElementById('pos-area-select').value = currentArea;
        document.getElementById('pos-area-select').disabled = true;
        document.getElementById('btn-toggle-pos-view').style.display = 'inline-flex';
        viewAllPosItems = false; 
    } else {
        document.body.classList.remove('role-cashier');
        currentArea = '';
        document.getElementById('pos-area-select').disabled = false;
        document.getElementById('btn-toggle-pos-view').style.display = 'none';
        viewAllPosItems = true;
    }

    renderPOSGrid();
    if(role === 'admin') { renderInventory(); renderDashboard(); }
    showToast(`Ingreso exitoso como ${role === 'admin' ? 'Administrador' : 'Coordinador'}`);
};

const setupNavigation = () => {
    document.querySelectorAll('.menu-item[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (['dashboard', 'inventory'].includes(targetId) && currentUserRole !== 'admin') return showToast('Acceso denegado', 'error');
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(targetId).classList.add('active');
            document.querySelector('.erp-sidebar').classList.remove('open'); // Cierra menu en móviles
            
            if (targetId === 'dashboard') renderDashboard();
            if (targetId === 'pos') renderPOSGrid();
            if (targetId === 'inventory') renderInventory();
        });
    });
};

const openModal = (id) => document.getElementById(id).classList.add('active');
const closeModal = (id) => document.getElementById(id).classList.remove('active');

window.viewItemImage = (sku) => {
    const imgEl = document.getElementById('preview-image');
    // Busca la imagen en la carpeta IMG (se asume .jpg, si usan otra cambia la extensión aquí)
    imgEl.src = `IMG/${sku}.jpg`; 
    imgEl.onerror = () => { imgEl.src = 'https://placehold.co/400x400?text=Sin+Imagen+Disponible'; };
    openModal('modal-image');
};

const togglePosView = () => {
    viewAllPosItems = !viewAllPosItems;
    const btn = document.getElementById('btn-toggle-pos-view');
    btn.innerHTML = viewAllPosItems 
        ? "<i class='bx bx-filter'></i> Ver Solo Mi Historial" 
        : "<i class='bx bx-list-ul'></i> Ver Todos los Insumos";
    if(viewAllPosItems) showToast('Mostrando catálogo completo', 'info');
    renderPOSGrid(document.getElementById('pos-search').value);
};

const renderPOSGrid = (filter = '') => {
    const grid = document.getElementById('pos-grid');
    grid.innerHTML = '';
    const term = filter.toLowerCase();
    const selectedArea = document.getElementById('pos-area-select').value;
    const normSelectedArea = String(selectedArea).trim().toUpperCase();

    let displayProducts = products.filter(p => p.stock > 0);
    let areaSkus = new Set();

    if (currentUserRole === 'coordinador' && !viewAllPosItems) {
        salidas.forEach(s => {
            const normArea = String(s.area).trim().toUpperCase();
            if (normArea === normSelectedArea || normArea.includes(normSelectedArea)) {
                s.items.forEach(i => areaSkus.add(String(i.sku).trim()));
            }
        });
        displayProducts = displayProducts.filter(p => areaSkus.has(String(p.sku).trim()));
        if (displayProducts.length === 0 && areaSkus.size === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#6b7280;">No hay historial de pedidos para tu área. Haz clic en "Ver Todos los Insumos".</div>';
            return;
        }
    }
    
    // --- NUEVO: CALCULAMOS EL PROMEDIO ANTES PARA PODER ORDENAR ---
    let calculatedProducts = displayProducts.map(p => {
        let areaTotalHistorico = 0;
        let minDate = null;
        let maxDate = null;
        salidas.forEach(s => {
            const normArea = String(s.area).trim().toUpperCase();
            if (normArea === normSelectedArea || normArea.includes(normSelectedArea)) {
                const sDate = new Date(s.date);
                s.items.forEach(i => {
                    if (String(i.sku).trim() === String(p.sku).trim()) {
                        areaTotalHistorico += (parseFloat(i.qty) || 0);
                        if (!minDate || sDate < minDate) minDate = sDate;
                        if (!maxDate || sDate > maxDate) maxDate = sDate;
                    }
                });
            }
        });
        
        let monthsElapsed = 1;
        if (minDate && maxDate) {
            monthsElapsed = ((maxDate.getFullYear() - minDate.getFullYear()) * 12) + (maxDate.getMonth() - minDate.getMonth()) + 1; 
        }
        return { ...p, areaMonthlyAvg: areaTotalHistorico / monthsElapsed };
    });

    // Filtramos por texto
    calculatedProducts = calculatedProducts.filter(p => String(p.name).toLowerCase().includes(term) || String(p.sku).toLowerCase().includes(term));
    
    // Ordenamos para que los que consumen más salgan primero
    calculatedProducts.sort((a, b) => b.areaMonthlyAvg - a.areaMonthlyAvg);

    calculatedProducts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.onclick = () => addToCart(p);
        
        const promText = p.areaMonthlyAvg > 0 ? parseFloat(p.areaMonthlyAvg.toFixed(2)) : '0';
        let priceHtml = currentUserRole === 'admin' ? `<div class="item-price">${formatMoney(p.cost)}</div>` : '';
        
        div.innerHTML = `
        <div class="item-code" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${p.sku}</span>
            <span style="color:var(--primary); font-weight:bold; font-size:11px;" title="Consumo promedio mensual de tu área">Prom: ${promText}</span>
        </div>
        <div class="item-name">${p.name}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <button type="button" class="btn-img-view" onclick="event.stopPropagation(); viewItemImage('${p.sku}')">
                <i class='bx bx-image'></i> Foto
            </button>
            <div style="font-size:11px; color:#10b981; font-weight:bold;">Stock Disp: ${p.stock}</div>
        </div>
        ${priceHtml}`;
        grid.appendChild(div);
    });
};

const addToCart = (prod) => {
    const item = cart.find(i => i.id === prod.id);
    if (item) {
        if (item.qty < prod.stock) item.qty++;
        else return showToast('Stock máximo en bodega alcanzado', 'error');
    } else {
        cart.push({ ...prod, qty: 1 });
    }
    updateCart();
};

const modifyQty = (id, delta) => {
    const idx = cart.findIndex(i => i.id === id);
    if (idx > -1) {
        const prod = products.find(p => p.id === id);
        const newQty = cart[idx].qty + delta;
        if (newQty <= 0) cart.splice(idx, 1);
        else if (newQty > prod.stock) return showToast('Stock insuficiente', 'error');
        else cart[idx].qty = newQty;
        updateCart();
    }
};

const updateCart = () => {
    const list = document.getElementById('pos-cart-list');
    list.innerHTML = '';
    let totalQty = 0;
    if (cart.length === 0) {
        list.innerHTML = '<div class="empty-state">Agregue insumos al pedido</div>';
        document.getElementById('btn-open-payment').disabled = true;
    } else {
        document.getElementById('btn-open-payment').disabled = false;
        cart.forEach(item => {
            totalQty += item.qty;
            const el = document.createElement('div');
            el.className = 't-item';
            el.innerHTML = `<div class="t-item-info"><span class="t-item-name">${item.name}</span><span class="t-item-calc">Código: ${item.sku}</span></div>
            <div class="t-item-actions">
                <button class="qty-ctrl" onclick="modifyQty('${item.id}', -1)">-</button>
                <input type="text" class="qty-input" value="${item.qty}" readonly>
                <button class="qty-ctrl" onclick="modifyQty('${item.id}', 1)">+</button>
            </div>`;
            list.appendChild(el);
        });
    }
    setElemText('pos-total-qty', totalQty);
};

document.getElementById('btn-open-payment').addEventListener('click', () => {
    if (cart.length === 0) return;
    const area = document.getElementById('pos-area-select').options[document.getElementById('pos-area-select').selectedIndex].text;
    setElemText('checkout-area-name', area);
    document.getElementById('checkout-comment').value = '';
    openModal('modal-checkout');
});

// NUEVA LOGICA: Envía a Google Sheets, Guarda Pedido Local y descuenta stock (Lógica original respetada).
document.getElementById('btn-confirm-payment').addEventListener('click', () => {
    const areaVal = document.getElementById('pos-area-select').value;
    const comentario = document.getElementById('checkout-comment').value || '';
    const fechaActual = new Date().toLocaleDateString('es-CO');
    
    // 1. Preparar datos para Google Sheets (Estructura Solicitada)
    const datosParaSheets = cart.map(item => ({
        "Código": item.sku,
        "ID": item.id,
        "Descripción": item.name,
        "AREA": areaVal,
        "CANTIDAD SOLICITADA": item.qty,
        "FECHA": fechaActual,
        "COMENTARIO": comentario
    }));

    // 2. Guardar Pedido Consolidado en LocalStorage para columna en Inventario
    pedidosLocal = [...pedidosLocal, ...datosParaSheets];
    saveDB(DB_KEYS.PEDIDOS, pedidosLocal);

    // 3. Enviar a Google Sheets
    try {
        fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors', // Evita errores de política CORS del navegador
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosParaSheets)
        });
        showToast('Enviando datos del pedido a Google Sheets...', 'info');
    } catch (e) { console.error('Error enviando a Sheets', e); }

    // 4. Lógica original: Guardar salida local y descontar inventario.
    const itemsToSave = cart.map(item => {
        const p = products.find(x => x.id === item.id);
        if (p) p.stock -= item.qty;
        return { ...item };
    });
    const totalCost = itemsToSave.reduce((acc, i) => acc + ((i.cost || 0) * i.qty), 0);
    const salida = {
        id: 'DESP-' + String(salidas.length + 1).padStart(5, '0'),
        date: new Date().toISOString(),
        area: areaVal,
        items: itemsToSave,
        totalCost: totalCost
    };
    salidas.unshift(salida);
    saveDB(DB_KEYS.SALIDAS, salidas);
    saveDB(DB_KEYS.PROD, products);
    
    cart =[];
    updateCart();
    renderPOSGrid();
    if(currentUserRole === 'admin'){ renderInventory(); renderDashboard(); }
    closeModal('modal-checkout');
    showToast('Pedido Montado y Registrado Exitosamente');
});

window.exportHistoryToExcel = () => {
    if(salidas.length === 0) return showToast('No hay salidas en el historial', 'error');
    let exportData =[];
    salidas.forEach(s => {
        s.items.forEach(i => {
            exportData.push({
                "ID Despacho": s.id,
                "Fecha Salida": new Date(s.date).toLocaleString('es-CO'),
                "Área Destino": s.area,
                "Código Insumo": i.sku,
                "Descripción": i.name,
                "Unidad (UM)": i.um || 'N/A',
                "Cantidad Despachada": i.qty,
                "Costo Unitario ($)": i.cost || 0,
                "Costo Total Línea ($)": (i.cost || 0) * i.qty
            });
        });
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Historial de Salidas");
    XLSX.writeFile(workbook, `Historial_Salidas_Bodega_${new Date().getTime()}.xlsx`);
    showToast('Historial descargado en Excel');
};

const renderInventory = (filter = '') => {
    const tbody = document.getElementById('inventory-tbody');
    tbody.innerHTML = '';
    const term = filter.toLowerCase();
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    let allCalculated = products.map(p => {
        let salidasLast30 = 0, totalHistorico = 0, minDate = null, maxDate = null;
        salidas.forEach(s => {
            const sDate = new Date(s.date);
            s.items.forEach(i => {
                if (String(i.sku).trim() === String(p.sku).trim()) {
                    if (sDate >= thirtyDaysAgo) salidasLast30 += (parseFloat(i.qty) || 0);
                    totalHistorico += (parseFloat(i.qty) || 0);
                    if (!minDate || sDate < minDate) minDate = sDate;
                    if (!maxDate || sDate > maxDate) maxDate = sDate;
                }
            });
        });

        // Sumar total de "Pedidos" solicitados para la columna nueva
        let totalPedidoArea = 0;
        pedidosLocal.forEach(ped => {
            if (String(ped["Código"]) === String(p.sku)) {
                totalPedidoArea += parseFloat(ped["CANTIDAD SOLICITADA"] || 0);
            }
        });

        let monthsElapsed = 1; 
        if (minDate && maxDate) {
            monthsElapsed = ((maxDate.getFullYear() - minDate.getFullYear()) * 12) + (maxDate.getMonth() - minDate.getMonth()) + 1; 
        }
        const monthlyAvg = totalHistorico / monthsElapsed;
        return { ...p, monthlyAvg, salidasLast30, totalHistorico, totalPedidoArea };
    });

    let filtered = allCalculated.filter(p => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
    filtered.sort((a, b) => b.monthlyAvg - a.monthlyAvg);

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    const start = (currentPage - 1) * itemsPerPage;
    const pagedItems = filtered.slice(start, start + itemsPerPage);

    pagedItems.forEach(p => {
        const dailyRate = p.salidasLast30 / 30;
        const daysOfInventory = dailyRate > 0 ? Math.round(p.stock / dailyRate) : 'Sin rotación';

        let embalajeFormat = p.embalaje || 'N/A';
        if (p.embalaje) {
            const embStr = p.embalaje.trim().toUpperCase().replace(/\s+/g, ''); 
            if (embStr === 'PAQUETE-UNIDAD') embalajeFormat = '<span style="background:#e0e7ff; color:#3730a3; padding:3px 6px; border-radius:4px; font-weight:bold; font-size:11px;">P-U</span>';
            else if (embStr === 'UNIDAD-PAQUETE') embalajeFormat = '<span style="background:#dcfce7; color:#166534; padding:3px 6px; border-radius:4px; font-weight:bold; font-size:11px;">U-P</span>';
            else if (embStr === 'UNIDAD-UNIDAD') embalajeFormat = '<span style="background:#ffedd5; color:#c2410c; padding:3px 6px; border-radius:4px; font-weight:bold; font-size:11px;">U-U</span>';
            else if (embStr === 'PAQUETE-PAQUETE') embalajeFormat = '<span style="background:#fee2e2; color:#991b1b; padding:3px 6px; border-radius:4px; font-weight:bold; font-size:11px;">P-P</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td><span style="font-family:monospace; color:#6b7280">${p.sku}</span></td>
        <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:250px;" title="${p.name}"><strong>${p.name}</strong></td>
        <td>${p.um || 'N/A'}</td>
        <td>${embalajeFormat}</td>
        <td>${formatMoney(p.cost || 0)}</td>
        <td><span style="color:${p.stock <= 5 ? 'var(--danger)' : 'var(--success)'}; font-weight:700">${parseFloat(Number(p.stock).toFixed(2))}</span></td>
        <td><span style="color:var(--primary); font-weight:bold; background:#e0e7ff; padding:2px 8px; border-radius:4px;">${p.totalPedidoArea}</span></td>
        <td><span style="font-weight:600;">${parseFloat(Number(p.salidasLast30).toFixed(2))}</span></td>
        <td style="color:#6b7280;">${parseFloat(dailyRate.toFixed(2))}</td>
        <td style="color:var(--primary); font-weight:bold;">${parseFloat(p.monthlyAvg.toFixed(2))}</td>
        <td><span style="font-size:12px; font-weight: 500; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${daysOfInventory}</span></td>
        `;
        tbody.appendChild(tr);  
    });

    renderPaginationControls(totalPages);
};

const renderPaginationControls = (totalPages) => {
    let nav = document.getElementById('inv-pagination-ctrls');
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'inv-pagination-ctrls';
        nav.style = 'display:flex; justify-content:center; align-items:center; gap:20px; padding:20px; background:white; border-top:1px solid var(--border);';
        document.querySelector('#inventory .table-container').after(nav);
    }
    nav.innerHTML = `
        <button class="btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="changeInvPage(-1)"><i class='bx bx-chevron-left'></i> Anterior</button>
        <span style="font-weight:600">Página ${currentPage} de ${totalPages}</span>
        <button class="btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="changeInvPage(1)">Siguiente <i class='bx bx-chevron-right'></i></button>
    `;
};

window.changeInvPage = (step) => {
    currentPage += step;
    renderInventory(document.getElementById('inv-search').value);
    document.querySelector('.workspace-content').scrollTop = 0;
};

// -- RESTO DEL CÓDIGO SE MANTIENE INTACTO --
const openNewProduct = () => { document.getElementById('form-product').reset(); document.getElementById('p-id').value = ''; openModal('modal-product'); };

document.getElementById('form-product').addEventListener('submit', (e) => {
    e.preventDefault();
    const prod = {
        id: generateId('PRD'), sku: document.getElementById('p-sku').value,
        name: document.getElementById('p-name').value, um: document.getElementById('p-um').value,
        embalaje: document.getElementById('p-embalaje').value,
        cost: parseFloat(document.getElementById('p-cost').value) || 0,
        stock: parseFloat(document.getElementById('p-stock').value) || 0
    };
    products.push(prod);
    saveDB(DB_KEYS.PROD, products); renderInventory(); renderPOSGrid(); closeModal('modal-product'); showToast('Insumo guardado manual');
});

const renderDashboard = () => {
    const now = new Date(); let valInv = 0, hoySalidas = 0, mesSalidas = 0;
    products.forEach(p => { if (p.stock > 0) valInv += (p.stock * (p.cost || 0)); });
    salidas.forEach(s => {
        const d = new Date(s.date); const sCost = s.totalCost || 0;
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) mesSalidas += sCost;
        if (d.toLocaleDateString() === now.toLocaleDateString()) hoySalidas += sCost;
    });
    setElemText('kpi-total-inv', formatMoney(valInv)); setElemText('kpi-daily-out', formatMoney(hoySalidas)); setElemText('kpi-month-out', formatMoney(mesSalidas));
};

window.openDeepAnalytics = () => { document.getElementById('dashboard').classList.remove('active'); document.getElementById('deep-analytics').classList.add('active'); const now = new Date(); document.getElementById('da-month-filter').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; window.renderDeepAnalytics(); };
window.closeDeepAnalytics = () => { document.getElementById('deep-analytics').classList.remove('active'); document.getElementById('dashboard').classList.add('active'); };

window.renderDeepAnalytics = () => {
    const filterVal = document.getElementById('da-month-filter').value;
    if (!filterVal) return;
    const [tYear, tMonth] = filterVal.split('-').map(Number); const targetMonth = tMonth - 1;
    let totalOutVal = 0, areasMap = {}, prodMap = {};
    salidas.forEach(s => {
        const d = new Date(s.date);
        if (d.getFullYear() === tYear && d.getMonth() === targetMonth) {
            totalOutVal += (s.totalCost || 0);
            if(!areasMap[s.area]) areasMap[s.area] = 0;
            areasMap[s.area] += (s.totalCost || 0);
            s.items.forEach(i => {
                if(!prodMap[i.sku]) prodMap[i.sku] = { name: i.name, qty: 0 };
                prodMap[i.sku].qty += i.qty;
            });
        }
    });
    let refsInStock = 0, unitsInStock = 0;
    products.forEach(p => { if (p.stock > 0) { refsInStock++; unitsInStock += p.stock; } });
    setElemText('da-out-val', formatMoney(totalOutVal)); setElemText('da-refs-stock', refsInStock); setElemText('da-units-stock', parseFloat(unitsInStock.toFixed(2)));
    const ulArea = document.getElementById('da-top-areas'); ulArea.innerHTML = '';
    Object.entries(areasMap).sort((a,b)=>b[1]-a[1]).forEach(([area, val]) => { ulArea.innerHTML += `<li><span>${area}</span><strong>${formatMoney(val)}</strong></li>`; });
    const ulProd = document.getElementById('da-top-products'); ulProd.innerHTML = '';
    Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0, 20).forEach(p => { ulProd.innerHTML += `<li><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:250px;">${p.name}</span><strong>${p.qty} Unids</strong></li>`; });
};

const parseJDADate = (dateStr) => { /* IGUAL */ try { const parts = dateStr.split(' '); if(parts.length < 2) return new Date(dateStr).toISOString(); const dateParts = parts[0].split('/'); if(dateParts.length === 3) { const day = dateParts[0]; const month = dateParts[1]; const year = dateParts[2]; return new Date(`${month}/${day}/${year} ${parts[1]} ${parts[2] || ''}`).toISOString(); } return new Date(dateStr).toISOString(); } catch(e) { return new Date().toISOString(); } };

const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });
            resolve(json);
        };
        reader.onerror = reject; reader.readAsArrayBuffer(file);
    });
};

window.processExcelUploads = async () => {
    try {
        const fileInv = document.getElementById('file-inventory').files[0];
        const fileHist = document.getElementById('file-history').files[0];
        const fileClass = document.getElementById('file-classification').files[0];
        if(!fileInv && !fileHist && !fileClass) return showToast('Selecciona al menos un archivo', 'error');
        document.querySelector('#modal-jda-import .btn-primary').textContent = "Procesando...";
        if(fileClass) {
            const classData = await readExcelFile(fileClass);
            classData.forEach(row => {
                const sku = row['Número de artículo']; const embalaje = row['Pedido / trans']; const um = row['UM'];
                if(sku) {
                    let prod = products.find(p => p.sku === String(sku));
                    if(prod) { prod.embalaje = embalaje; if(um) prod.um = um; }
                    else products.push({ id: generateId('PRD'), sku: String(sku), name: 'Sin Nombre', um: um || '', embalaje: embalaje, cost: 0, stock: 0 });
                }
            });
        }
        if(fileInv) {
            const invData = await readExcelFile(fileInv);
            invData.forEach(row => {
                const sku = row['Número de artículo']; const desc = row['Descripción']; const qty = parseFloat(row['Cantidad Almacen']) || 0;
                if(sku) {
                    let prod = products.find(p => p.sku === String(sku));
                    if(prod) { prod.name = desc; prod.stock = qty; } 
                    else { products.push({ id: generateId('PRD'), sku: String(sku), name: desc, um: '', embalaje: '', cost: 0, stock: qty }); }
                }
            });
        }
        if(fileHist) {
            const histData = await readExcelFile(fileHist);
            let transacciones = {};
            histData.forEach(row => {
                const sku = row['Número de artículo']; const desc = row['Descripción']; const qty = parseFloat(row['Cantidad Almacen']) || 0;
                const area = row['Ubicación'] || row['Área'] || 'DESCONOCIDA'; const fechaRaw = row['Fecha agregada'];
                if(sku && qty > 0) {
                    let prod = products.find(p => p.sku === String(sku));
                    if(!prod) { prod = { id: generateId('PRD'), sku: String(sku), name: desc, um: '', embalaje: '', cost: 0, stock: 0 }; products.push(prod); }
                    const txKey = `${fechaRaw}-${area}`;
                    if(!transacciones[txKey]) { transacciones[txKey] = { id: generateId('JDA'), date: parseJDADate(fechaRaw), area: area, items:[], totalCost: 0 }; }
                    transacciones[txKey].items.push({ id: prod.id, sku: String(sku), name: desc, um: prod.um || '', qty: qty, cost: prod.cost || 0 });
                    transacciones[txKey].totalCost += ((prod.cost || 0) * qty);
                }
            });
            salidas =[...Object.values(transacciones), ...salidas];
        }
        saveDB(DB_KEYS.PROD, products); saveDB(DB_KEYS.SALIDAS, salidas); renderInventory(); renderDashboard(); closeModal('modal-jda-import');
        document.querySelector('#modal-jda-import .btn-primary').textContent = "Procesar Archivos"; showToast('Datos de JDA importados correctamente');
    } catch (error) { showToast('Error procesando archivos Excel', 'error'); document.querySelector('#modal-jda-import .btn-primary').textContent = "Procesar Archivos"; }
};

document.getElementById('btn-export-db').addEventListener('click', () => {
    const data = { products, salidas, settings, pedidos: pedidosLocal };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_bodega_${new Date().toISOString().split('T')[0]}.json`; a.click(); showToast('Base de datos exportada');
});

document.getElementById('backup-upload').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.products && data.salidas) {
                products = data.products; salidas = data.salidas; settings = data.settings || settings; pedidosLocal = data.pedidos || pedidosLocal;
                saveDB(DB_KEYS.PROD, products); saveDB(DB_KEYS.SALIDAS, salidas); saveDB(DB_KEYS.SET, settings); saveDB(DB_KEYS.PEDIDOS, pedidosLocal);
                renderInventory(); renderPOSGrid(); renderDashboard(); showToast('Base de datos restaurada');
            }
        } catch (err) { showToast('Archivo de respaldo inválido', 'error'); }
    };
    reader.readAsText(file);
});

document.getElementById('btn-close-shift').addEventListener('click', () => { if(confirm('¿Seguro que desea cerrar sesión?')) location.reload(); });
