document.addEventListener('DOMContentLoaded', () => {
    // ===== Configuracion base: rutas de la API =====
    const API_BASE = 'https://sistema-de-registro-de-visitas.onrender.com';
    const REGISTROS_URL = `${API_BASE}/api/registros/`;

    // ===== Autenticacion =====
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
        alert('No has iniciado sesión. Redirigiendo...');
        window.location.href = './index.html';
        return;
    }

    // Manejo centralizado cuando el token es inválido / ha expirado
    function handleAuthError() {
        alert('Tu sesión ha expirado o el token no es válido. Por favor, inicia sesión nuevamente.');
        localStorage.removeItem('access_token');
        window.location.href = './index.html';
    }

    // Botón cerrar sesión (solo si existe en esta página)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            window.location.href = './index.html';
        });
    }

    // ===== Elementos de la tabla =====
    const registrosList = document.getElementById('registros-list');

    // Filtros
    const searchGlobal = document.getElementById('search-global');
    const filtroNombre = document.getElementById('filter-nombre');
    const filtroRut = document.getElementById('filter-rut');
    const filtroMotivo = document.getElementById('filter-motivo');
    const filtroEstado = document.getElementById('filter-estado');

    // Paginación
    const pageSizeSelect = document.getElementById('page-size');
    const pageStart = document.getElementById('page-start');
    const pageEnd = document.getElementById('page-end');
    const pageTotal = document.getElementById('page-total');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    // Orden por encabezado
    const sortHeaders = document.querySelectorAll('th[data-sort]');

    let registrosOriginales = [];
    let registrosProcesados = [];
    let currentPage = 1;
    let pageSize = parseInt(pageSizeSelect.value, 10) || 10;

    // Orden inicial: horaentrada descendente
    let sortField = 'horaentrada';
    let sortDirection = 'desc';

    // ===== Barra lateral: referencias a elementos =====
    const sidebar = document.getElementById('sidebar-registro');
    const btnNuevoRegistro = document.getElementById('btn-nuevo-registro');
    const sidebarClose = document.getElementById('sidebar-close');
    const btnCancelarSidebar = document.getElementById('btn-cancelar-sidebar');
    const formRegistro = document.getElementById('form-registro');
    const btnEliminarRegistro = document.getElementById('btn-eliminar-registro');

    // Input oculto: almacena la URL completa del recurso (no solo el id)
    const inputId = document.getElementById('registro-id');
    const inputNombre = document.getElementById('registro-nombre');
    const inputRut = document.getElementById('registro-rut');
    const inputMotivo = document.getElementById('registro-motivo');
    const inputHoraEntrada = document.getElementById('registro-horaentrada');
    const inputHoraSalida = document.getElementById('registro-horasalida');
    const inputEstado = document.getElementById('registro-estado');
    const sidebarTitle = document.getElementById('sidebar-title');

    // Abre el sidebar en modo "crear" o "editar"
    function abrirSidebar(modo, registro = null) {
        formRegistro.dataset.modo = modo; // "crear" | "editar"
        if (modo === 'crear') {
            sidebarTitle.textContent = 'Nuevo registro';
            inputId.value = '';
            inputNombre.value = '';
            inputRut.value = '';
            inputMotivo.value = '';
            inputHoraEntrada.value = '';
            inputHoraSalida.value = '';
            inputEstado.checked = false;
            btnEliminarRegistro.classList.add('hidden');
        } else if (modo === 'editar' && registro) {
            sidebarTitle.textContent = 'Editar registro';
            inputId.value = registro.url || '';
            inputNombre.value = registro.nombre || '';
            inputRut.value = registro.rut || '';
            inputMotivo.value = registro.motivo || '';
            inputHoraEntrada.value = registro.horaentrada
                ? new Date(registro.horaentrada).toISOString().slice(0, 16)
                : '';
            inputHoraSalida.value = registro.horasalida
                ? new Date(registro.horasalida).toISOString().slice(0, 16)
                : '';
            inputEstado.checked = !!registro.estado_finalizado;
            btnEliminarRegistro.classList.remove('hidden');
        }
        sidebar.classList.remove('translate-x-full');
    }

    function cerrarSidebar() {
        sidebar.classList.add('translate-x-full');
    }

    if (btnNuevoRegistro) btnNuevoRegistro.addEventListener('click', () => abrirSidebar('crear'));
    if (sidebarClose) sidebarClose.addEventListener('click', cerrarSidebar);
    if (btnCancelarSidebar) btnCancelarSidebar.addEventListener('click', cerrarSidebar);

    // ===== Validacion del rut del visitante =====
    if (inputRut) {
        inputRut.addEventListener('invalid', function () {
            if (this.validity.patternMismatch) {
                this.setCustomValidity('Formato de RUT inválido. Ejemplo: 12345678-9');
            } else if (this.validity.valueMissing) {
                this.setCustomValidity('El RUT es obligatorio.');
            } else {
                this.setCustomValidity('');
            }
        });

        inputRut.addEventListener('input', function () {
            this.setCustomValidity('');
        });
    }

    // ===== Formatos y orden =====
    function formatFecha(fechaString) {
        if (!fechaString) return "-";
        const fecha = new Date(fechaString);
        if (isNaN(fecha)) return "-";
        const año = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');
        const hora = String(fecha.getHours()).padStart(2, '0');
        const minuto = String(fecha.getMinutes()).padStart(2, '0');
        return `${hora}:${minuto} - ${dia}/${mes}/${año}`;
    }

    function timeFromString(str) {
        return str ? new Date(str).getTime() : 0;
    }

    function compararRegistros(a, b) {
        let comp = 0;

        switch (sortField) {
            case 'nombre':
                comp = (a.nombre || '').localeCompare(b.nombre || '');
                break;
            case 'rut':
                comp = (a.rut || '').localeCompare(b.rut || '');
                break;
            case 'motivo':
                comp = (a.motivo || '').localeCompare(b.motivo || '');
                break;
            case 'horaentrada':
                comp = timeFromString(a.horaentrada) - timeFromString(b.horaentrada);
                break;
            case 'horasalida':
                comp = timeFromString(a.horasalida) - timeFromString(b.horasalida);
                break;
            case 'estado':
                comp = (a.estado_finalizado === b.estado_finalizado)
                    ? 0
                    : (a.estado_finalizado ? 1 : -1);
                break;
            default:
                comp = 0;
        }

        return sortDirection === 'asc' ? comp : -comp;
    }

    function getRegistrosFiltradosYOrdenados() {
        if (!registrosOriginales.length) return [];

        const search = (searchGlobal.value || '').toLowerCase().trim();
        const fNombre = (filtroNombre.value || '').toLowerCase().trim();
        const fRut = (filtroRut.value || '').toLowerCase().trim();
        const fMotivo = (filtroMotivo.value || '').toLowerCase().trim();
        const fEstado = filtroEstado.value;

        let lista = registrosOriginales.filter(registro => {
            const nombre = (registro.nombre || '').toLowerCase();
            const rut = (registro.rut || '').toLowerCase();
            const motivo = (registro.motivo || '').toLowerCase();

            // Búsqueda global
            if (search && !(nombre.includes(search) || rut.includes(search) || motivo.includes(search))) {
                return false;
            }
            // Filtros por columna
            if (fNombre && !nombre.includes(fNombre)) return false;
            if (fRut && !rut.includes(fRut)) return false;
            if (fMotivo && !motivo.includes(fMotivo)) return false;

            // Filtro por estado
            if (fEstado === 'finalizado' && !registro.estado_finalizado) return false;
            if (fEstado === 'incompleto' && registro.estado_finalizado) return false;

            return true;
        });

        lista.sort(compararRegistros);
        return lista;
    }

    function renderRegistros(lista) {
        registrosList.innerHTML = '';

        if (!lista.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="7" class="px-6 py-4 text-center text-sm text-gray-400">
                    No se encontraron registros
                </td>
            `;
            registrosList.appendChild(tr);
            return;
        }

        lista.forEach(registro => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-800 last:border-0 hover:bg-gray-700/40 transition-colors";

            const estadoFinalizado = !!registro.estado_finalizado;
            const estadoTexto = estadoFinalizado ? 'Finalizado' : 'Incompleto';
            const badgeClase = estadoFinalizado
                ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30'
                : 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30';
            const puntoClase = estadoFinalizado ? 'bg-green-400' : 'bg-yellow-400';

            // Usamos registro.url como identificador para editar/eliminar
            tr.innerHTML = `
                <td class="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-100">
                    ${registro.nombre || '-'}
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-300">
                    ${registro.rut || '-'}
                </td>
                <td class="px-6 py-3 text-sm text-gray-300">
                    ${registro.motivo || '-'}
                </td>
                <td class="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-300">
                    ${formatFecha(registro.horaentrada)}
                </td>
                <td class="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-300">
                    ${formatFecha(registro.horasalida)}
                </td>
                <td class="px-6 py-3">
                    <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClase}">
                        <span class="h-1.5 w-1.5 rounded-full ${puntoClase}"></span>
                        ${estadoTexto}
                    </span>
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-xs text-gray-200">
                    <button data-action="editar-registro" data-url="${registro.url}"
                            class="mr-2 text-indigo-400 hover:text-indigo-200">
                        Editar
                    </button>
                    <button data-action="eliminar-registro" data-url="${registro.url}"
                            class="text-red-400 hover:text-red-200">
                        Eliminar
                    </button>
                </td>
            `;
            registrosList.appendChild(tr);
        });
    }

    function renderPaginaActual() {
        const total = registrosProcesados.length;
        const maxPage = Math.ceil(total / pageSize) || 1;
        if (currentPage > maxPage) currentPage = maxPage;

        const startIndex = total ? (currentPage - 1) * pageSize : 0;
        const endIndex = total ? Math.min(startIndex + pageSize, total) : 0;

        const pagina = registrosProcesados.slice(startIndex, endIndex);
        renderRegistros(pagina);

        pageStart.textContent = total ? startIndex + 1 : 0;
        pageEnd.textContent = endIndex;
        pageTotal.textContent = total;

        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= maxPage;
    }

    function actualizarYRender() {
        registrosProcesados = getRegistrosFiltradosYOrdenados();
        currentPage = 1;
        renderPaginaActual();
    }

    function actualizarIconosOrden() {
        sortHeaders.forEach(th => {
            const field = th.dataset.sort;
            const icons = th.querySelector('[data-sort-icons]');
            if (!icons) return;
            const up = icons.querySelector('[data-arrow="up"]');
            const down = icons.querySelector('[data-arrow="down"]');
            if (!up || !down) return;

            up.className = 'leading-none text-[9px]';
            down.className = 'leading-none text-[9px]';

            up.classList.add('text-gray-600');
            down.classList.add('text-gray-600');

            if (field === sortField) {
                if (sortDirection === 'asc') {
                    up.classList.remove('text-gray-600');
                    up.classList.add('text-indigo-400');
                } else {
                    down.classList.remove('text-gray-600');
                    down.classList.add('text-indigo-400');
                }
            }
        });
    }

    sortHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (!field) return;

            if (sortField === field) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDirection = 'asc';
            }
            actualizarYRender();
            actualizarIconosOrden();
        });
    });

    [searchGlobal, filtroNombre, filtroRut, filtroMotivo].forEach(input => {
        input.addEventListener('input', actualizarYRender);
    });
    filtroEstado.addEventListener('change', actualizarYRender);

    pageSizeSelect.addEventListener('change', () => {
        pageSize = parseInt(pageSizeSelect.value, 10) || 10;
        currentPage = 1;
        renderPaginaActual();
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPaginaActual();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const total = registrosProcesados.length;
        const maxPage = Math.ceil(total / pageSize) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderPaginaActual();
        }
    });

    actualizarIconosOrden();

    // Delegación de eventos en la tabla (editar / eliminar)
    registrosList.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('[data-action="editar-registro"]');
        const btnDel = e.target.closest('[data-action="eliminar-registro"]');

        if (btnEdit) {
            const url = btnEdit.dataset.url;
            const reg = registrosOriginales.find(r => r.url === url);
            if (reg) abrirSidebar('editar', reg);
        } else if (btnDel) {
            const url = btnDel.dataset.url;
            if (confirm('¿Seguro que quieres eliminar este registro?')) {
                eliminarRegistro(url);
            }
        }
    });

    // Envío del formulario (crear / editar)
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const modo = formRegistro.dataset.modo || 'crear';
        const recursoUrl = inputId.value;

        const payload = {
            nombre: inputNombre.value,
            rut: inputRut.value,
            motivo: inputMotivo.value,
            horaentrada: inputHoraEntrada.value ? new Date(inputHoraEntrada.value).toISOString() : null,
            horasalida: inputHoraSalida.value ? new Date(inputHoraSalida.value).toISOString() : null,
            estado_finalizado: inputEstado.checked,
        };

        let url = REGISTROS_URL;
        let method = 'POST';
        if (modo === 'editar' && recursoUrl) {
            url = recursoUrl;
            method = 'PUT';
        }

        try {
            const resp = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                if (
                    resp.status === 401 ||
                    resp.status === 403 ||
                    data.code === 'token_not_valid'
                ) {
                    handleAuthError();
                    return;
                }

                alert('Error al guardar registro: ' + JSON.stringify(data));
                return;
            }

            cerrarSidebar();
            await fetchRegistros();
        } catch (error) {
            console.error(error);
            alert('Error de red al guardar el registro.');
        }
    });

    // Botón eliminar dentro del sidebar
    btnEliminarRegistro.addEventListener('click', async () => {
        const recursoUrl = inputId.value;
        if (!recursoUrl) return;
        if (!confirm('¿Seguro que quieres eliminar este registro?')) return;
        await eliminarRegistro(recursoUrl);
        cerrarSidebar();
    });

    // Elimina un registro usando su URL de recurso
    async function eliminarRegistro(urlRecurso) {
        try {
            const resp = await fetch(urlRecurso, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const data = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                if (
                    resp.status === 401 ||
                    resp.status === 403 ||
                    data.code === 'token_not_valid'
                ) {
                    handleAuthError();
                    return;
                }

                alert('Error al eliminar registro: ' + JSON.stringify(data));
                return;
            }

            await fetchRegistros();
        } catch (error) {
            console.error(error);
            alert('Error de red al eliminar el registro.');
        }
    }

    // ===== FETCH DE REGISTROS (todas las páginas) =====
    async function fetchRegistros(url) {
        if (!url) {
            registrosOriginales = [];
            url = REGISTROS_URL;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const data = await response.json();

            if (!response.ok) {
                if (
                    response.status === 401 ||
                    response.status === 403 ||
                    data.code === 'token_not_valid'
                ) {
                    handleAuthError();
                    return;
                }

                alert("Error al cargar registros: " + (data.detail || ""));
                return;
            }

            // Soporta API con o sin paginación DRF
            const pageResults = data.results || data;
            if (Array.isArray(pageResults)) {
                registrosOriginales = registrosOriginales.concat(pageResults);
            }

            if (data.next) {
                await fetchRegistros(data.next);
            } else {
                actualizarYRender();
            }
        } catch (error) {
            console.error(error);
            alert("Error de red al cargar registros.");
        }
    }

    // ===== Inicializacion =====
    fetchRegistros();
});