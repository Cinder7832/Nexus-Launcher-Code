; Custom NSIS script for Nexus Launcher uninstaller
; Adds an option to remove all installed games during uninstall

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Would you also like to remove all installed games?$\r$\n$\r$\nThis will permanently delete all game files, settings, and saved data.$\r$\nThis cannot be undone." IDNO _nx_skip_cleanup

  ; Always try the default game install location
  IfFileExists "$LOCALAPPDATA\NexusLauncherGames\*.*" 0 _nx_no_default
    RMDir /r "$LOCALAPPDATA\NexusLauncherGames"
  _nx_no_default:

  ; Try custom install root from the hint file written by the launcher
  ClearErrors
  ReadINIStr $0 "$APPDATA\${APP_FILENAME}\uninstall_hint.ini" "Paths" "InstallRoot"
  IfErrors _nx_no_custom 0
  StrLen $1 $0
  IntCmp $1 2 _nx_no_custom _nx_no_custom 0
  IfFileExists "$0\*.*" 0 _nx_no_custom
    RMDir /r "$0"
  _nx_no_custom:

  ; Clean up all launcher user data (settings, installed.json, etc.)
  RMDir /r "$APPDATA\${APP_FILENAME}"

  _nx_skip_cleanup:
!macroend
