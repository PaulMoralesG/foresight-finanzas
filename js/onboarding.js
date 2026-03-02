// Tutorial Interactivo para nuevos usuarios
import { showNotification } from './utils.js';
import { updateUI } from './ui.js';

let currentStep = 0;
const steps = [
    {
        title: "¡Bienvenido a Foresight! 👋",
        message: "Te ayudaremos a controlar tus finanzas personales y de tu negocio de forma simple. ¡No necesitas ser contador!",
        target: null,
        position: "center"
    },
    {
        title: "Tu Saldo Disponible 💰",
        message: "Aquí verás cuánto dinero tienes disponible (Ingresos - Gastos). Se actualiza automáticamente.",
        target: "#available-display",
        position: "bottom"
    },
    {
        title: "¿Tu Negocio Está Dando Utilidad? 💼",
        message: "Esta tarjeta calcula si tu NEGOCIO es rentable (ventas - gastos de negocio). Solo mide movimientos del negocio, no personales.",
        target: "#profit-amount",
        position: "bottom"
    },
    {
        title: "¿Está Creciendo tu Negocio? 📈",
        message: "Compara las VENTAS de tu negocio con el mes anterior. Solo mide ingresos del negocio, no personales. ¡Muy importante!",
        target: "#growth-percentage",
        position: "bottom"
    },
    {
        title: "Registra tus Movimientos ✍️",
        message: "Usa el botón + para registrar cada venta (ingreso) o gasto. Es rápido y fácil.",
        target: ".add-button",
        position: "top"
    },
    {
        title: "Personal vs Negocio 💼",
        message: "Separa tus gastos personales de los del negocio. Esto es clave para saber cuánto ganas realmente.",
        target: null,
        position: "center"
    },
    {
        title: "¡Listo para Comenzar! 🚀",
        message: "Registra tu primera venta o gasto para empezar. Los datos se guardan en la nube automáticamente.",
        target: null,
        position: "center"
    }
];

export function shouldShowOnboarding() {
    const hasSeenOnboarding = localStorage.getItem('foresight_onboarding_completed');
    return !hasSeenOnboarding;
}

export function startOnboarding() {
    if (!shouldShowOnboarding()) return;
    
    currentStep = 0;
    showStep(currentStep);
}

function showStep(stepIndex) {
    if (stepIndex >= steps.length) {
        completeOnboarding();
        return;
    }

    const step = steps[stepIndex];
    createTooltip(step, stepIndex);
}

