!include nsDialogs.nsh
!include FileFunc.nsh

!macro customPageAfterChangeDir
  Var JukeboxDirectoryInput
  Page custom JukeboxDirectoryPage JukeboxDirectoryLeave

Function JukeboxDirectoryPage
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "选择安装位置" "程序将安装到独立的 JukeboxDesktop 文件夹。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "选择磁盘或文件夹后，会自动添加 JukeboxDesktop 子文件夹。"
  Pop $0
  ${NSD_CreateText} 0 40u 78% 14u "$INSTDIR"
  Pop $JukeboxDirectoryInput
  ${NSD_CreateBrowseButton} 80% 40u 20% 14u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 JukeboxDirectoryBrowse
  nsDialogs::Show
FunctionEnd



Function JukeboxDirectoryBrowse
  Pop $0
  ${NSD_GetText} $JukeboxDirectoryInput $0
  nsDialogs::SelectFolderDialog "选择安装磁盘或父文件夹" "$0"
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR $0
    Call JukeboxNormalizeDirectory
    ${NSD_SetText} $JukeboxDirectoryInput "$INSTDIR"
  ${EndIf}
FunctionEnd

Function JukeboxNormalizeDirectory
  StrCpy $0 $INSTDIR 1 -1
  ${If} $0 == "\"
    StrCpy $INSTDIR $INSTDIR -1
  ${EndIf}
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "JukeboxDesktop"
    StrCpy $INSTDIR "$INSTDIR\JukeboxDesktop"
  ${EndIf}
FunctionEnd

Function JukeboxDirectoryLeave
  ${NSD_GetText} $JukeboxDirectoryInput $INSTDIR
  ${If} $INSTDIR == ""
    MessageBox MB_OK "请选择安装文件夹。"
    Abort
  ${EndIf}
  Call JukeboxNormalizeDirectory
FunctionEnd
!macroend
