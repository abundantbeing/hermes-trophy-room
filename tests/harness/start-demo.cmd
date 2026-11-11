@echo off
rem Starts the demo backend (curated data, throwaway home) and the Desktop test shell, then opens the trophy room.
rem Needs Python on PATH. Close the two console windows to stop it.
cd /d "%~dp0..\.."
start "Trophy Room demo backend" cmd /k python -X utf8 tests\harness\hero_server.py --port 8770
start "Trophy Room test shell" cmd /k python -X utf8 -m http.server 8771 --bind 127.0.0.1
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:8771/tests/harness/index.html?route=/trophy-room"
