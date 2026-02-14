// PDF Generator Module - Lazy Loading
import { formatMoney } from './utils.js';

let jsPDFLoaded = false;
let jsPDFInstance = null;

// Load jsPDF libraries dynamically
async function loadJsPDF() {
    if (jsPDFLoaded && jsPDFInstance) {
        return jsPDFInstance;
    }

    try {
        // Load jsPDF core
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        // Load autoTable plugin
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
        
        if (window.jspdf && window.jspdf.jsPDF) {
            jsPDFInstance = window.jspdf.jsPDF;
            jsPDFLoaded = true;
            return jsPDFInstance;
        } else {
            throw new Error('jsPDF no se cargó correctamente');
        }
    } catch (error) {
        console.error('Error cargando jsPDF:', error);
        throw error;
    }
}

// Helper to load script dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Get category by ID
function getCategoryById(id) {
    const categories = [
        { id: 'food', label: 'Comida', icon: 'fa-utensils' },
        { id: 'transport', label: 'Transporte', icon: 'fa-bus' },
        { id: 'entertainment', label: 'Entretenimiento', icon: 'fa-gamepad' },
        { id: 'bills', label: 'Servicios', icon: 'fa-file-invoice-dollar' },
        { id: 'health', label: 'Salud', icon: 'fa-heartbeat' },
        { id: 'education', label: 'Educación', icon: 'fa-graduation-cap' },
        { id: 'shopping', label: 'Compras', icon: 'fa-shopping-bag' },
        { id: 'salary', label: 'Salario', icon: 'fa-money-bill-wave' },
        { id: 'investment', label: 'Inversión', icon: 'fa-chart-line' },
        { id: 'gift', label: 'Regalo', icon: 'fa-gift' },
        { id: 'other', label: 'Otro', icon: 'fa-ellipsis-h' }
    ];
    return categories.find(c => c.id === id) || { id: 'other', label: 'Otro', icon: 'fa-ellipsis-h' };
}

export async function generatePDFReport(monthly, currentViewDate) {
    try {
        // Load jsPDF dynamically
        const jsPDF = await loadJsPDF();
        
        const incomeItems = monthly.filter(i => i.type === 'income');
        const expenseItems = monthly.filter(i => i.type === 'expense' || !i.type);
        
        const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
        const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
        const balance = totalIncome - totalExpenses;
        
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = months[currentViewDate.getMonth()];
        const year = currentViewDate.getFullYear();
        
        // Create PDF
        const doc = new jsPDF();
        
        // Header with logo
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text('💰 Foresight Finanzas', 15, 15);
        doc.setFontSize(14);
        doc.setFont(undefined, 'normal');
        doc.text(`Reporte Financiero - ${monthName} ${year}`, 15, 25);
        
        // Summary section
        const yStart = 45;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Resumen del Período', 15, yStart);
        
        // Summary boxes
        const boxY = yStart + 10;
        
        // Balance box
        const balanceColor = balance >= 0 ? [34, 197, 94] : [239, 68, 68];
        doc.setFillColor(...balanceColor);
        doc.roundedRect(15, boxY, 60, 25, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('SALDO FINAL', 45, boxY + 8, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(formatMoney(balance), 45, boxY + 18, { align: 'center' });
        
        // Income box
        doc.setFillColor(34, 197, 94);
        doc.roundedRect(80, boxY, 55, 25, 3, 3, 'F');
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('INGRESOS', 107.5, boxY + 8, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(formatMoney(totalIncome), 107.5, boxY + 18, { align: 'center' });
        
        // Expenses box
        doc.setFillColor(239, 68, 68);
        doc.roundedRect(140, boxY, 55, 25, 3, 3, 'F');
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('GASTOS', 167.5, boxY + 8, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(formatMoney(totalExpenses), 167.5, boxY + 18, { align: 'center' });
        
        // Transactions table
        const tableY = boxY + 35;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.text('Detalle de Transacciones', 15, tableY);
        
        if (monthly.length > 0) {
            const tableData = monthly.map(item => {
                const type = item.type === 'income' ? 'Ingreso' : 'Gasto';
                const cat = getCategoryById(item.category);
                return [
                    item.date,
                    type,
                    cat.label,
                    item.concept,
                    formatMoney(item.amount)
                ];
            });
            
            doc.autoTable({
                startY: tableY + 5,
                head: [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto']],
                body: tableData,
                theme: 'striped',
                headStyles: {
                    fillColor: [37, 99, 235],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 10
                },
                bodyStyles: {
                    fontSize: 9
                },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 35 },
                    3: { cellWidth: 65 },
                    4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
                },
                didParseCell: function(data) {
                    if (data.column.index === 1 && data.section === 'body') {
                        if (data.cell.raw === 'Ingreso') {
                            data.cell.styles.textColor = [34, 197, 94];
                            data.cell.styles.fontStyle = 'bold';
                        } else {
                            data.cell.styles.textColor = [239, 68, 68];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                    if (data.column.index === 4 && data.section === 'body') {
                        const rowData = monthly[data.row.index];
                        if (rowData.type === 'income') {
                            data.cell.styles.textColor = [34, 197, 94];
                        } else {
                            data.cell.styles.textColor = [239, 68, 68];
                        }
                    }
                },
                margin: { left: 15, right: 15 }
            });
        } else {
            doc.setFontSize(11);
            doc.setTextColor(100, 100, 100);
            doc.text('No hay transacciones registradas en este período.', 15, tableY + 10);
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
        
        // Save PDF
        doc.save(`Reporte-${monthName}-${year}.pdf`);
        return true;
    } catch (error) {
        console.error('Error generando PDF:', error);
        return false;
    }
}
