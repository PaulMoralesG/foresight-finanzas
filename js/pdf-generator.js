// PDF Generator Module - Lazy Loading
import { formatMoney } from './utils.js';
import { getCategories } from './config-loader.js';

let jsPDFLoaded = false;
let jsPDFInstance = null;
let categoriesCache = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function loadJsPDF() {
    if (jsPDFLoaded && jsPDFInstance) return jsPDFInstance;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDFInstance = window.jspdf.jsPDF;
        jsPDFLoaded = true;
        return jsPDFInstance;
    }
    throw new Error('jsPDF no se cargó correctamente');
}

// Genera un PDF simple del mes actual
export async function generatePDFReport(monthly, viewDate, label = '') {
    const jsPDF = await loadJsPDF();
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = months[viewDate.getMonth()];
    const year = viewDate.getFullYear();
    const totalIncome = monthly.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = monthly.filter(i => i.type === 'expense' || !i.type).reduce((sum, i) => sum + i.amount, 0);
    const balance = totalIncome - totalExpenses;

    const doc = new jsPDF();
    doc.setFontSize(18);
    const title = label ? `Reporte ${label} - ${monthName} ${year}` : `Reporte Financiero - ${monthName} ${year}`;
    doc.text(title, 15, 20);
    doc.setFontSize(12);
    doc.text(`Saldo Final: ${formatMoney(balance)}`, 15, 35);
    doc.text(`Ingresos: ${formatMoney(totalIncome)}`, 15, 45);
    doc.text(`Gastos: ${formatMoney(totalExpenses)}`, 15, 55);

    // Tabla simple de movimientos
    if (monthly.length > 0) {
        const tableData = monthly.map(item => {
            const tipo = item.type === 'income' ? 'Ingreso' : 'Gasto';
            const businessType = item.businessType === 'personal' ? 'Personal' : 'Negocio';
            return [
                new Date(item.date).toLocaleDateString('es-ES'), 
                tipo, 
                businessType,
                formatMoney(item.amount), 
                item.concept || ''
            ];
        });
        doc.autoTable({
            startY: 65,
            head: [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Concepto']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8 },
            margin: { left: 15, right: 15 },
            columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 20 },
                2: { cellWidth: 25 },
                3: { cellWidth: 25 },
                4: { cellWidth: 'auto' }
            }
        });
    } else {
        doc.text('No hay movimientos registrados en este período.', 15, 70);
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        const footerText = `Generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}`;
        doc.text(footerText, 15, 285);
        doc.text(`Página ${i} de ${pageCount}`, 195, 285, { align: 'right' });
    }

    return { doc, monthName, year };
}
