; ============================================================================
; Muling Env Box - uninstall-time data cleanup prompt
;
; This file is listed in package.json -> build.nsis.include, so electron-builder
; prepends it to the generated NSIS script (before installer.nsi's own includes).
; That means the macros below already exist when assistedInstaller.nsh declares
; the uninstaller pages, and we must pull in nsDialogs / LogicLib ourselves.
;
;   customUnWelcomePage -> replaces the default uninstall welcome page
;   customUnInstall     -> deletes the folders / env vars the user ticked
;
; Silent uninstall (/S) never shows the page, so all state variables stay empty
; and nothing is deleted (same as "keep everything").
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

    ${NSD_CreateCheckbox} 0 66u 100% 30u "已安装的环境与相关环境变量（JDK / Node / MySQL 等）$\r$\n$LOCALAPPDATA\Muling\env；注入的 JAVA_HOME 等变量与指向它的 PATH 条目一起清掉"
    Pop $MulingEnvCheck
    ${NSD_SetState} $MulingEnvCheck ${BST_UNCHECKED}

    ${NSD_CreateLabel} 0 102u 100% 24u "不勾选则保留数据，下次安装后可直接继续使用；勾了「已安装的环境」就会连变量一起收走。"
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

  ; 先清环境变量，再删目录：--purge-env 模式需要程序本体还在。
  ; 环境变量只删指向沙箱目录的那些（JAVA_HOME 之类 + 对应 PATH 条目），别处的一律不动。
  ${If} $MulingEnvState == ${BST_CHECKED}
    DetailPrint "正在清理注入的环境变量与 PATH 条目…"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $\"$INSTDIR\沐柠环境盒.exe$\" -ArgumentList --purge-env -Verb RunAs -Wait"'
    Pop $0
    DetailPrint "环境变量清理退出码：$0"

    RMDir /r "$LOCALAPPDATA\Muling\env"
  ${EndIf}
!macroend
