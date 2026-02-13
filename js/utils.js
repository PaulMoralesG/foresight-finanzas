// UTILIDADES GENERALES

export function formatMoney(amount) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);
}

// TOAST NOTIFICATIONS
export function showNotification(message, type = 'info') {
    // Remove existing toasts
    const existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = `fixed top-6 left-1/2 transform -translate-x-1/2 z-50 flex items-center w-full max-w-xs p-4 space-x-3 text-gray-500 bg-white rounded-lg shadow-2xl slide-up border-l-4 ${type === 'error' ? 'border-red-500' : 'border-blue-500'}`;
    
    let icon = type === 'error' ? '<i class="fa-solid fa-circle-exclamation text-red-500 text-lg"></i>' : '<i class="fa-solid fa-circle-check text-blue-500 text-lg"></i>';

    toast.innerHTML = `
        ${icon}
        <div class="pl-2 text-sm font-bold text-gray-800">${message}</div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('slide-up');
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Helper para botones con estado de carga
export async function runAsyncAction(btnElement, asyncFn, loadingText = "Procesando...") {
    const originalText = btnElement.innerHTML; // Guardar icono/texto original
    // Si es input/button
    if(btnElement.tagName === 'INPUT') btnElement.value = loadingText;
    else btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${loadingText}`; // Spinner FontAwesome
    
    btnElement.disabled = true;
    
    try {
        await asyncFn();
    } finally {
        // Restaurar botón
        if(btnElement.tagName === 'INPUT') btnElement.value = originalText;
        else btnElement.innerHTML = originalText;
        btnElement.disabled = false;
    }
}