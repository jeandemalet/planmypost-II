@echo off
title Publication Organizer Launcher

REM --- !!! Configuration Requise !!! ---
REM Definit le chemin COMPLET vers le dossier racine de votre projet.
REM MODIFIEZ CETTE LIGNE si votre projet n'est pas ici :
set PROJECT_DIR=c:\Users\Jean\Desktop\Code\publication-organizer

REM --- Fin de la Configuration ---

echo ======================================
echo  Lancement de Publication Organizer...
echo ======================================
echo(
echo Dossier du projet configure : "%PROJECT_DIR%"
echo(

REM Verifie si le dossier du projet existe
if not exist "%PROJECT_DIR%\package.json" goto :PathError

REM --- Si le chemin est OK, continue ici ---

REM Se place dans le repertoire du projet
cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :CDError
echo Repertoire actuel: %CD%
echo(

echo Verification/Installation des dependances Node.js (npm install)...
npm install
if errorlevel 1 goto :NpmError
echo Dependances verifiees/installees avec succes.
echo(

echo Lancement du serveur (node server.js)...
echo (Appuyez sur Ctrl+C dans cette fenetre pour arreter le serveur)
echo Rappel : Assurez-vous que MongoDB est demarre !
echo(

node server.js

echo(
echo Le processus serveur s'est termine ou a ete arrete.
pause
goto :EOF

REM --- Sections de Gestion des Erreurs ---

:PathError
echo ERREUR: Le dossier du projet configure ne semble pas correct.
echo Impossible de trouver 'package.json' dans :
echo "%PROJECT_DIR%"
echo(
echo Verifiez la variable 'PROJECT_DIR' au debut de ce script (.bat).
pause
exit /b 1

:CDError
echo ERREUR: Impossible de naviguer vers le dossier du projet : "%PROJECT_DIR%"
pause
exit /b 1

:NpmError
echo(
echo ERREUR: 'npm install' a echoue.
echo Verifiez que Node.js et npm sont bien installes et fonctionnels.
echo Verifiez votre connexion internet ou les logs npm.
echo Assurez-vous d'etre dans le bon dossier : "%PROJECT_DIR%"
pause
exit /b 1

:EOF
REM Marqueur de fin de fichier pour GOTO