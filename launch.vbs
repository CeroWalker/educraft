' CraftForge Education Edition - Invisible Silent Launcher with Execution Logging & UTF-8
Dim WshShell, fso, appData, localAppData, targetDir, pyRun, launcherExe, subfolder, folder, bridgeScript, launchLog, cmdStr

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appData = WshShell.ExpandEnvironmentStrings("%APPDATA%")
localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
targetDir = appData & "\KodlandLauncher"

If fso.FolderExists(targetDir) Then
    WshShell.CurrentDirectory = targetDir
End If

' 1. Terminate old hung python processes invisibly
On Error Resume Next
WshShell.Run "taskkill /F /IM python.exe /T", 0, True
On Error GoTo 0

' 2. Locate Python executable
pyRun = ""
If fso.FileExists("C:\Windows\py.exe") Then
    pyRun = "py"
End If

If pyRun = "" Then
    If fso.FolderExists(localAppData & "\Programs\Python") Then
        Set folder = fso.GetFolder(localAppData & "\Programs\Python")
        For Each subfolder in folder.SubFolders
            If fso.FileExists(subfolder.Path & "\python.exe") Then
                pyRun = """" & subfolder.Path & "\python.exe"""
                Exit For
            End If
        Next
    End If
End If

If pyRun = "" Then
    If fso.FolderExists("C:\Program Files") Then
        Set folder = fso.GetFolder("C:\Program Files")
        For Each subfolder in folder.SubFolders
            If InStr(LCase(subfolder.Name), "python") > 0 And fso.FileExists(subfolder.Path & "\python.exe") Then
                pyRun = """" & subfolder.Path & "\python.exe"""
                Exit For
            End If
        Next
    End If
End If

If pyRun = "" Then pyRun = "python"

' 3. Start Python Code Builder Bridge invisibly with UTF-8 log redirection
On Error Resume Next
bridgeScript = targetDir & "\code_builder_bridge.py"
launchLog = targetDir & "\bridge_launch.log"
If fso.FileExists(bridgeScript) Then
    cmdStr = "cmd.exe /c set PYTHONIOENCODING=utf-8 && " & pyRun & " """ & bridgeScript & """ > """ & launchLog & """ 2>&1"
    WshShell.Run cmdStr, 0, False
End If
On Error GoTo 0

' 4. Launch Kodland Launcher
launcherExe = localAppData & "\Programs\kodland-launcher\Kodland Launcher.exe"
If Not fso.FileExists(launcherExe) Then
    launcherExe = localAppData & "\Programs\Kodland Launcher\Kodland Launcher.exe"
End If

If fso.FileExists(launcherExe) Then
    WshShell.Run """" & launcherExe & """", 1, False
End If
