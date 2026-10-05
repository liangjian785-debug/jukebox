/**
 * 本地配置示例：复制本文件为 config.local.js 后填写（config.local.js 不入 git）
 * 配置优先级：config.local.js 覆盖 config.js 默认值
 */
module.exports = {
  // 主服务端口（局域网访问 http://<本机IP>:8080）
  port: 8080,

  // NeteaseCloudMusicApi 独立进程地址（默认本机 4000）
  neteaseApiBase: 'http://127.0.0.1:4000',

  // 个人网易云账号 Cookie（可选，建议 VIP）：
  // 登录 music.163.com → F12 → Network → 任意请求 → Request Headers → 复制 Cookie 整行
  neteaseCookie: '',

  // 默认网易云歌单 ID（0 = 不配置，仅插播模式）
  // 歌单页 URL 中 id 后的数字，如 https://music.163.com/#/playlist?id=123456789 → 123456789
  playlistId: 0,

  // 插播区上限
  maxUserQueue: 300,

  // 每人在插播区最多点几首
  maxPerUser: 10,

  // 搜索缓存时长（毫秒）
  searchCacheMs: 30000,

  // mpv 可执行文件：PATH 中的 mpv，或 Windows 下填完整路径如 'D:/tools/mpv/mpv.exe'
  mpvPath: 'mpv',

  // 播放音量 0-100
  volume: 100,

  // 音频输出设备（mpv --audio-device 值，如 'wasapi/{fa18bd1c-...}'；空 = 系统默认）
  // 可用设备可在管理台"播放控制"里查看选择
  audioDevice: '',

  // 启动时默认播放源：true = 心动FM（私人推荐），false = 默认歌单
  // 运行中可在管理台随时切换
  fmMode: false,

  // 启动是否自动播放：false = 默认暂停（不自动出声，等管理台点"开始播放"）
  autoStart: false,

  // 预设歌单（管理台"播放源"卡片里的快捷切换按钮；可随意增删）
  presetPlaylists: [
    { id: 3778678, name: '热歌榜' },
    // { id: 520857555, name: '我的歌单' },
  ],

  // 管理页口令（访问 http://IP:8080/admin.html 需要输入；留空 = 禁用管理功能）
  adminKey: '',
};
