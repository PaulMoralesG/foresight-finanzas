# Script para verificar/activar GitHub Pages

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VERIFICAR GITHUB PAGES ACTIVO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🌐 URL de tu aplicación web:" -ForegroundColor Green
Write-Host "   https://paulmoralesg.github.io/foresight-finanzas/" -ForegroundColor Yellow
Write-Host ""

Write-Host "📱 Para acceder desde tu celular:" -ForegroundColor Green
Write-Host "   1. Abre esta URL en el navegador de tu celular" -ForegroundColor White
Write-Host "   2. En Android (Chrome): Menú ⋮ → 'Instalar app'" -ForegroundColor White
Write-Host "   3. En iPhone (Safari): Compartir 📤 → 'Añadir a inicio'" -ForegroundColor White
Write-Host ""

Write-Host "⏳ Abriendo configuración de GitHub Pages..." -ForegroundColor Cyan
Start-Sleep -Seconds 1

# Abrir configuración de GitHub Pages en el navegador
$githubPagesUrl = "https://github.com/PaulMoralesG/foresight-finanzas/settings/pages"
Start-Process $githubPagesUrl

Write-Host ""
Write-Host "✅ PASOS EN GITHUB:" -ForegroundColor Green
Write-Host "   1. Verifica que 'Branch' esté en 'main'" -ForegroundColor White
Write-Host "   2. Verifica que 'Folder' esté en '/ (root)'" -ForegroundColor White
Write-Host "   3. Si no está configurado, selecciona 'main' y 'Save'" -ForegroundColor White
Write-Host "   4. Espera 2-3 minutos para que se active" -ForegroundColor White
Write-Host ""

Write-Host "🔄 Probando si la página ya está activa..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

try {
    $response = Invoke-WebRequest -Uri "https://paulmoralesg.github.io/foresight-finanzas/" -Method Head -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ ¡GITHUB PAGES ESTÁ ACTIVO!" -ForegroundColor Green
        Write-Host "   Abre esta URL en tu celular:" -ForegroundColor White
        Write-Host "   https://paulmoralesg.github.io/foresight-finanzas/" -ForegroundColor Yellow
        Write-Host ""
        
        # Abrir la app en el navegador
        Write-Host "🚀 Abriendo aplicación en tu navegador..." -ForegroundColor Cyan
        Start-Sleep -Seconds 1
        Start-Process "https://paulmoralesg.github.io/foresight-finanzas/"
    }
} catch {
    Write-Host "⏳ GitHub Pages aún no está activo o está desplegándose..." -ForegroundColor Yellow
    Write-Host "   Sigue los pasos en la ventana del navegador que se acaba de abrir" -ForegroundColor White
    Write-Host "   Espera 2-3 minutos después de activarlo" -ForegroundColor White
}

Write-Host ""
Write-Host "📖 Más información en: ACCESO-CELULAR.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona cualquier tecla para salir..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
