param(
    [string]$ProjectPath = "."
)

# 1. Разрешить запуск скриптов (только для текущего процесса)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force

# 2. Если Vercel CLI не установлен — устанавливаем
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "Vercel CLI не найден — устанавливаем..."
    npm install -g vercel
} else {
    Write-Host "Vercel CLI найден."
}

# 3. Авторизация через браузер
Write-Host "Запуск входа в Vercel — откроется браузер..."
vercel login

# 4. Деплой на прод
Write-Host "Выполняем деплой в папке:" (Resolve-Path $ProjectPath)
Push-Location $ProjectPath
vercel --prod
Pop-Location

Write-Host "Готово! Сайт развернут."
