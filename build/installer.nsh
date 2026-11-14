; ============================================================================
; Muling Env Box - uninstall-time data cleanup prompt
;
; This file is listed in package.json -> build.nsis.include, so electron-builder
; prepends it to the generated NSIS script (before installer.nsi's own includes).
; That means the macros below already exist when assistedInstaller.nsh declares
; the uninstaller pages, and we must pull in nsDialogs / LogicLib ourselves.
;
;   customUnWelcomePage -> replaces the default uninstall welcome page
;   customUnInstall     -> deletes the folders the user ticked
;
; Silent uninstall (/S) never shows the page, so both state variables stay
; empty and nothing is deleted (same as "keep everything").
;
; NOTE: the variables are declared inside the macro on purpose. The installer
; pass compiles this file but skips the uninstaller pages, and NSIS treats an
; unused Var as warning 6001, which electron-builder escalates to an error.
; ============================================================================

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!macro customUnWelcomePage
  Var MulingCfgCheck
  Var MulingEnvCheck
  Var MulingCfgState
  Var MulingEnvState

  UninstPage custom un.mulingDataPage un.mulingDataPageLeave

  Function un.mulingDataPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "卸载会删除软件本体（安装目录）。下面两类数据不在安装目录里，请选择是否一并删除："
    Pop $0

    ${NSD_CreateCheckbox} 0 30u 100% 30u "个人配置（窗口设置、日志、配置文件）$\r$\n$APPDATA\muling-environment-box"
    Pop $MulingCfgCheck
    ${NSD_SetState} $MulingCfgCheck ${BST_UNCHECKED}

    ${NSD_CreateCheckbox} 0 66u 100% 30u "已安装的环境（JDK / Node / MySQL 等）$\r$\n$LOCALAPPDATA\Muling\env"
    Pop $MulingEnvCheck
    ${NSD_SetState} $MulingEnvCheck ${BST_UNCHECKED}

    ${NSD_CreateLabel} 0 102u 100% 24u "不勾选则保留数据，下次安装后可直接继续使用。"
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function un.mulingDataPageLeave
    ${NSD_GetState} $MulingCfgCheck $MulingCfgState
    ${NSD_GetState} $MulingEnvCheck $MulingEnvState
  FunctionEnd
!macroend

!macro customUnInstall
  ${If} $MulingCfgState == ${BST_CHECKED}
    RMDir /r "$APPDATA\muling-environment-box"
  ${EndIf}

  ${If} $MulingEnvState == ${BST_CHECKED}
    RMDir /r "$LOCALAPPDATA\Muling\env"
  ${EndIf}
!macroend
