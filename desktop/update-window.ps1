param([Parameter(Mandatory=$true)][string]$StateFile, [switch]$ShowWindow)
if(-not $ShowWindow){
  $arguments=@('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-StateFile',('"'+$StateFile+'"'),'-ShowWindow')
  Start-Process -FilePath "$PSHOME\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  exit
}
Add-Type -AssemblyName PresentationFramework
[xml]$layout = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="点歌机 · 正在更新" Width="480" Height="270" WindowStartupLocation="CenterScreen" ResizeMode="NoResize" Background="#101D19" Foreground="#E8F5EE" Topmost="True">
  <StackPanel Margin="32">
    <TextBlock Text="JUKEBOX · UPDATE" Foreground="#96E4C7" FontSize="12" Margin="0,0,0,15"/>
    <TextBlock Text="让音乐保持新鲜。" FontSize="25" FontWeight="Bold" Margin="0,0,0,18"/>
    <TextBlock Name="Message" Text="正在准备更新…" TextWrapping="Wrap" Margin="0,0,0,14"/>
    <ProgressBar Name="Progress" Height="8" Minimum="0" Maximum="100" Foreground="#96E4C7"/>
    <TextBlock Name="Detail" Text="安装完成后会自动打开点歌机。" Foreground="#A8BCB3" FontSize="12" TextWrapping="Wrap" Margin="0,16,0,0"/>
  </StackPanel>
</Window>
'@
$window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $layout))
$message = $window.FindName('Message')
$progress = $window.FindName('Progress')
$detail = $window.FindName('Detail')
$script:canClose = $false
$script:completedAt = $null
$window.Add_Closing({param($sender,$event) if(-not $script:canClose){$event.Cancel=$true}})
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(300)
$timer.Add_Tick({
  try {
    $state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $message.Text = $state.message
    $progress.IsIndeterminate = $state.status -in @('ready','installing')
    if($null -ne $state.percent){$progress.Value=$state.percent}
    if($state.status -eq 'installing'){$detail.Text='正在安装并启动新版，请稍候。安装阶段无法提供准确百分比。'}
    if($state.status -eq 'error'){$script:canClose=$true;$detail.Text='可关闭此窗口，返回点歌机重新检查更新。'}
    if($state.status -eq 'complete'){
      $script:canClose=$true
      if($null -eq $script:completedAt){$script:completedAt=Get-Date}
      if(((Get-Date)-$script:completedAt).TotalSeconds -ge 2){$window.Close()}
    }
    if($state.status -eq 'installing' -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$state.time) -gt 300000){
      $script:canClose=$true;$detail.Text='安装或启动耗时较长，可关闭此窗口并手动打开点歌机。'
    }
  } catch {}
})
$window.Add_ContentRendered({[IO.File]::WriteAllText($StateFile+'.ready','ready')})
$timer.Start()
$null=$window.ShowDialog()
$timer.Stop()
