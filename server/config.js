/**
 * 全局配置
 * 优先级：config.local.js 覆盖此处默认值（config.local.js 已被 .gitignore 忽略，不提交）
 * 使用方式：复制 config.local.example.js 为 config.local.js 后填写
 */
const defaults = {
  port: 8080,                          // 主服务端口
  neteaseApiBase: 'http://127.0.0.1:4000', // NeteaseCloudMusicApi 独立进程地址（让出3000）
  qqApiBase: 'http://127.0.0.1:3400',   // QQMusicApi 独立进程地址（需先部署QQMusicApi）
  neteaseCookie: '',                   // 个人网易云账号 Cookie（可选，建议 VIP）
  playlistId: 0,                       // 默认网易云歌单 ID（0 = 未配置，仅插播）
  maxUserQueue: 300,                   // 插播区上限
  maxPerUser: 10,                      // 每人在插播区最多点几首
  searchCacheMs: 30000,                // 搜索缓存时长
  mpvPath: 'mpv',                      // mpv 可执行文件（Windows 可写 server/mpv.exe）
  volume: 100,                         // 播放音量
  audioDevice: '',                     // 音频输出设备（mpv --audio-device 值；空 = 系统默认）
  fmMode: false,                       // 启动时默认播放源是否为心动FM（true=FM，false=歌单）
  autoStart: false,                    // 启动时是否自动开始播放（false=默认暂停，等管理台点开始）
  skipRequired: 8,                     // 投票跳过所需票数（管理端可修改）
  boostRequired: 3,                    // 顶歌所需次数（达到即升到队首，管理端可修改）
  presetPlaylists: [                   // 预设歌单（管理台快捷切换按钮）
    { id: 3778678, name: '热歌榜' },
  ],
  adminKey: ''                         // 管理页口令（空 = 管理接口禁用）
};

let local = {};
try {
  local = require('./config.local.js');
} catch (e) {
  // 无本地配置，使用默认值
}

module.exports = { ...defaults, ...local };
