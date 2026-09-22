@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo node_modules nao encontrado. Rode INSTALAR.bat primeiro.
  pause
  exit /b 1
)
if not exist .env.local (
  echo ERRO: .env.local nao encontrado.
  echo Copie o .env.local da instalacao antiga para esta pasta.
  pause
  exit /b 1
)
call npm run dev
