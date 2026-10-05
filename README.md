# 🎵 局域网点歌机

一个部署在局域网中的多人点歌系统。用户通过手机或电脑浏览器搜索歌曲、加入队列、顶歌和投票跳过；运行服务的电脑通过 mpv 将歌曲播放到音响。

支持网易云音乐与 QQ 音乐搜索，前端与管理台均由主服务统一托管。

## 功能

- 网易云音乐与 QQ 音乐双平台搜索、榜单和点歌
- 插播队列、同 IP 用户识别、删自己的歌、顶歌与投票跳过
- 默认歌单与心动 FM 播放源
- 管理台：播放控制、音量、音频设备、队列管理、用户列表、日志和渠道开关
- 定时播放：每天或每周播放指定歌曲；播放结束后从头恢复被打断的歌曲
- 队列、用户、播放源和定时任务自动持久化
- Windows 一键静默启动脚本

## 架构

```text
浏览器（Vue 3）
        │ HTTP / WebSocket
        ▼
主服务（Express + Socket.io，8080）
        ├── NeteaseCloudMusicApi（4000）
        ├── QQMusicApi（3400）
        └── mpv → 音响
```

## 环境要求

- Node.js 18 或更高版本
- [mpv](https://mpv.io/) 播放器，并确保 `mpv` 在系统 PATH 中，或在本地配置中指定其完整路径
- 可选：可用的网易云音乐、QQ 音乐登录状态。不同歌曲的版权、会员和地区限制由相应平台决定。

## 快速开始

在项目根目录依次安装依赖：

```powershell
Set-Location server; npm install
Set-Location ../web; npm install
Set-Location ../netease-api; npm install
Set-Location ../QQMusicApi; npm install --omit=dev
```

构建前端：

```powershell
Set-Location web
npm run build
```

复制本地配置模板：

```powershell
Copy-Item server/config.local.example.js server/config.local.js
```

编辑 `server/config.local.js`，至少设置：

- `adminKey`：管理台口令
- `playlistId`：默认网易云歌单 ID；设为 `0` 时仅播放用户点歌
- `mpvPath`：mpv 不在 PATH 时填写完整路径
- `neteaseCookie`：可选，用于网易云音乐登录态

`config.local.js`、Cookie、日志、队列和用户数据均被 `.gitignore` 排除，不会提交到仓库。

## 启动

Windows 下可双击 `start-silent.vbs` 静默启动，或运行：

```powershell
./start.bat
```

脚本会启动网易云 API（4000）、QQ 音乐 API（3400）和主服务（8080）。启动完成后访问：

```text
点歌台：http://<本机局域网 IP>:8080
管理台：http://<本机局域网 IP>:8080/admin.html
```

服务日志位于 `server/logs/`。如果其他设备无法访问，请确认设备处于同一局域网，并在防火墙中放行 8080、3400 和 4000 端口。

## 定时播放

进入管理台后，在“管理端点歌”中搜索歌曲并点击“定时”。可以创建每日或每周任务，也可以启用、停用或删除任务。任务到点时会打断当前歌曲，定时歌曲播放结束后会从头恢复原歌曲。

## 开发

```powershell
# 主服务
Set-Location server
node index.js

# 前端开发服务器
Set-Location web
npm run dev
```

前端生产构建由主服务从 `web/dist` 同源托管。

## 说明

本项目依赖第三方音乐服务接口。请遵守所使用平台的服务条款和所在地法律，并避免高频、批量请求音乐平台接口，以免账号或服务受到限制。
