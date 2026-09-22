@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo   Clan Codex v5.8 - instalar e validar
 echo ==========================================
echo.
if not exist .env.local (
  echo AVISO: .env.local nao foi encontrado.
  echo Copie o .env.local da pasta antiga antes de abrir o site.
  echo.
)
echo Instalando dependencias...
call npm install
if errorlevel 1 goto :error

echo.
echo Validando build de producao...
call npm run build
if errorlevel 1 goto :error

echo.
echo Tudo certo. Para iniciar, execute INICIAR.bat
pause
exit /b 0

:error
echo.
echo Houve um erro. Copie a mensagem do CMD e envie no chat.
pause
exit /b 1
