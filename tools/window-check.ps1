# 普通启动一次打包后的应用，确认窗口标题/尺寸，并尝试截取整窗画面（开发/验收辅助）。
# 用法: powershell -ExecutionPolicy Bypass -File tools/window-check.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$root = Split-Path -Parent $PSScriptRoot
$exe = Get-ChildItem (Join-Path $root 'dist') -Recurse -Filter '*.exe' | Select-Object -First 1
if (-not $exe) { throw 'dist 下未找到 exe，请先执行 node tools/build-exe.js' }

$p = Start-Process -FilePath $exe.FullName -PassThru
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { break }
}
Start-Sleep -Seconds 3          # 等首帧渲染
$p.Refresh()
$handle = $p.MainWindowHandle
$rect = New-Object WinApi+RECT
[void][WinApi]::GetWindowRect($handle, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top

$shotOk = $false
try {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $shotOk = [WinApi]::PrintWindow($handle, $hdc, 2)   # PW_RENDERFULLCONTENT
  $g.ReleaseHdc($hdc); $g.Dispose()
  $bmp.Save((Join-Path $root 'dist\window.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
} catch { $shotOk = $false }

[pscustomobject]@{
  exe        = $exe.Name
  title      = $p.MainWindowTitle
  width      = $w
  height     = $h
  screenshot = $shotOk
  pid        = $p.Id
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $root 'dist\window-check.json')

Stop-Process -Id $p.Id -Force
Write-Output 'done'