function createTooltip(step, stepIndex) {
    // Remover tooltip existente
    const existing = document.getElementById('onboarding-tooltip');
    if (existing) existing.remove();

    // Crear overlay
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'fixed inset-0 bg-black/70 z-[100] transition-opacity';
    overlay.style.opacity = '0';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.style.opacity = '1', 10);

    // Crear tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'onboarding-tooltip';
    tooltip.className = 'fixed z-[101] bg-white rounded-2xl shadow-2xl max-w-sm mx-4 p-5';
    
    // Posicionar tooltip
    if (step.position === 'center' || !step.target) {
        tooltip.style.cssText = `
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: calc(100% - 2rem);
            max-width: 380px;
        `;
    } else {
        const targetEl = document.querySelector(step.target);
        if (targetEl) {
            // Scroll automático hacia el elemento
            targetEl.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'center' 
            });
            
            // Highlight del elemento objetivo con mejor visibilidad
            targetEl.style.position = 'relative';
            targetEl.style.zIndex = '102';
            targetEl.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.8), 0 0 20px rgba(59, 130, 246, 0.4)';
            targetEl.style.borderRadius = '1rem';
            targetEl.style.transition = 'all 0.3s ease';
            
            const rect = targetEl.getBoundingClientRect();
            if (step.position === 'bottom') {
                tooltip.style.cssText = `
                    top: ${rect.bottom + 20}px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: calc(100% - 2rem);
                    max-width: 380px;
                `;
            } else if (step.position === 'top') {
                tooltip.style.cssText = `
                    bottom: ${window.innerHeight - rect.top + 20}px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: calc(100% - 2rem);
                    max-width: 380px;
                `;
            }
        } else {
            // Si no encuentra el elemento, centrar
            tooltip.style.cssText = `
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: calc(100% - 2rem);
                max-width: 380px;
            `;
        }
    }

    tooltip.innerHTML = `
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-xl font-black text-gray-800">${step.title}</h3>
                <button onclick="window.skipOnboarding()" class="text-gray-400 hover:text-gray-600 text-sm font-bold">
                    Saltar
                </button>
            </div>
            <p class="text-sm text-gray-600 leading-relaxed">${step.message}</p>
        </div>
        <div class="flex items-center justify-between">
            <div class="flex gap-1.5">
                ${steps.map((_, i) => `
                    <div class="w-2 h-2 rounded-full ${i === stepIndex ? 'bg-blue-500' : 'bg-gray-200'}"></div>
                `).join('')}
            </div>
            <div class="flex gap-2">
                ${stepIndex > 0 ? `
                    <button onclick="window.prevOnboardingStep()" class="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition">
                        Atrás
                    </button>
                ` : ''}
                <button onclick="window.nextOnboardingStep()" class="px-5 py-2 text-sm font-bold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition shadow-sm">
                    ${stepIndex === steps.length - 1 ? '¡Comenzar!' : 'Siguiente'}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(tooltip);
    
    // Animar entrada
    tooltip.style.opacity = '0';
    tooltip.style.transform = tooltip.style.transform + ' scale(0.9)';
    setTimeout(() => {
        tooltip.style.transition = 'all 0.3s ease';
        tooltip.style.opacity = '1';
        tooltip.style.transform = tooltip.style.transform.replace('scale(0.9)', 'scale(1)');
    }, 10);
}

function removeTooltip() {
    const tooltip = document.getElementById('onboarding-tooltip');
    const overlay = document.getElementById('onboarding-overlay');
    
    // Remover highlights
    document.querySelectorAll('[style*="z-index: 102"]').forEach(el => {
        el.style.position = '';
        el.style.zIndex = '';
        el.style.boxShadow = '';
        el.style.borderRadius = '';
    });
    
    if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.transform = tooltip.style.transform.replace('scale(1)', 'scale(0.9)');
        setTimeout(() => {
            if (tooltip && tooltip.parentNode) {
                tooltip.remove();
            }
        }, 300);
    }
    
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay && overlay.parentNode) {
                overlay.remove();
            }
        }, 300);
    }
}

function completeOnboarding() {
    removeTooltip();
    localStorage.setItem('foresight_onboarding_completed', 'true');
    
    // Asegurar que el overlay se elimine completamente
    setTimeout(() => {
        // Limpiar cualquier overlay residual
        const overlays = document.querySelectorAll('#onboarding-overlay, #onboarding-tooltip');
        overlays.forEach(el => el && el.remove());
        
        // Refrescar la UI principal
        if (typeof updateUI === 'function') {
            updateUI();
        }
        
        // Mostrar notificación después de que la UI esté limpia
        showNotification('¡Tutorial completado! Ya puedes comenzar a usar Foresight 🚀', 'success');
    }, 400);
}

// Funciones globales para los botones
window.nextOnboardingStep = () => {
    removeTooltip();
    currentStep++;
    setTimeout(() => showStep(currentStep), 350);
};

window.prevOnboardingStep = () => {
    removeTooltip();
    currentStep--;
    setTimeout(() => showStep(currentStep), 350);
};

window.skipOnboarding = () => {
    completeOnboarding();
};

// Función para resetear el tutorial (útil para desarrollo/testing)
export function resetOnboarding() {
    localStorage.removeItem('foresight_onboarding_completed');
}

// Exponer función de reset globalmente
window.resetOnboarding = resetOnboarding;
