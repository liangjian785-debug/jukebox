Option Explicit

Dim shell, fso, bat
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
bat = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "start.bat")

' Run the batch launcher with no console window.
shell.Run """" & bat & """", 0, False
