document.addEventListener('DOMContentLoaded', () => {
    // ===== Configuracion base: rutas de la API =====
    const API_BASE = 'https://sistema-de-registro-de-visitas.onrender.com';
    const REGISTROS_URL = `${API_BASE}/api/registros/`;
    const DASHBOARD_URL = `${API_BASE}/api/dashboard/`;

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

    // Botón cerrar sesión
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        window.location.href = './index.html';
    });

    // Botón "Ver registros" hace scroll a la tabla
    document.getElementById('scroll-registros').addEventListener('click', () => {
        document.getElementById('seccion-registros').scrollIntoView({ behavior: 'smooth' });
    });

    // ===== Dashboard (métricas y gráficos) =====
    async function fetchDashboard() {
        try {
            const response = await fetch(DASHBOARD_URL, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const data = await response.json();

            // Si la API responde error, revisar si es tema de autenticación
            if (!response.ok) {
                if (
                    response.status === 401 ||
                    response.status === 403 ||
                    data.code === 'token_not_valid'
                ) {
                    handleAuthError();
                    return;
                }

                alert("Error al cargar dashboard: " + (data.detail || ""));
                return;
            }

            // Métricas numéricas
            document.getElementById('total-visitas').innerText = data.total_visitas;
            document.getElementById('visitas-hoy').innerText = data.visitas_hoy;
            document.getElementById('visitas-activas').innerText = data.visitas_activas;

            // Gráfico: visitas por día
            if (Array.isArray(data.visitas_por_dia)) {
                const labelsDia = data.visitas_por_dia.map(item => {
                    const [year, month, day] = item.dia.split('-');
                    return `${day}/${month}`;
                });
                const valoresDia = data.visitas_por_dia.map(item => item.total);

                const opcionesVisitasDia = {
                    chart: {
                        type: 'bar',
                        height: 260,
                        toolbar: { show: false },
                        foreColor: '#9CA3AF',
                        background: 'transparent',
                    },
                    series: [{ name: 'Visitas', data: valoresDia }],
                    xaxis: {
                        categories: labelsDia,
                        axisBorder: { show: false },
                        axisTicks: { show: false },
                    },
                    yaxis: {
                        labels: { formatter: val => val.toFixed(0) }
                    },
                    grid: {
                        borderColor: '#374151',
                        strokeDashArray: 4,
                    },
                    colors: ['#6366F1'],
                    dataLabels: { enabled: false },
                    plotOptions: {
                        bar: { borderRadius: 4, columnWidth: '45%' }
                    }
                };

                new ApexCharts(
                    document.querySelector("#visitasPorDiaChart"),
                    opcionesVisitasDia
                ).render();
            }

            // Gráfico: estado de visitas (finalizadas vs incompletas)
            const finalizadas = data.estados?.finalizadas || 0;
            const incompletas = data.estados?.incompletas || 0;

            const opcionesEstado = {
                chart: {
                    type: 'donut',
                    height: 260,
                    toolbar: { show: false },
                    foreColor: '#9CA3AF',
                    background: 'transparent',
                },
                series: [finalizadas, incompletas],
                labels: ['Finalizadas', 'Incompletas'],
                colors: ['#22C55E', '#EF4444'],
                legend: {
                    position: 'bottom',
                    labels: { colors: '#E5E7EB' }
                },
                dataLabels: {
                    formatter: (val, opts) => {
                        const valor = opts.w.globals.series[opts.seriesIndex];
                        return `${valor} (${val.toFixed(1)}%)`;
                    }
                }
            };

            new ApexCharts(
                document.querySelector("#estadoVisitasChart"),
                opcionesEstado
            ).render();
        } catch (error) {
            // Errores de red o excepciones en fetch
            console.error(error);
            alert("Error de red al cargar el dashboard.");
        }
    }

    // ===== TABLA DE REGISTROS =====
    const registrosList = document.getElementById('registros-list');

    // Filtros de búsqueda
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

    let registrosOriginales = [];   // datos crudos desde la API
    let registrosProcesados = [];   // datos tras filtros + orden
    let currentPage = 1;
    let pageSize = parseInt(pageSizeSelect.value, 10) || 10;

    // Orden inicial: horaentrada descendente
    let sortField = 'horaentrada';
    let sortDirection = 'desc';

    // Formatea un string de fecha ISO a "HH:MM - DD/MM/YYYY"
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

    // Convierte un string de fecha a milisegundos (para ordenar)
    function timeFromString(str) {
        return str ? new Date(str).getTime() : 0;
    }

    // Comparador usado para ordenar la lista en memoria
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

    // Aplica filtros y orden sobre registrosOriginales
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

    // Renderiza filas de la tabla
    function renderRegistros(lista) {
        registrosList.innerHTML = '';

        if (!lista.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="6" class="px-6 py-4 text-center text-sm text-gray-400">
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
            `;
            registrosList.appendChild(tr);
        });
    }

    // Calcula qué registros mostrar según la página actual
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

    // Recalcula lista filtrada + ordenada y reinicia paginación
    function actualizarYRender() {
        registrosProcesados = getRegistrosFiltradosYOrdenados();
        currentPage = 1;
        renderPaginaActual();
    }

    // Actualiza los íconos de orden en los encabezados
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

    // Click en encabezados para ordenar
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

    // Filtros de texto instantáneos
    [searchGlobal, filtroNombre, filtroRut, filtroMotivo].forEach(input => {
        input.addEventListener('input', actualizarYRender);
    });
    filtroEstado.addEventListener('change', actualizarYRender);

    // Cambio de tamaño de página
    pageSizeSelect.addEventListener('change', () => {
        pageSize = parseInt(pageSizeSelect.value, 10) || 10;
        currentPage = 1;
        renderPaginaActual();
    });

    // Botones de paginación
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

    // ===== Fetch de registros (soporta paginación DRF) =====
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

            // Caso 1: la API devuelve lista simple
            if (Array.isArray(data)) {
                registrosOriginales = data;
                actualizarYRender();
                return;
            }

            // Caso 2: paginación DRF
            const pageResults = data.results || [];
            registrosOriginales = registrosOriginales.concat(pageResults);

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

    // ===== Inicializacion del dashboard =====
    fetchDashboard();
    fetchRegistros();
});