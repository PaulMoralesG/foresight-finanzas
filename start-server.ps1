# Servidor HTTP Simple con PowerShell
# Puerto 8080 - Abre http://localhost:8080 en tu navegador

$port = 8080
$url = "http://localhost:$port/"

Write-Host "Iniciando servidor en $url" -ForegroundColor Green
Write-Host "Carpeta: $PSScriptRoot" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
Write-Host ""

# Crear listener HTTP
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

# Abrir navegador automaticamente
Start-Process $url

Write-Host "Servidor iniciado correctamente" -ForegroundColor Green
Write-Host ""

# Tipos MIME
$mimeTypes = @{
    '.html' = 'text/html'
    '.css' = 'text/css'
    '.js' = 'application/javascript'
    '.json' = 'application/json'
    '.png' = 'image/png'
    '.jpg' = 'image/jpeg'
    '.gif' = 'image/gif'
    '.svg' = 'image/svg+xml'
    '.ico' = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
}

try {
    while ($listener.IsListening) {
        # Esperar petición
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Obtener ruta del archivo
        $path = $request.Url.LocalPath
        if ($path -eq '/') { $path = '/index.html' }
        
        $filePath = Join-Path $PSScriptRoot $path.TrimStart('/')
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - $($request.HttpMethod) $path" -ForegroundColor Gray

        if (Test-Path $filePath -PathType Leaf) {
            # Archivo encontrado
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            
            $response.ContentType = if ($mimeTypes.ContainsKey($extension)) { 
                $mimeTypes[$extension] 
            } else { 
                'application/octet-stream' 
            }
            
            $response.ContentLength64 = $content.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            # Archivo no encontrado
            $response.StatusCode = 404
            $html = "<h1>404 - Archivo no encontrado</h1><p>$path</p>"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            Write-Host "404 - No encontrado: $path" -ForegroundColor Red
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host ""
    Write-Host "Servidor detenido" -ForegroundColor Yellow
}
