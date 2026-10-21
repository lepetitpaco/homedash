; Installateur Windows de homedash (build-windows.sh) : pour l'utilisateur seul,
; sans droits admin, dans %LOCALAPPDATA%\Programs\homedash, avec un raccourci
; dans le menu Démarrer (et sur le Bureau) et un désinstalleur.
; Les données de l'appli (connexions des onglets) restent dans %APPDATA%\homedash :
; la désinstallation ne les touche pas.
Unicode true
!include "MUI2.nsh"

Name "homedash"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\homedash"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\homedash"

!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\homedash.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer homedash"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Section "homedash"
  ; une version déjà lancée verrouillerait ses fichiers
  nsExec::Exec 'taskkill /IM homedash.exe /F'
  SetOutPath "$INSTDIR"
  ; remplace une version précédente, sans laisser ses anciens fichiers
  RMDir /r "$INSTDIR\resources"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Desinstaller homedash.exe"
  CreateShortcut "$SMPROGRAMS\homedash.lnk" "$INSTDIR\homedash.exe"
  CreateShortcut "$DESKTOP\homedash.lnk" "$INSTDIR\homedash.exe"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "homedash"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "homedash"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\homedash.exe"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Desinstaller homedash.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM homedash.exe /F'
  Delete "$SMPROGRAMS\homedash.lnk"
  Delete "$DESKTOP\homedash.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST}"
SectionEnd
