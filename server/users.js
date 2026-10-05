/**
 * 用户表（单例）：识别维度 = clientId + IP + 昵称
 *  - canonicalId：主身份（同 IP 同昵称的多个 clientId 合并为一个 canonicalId）
 *  - aliases：同一用户的不同浏览器/入口产生的 clientId 集合
 * 持久化：toJSON()/restore() 由 persistence 统一落盘
 */
class UserRegistry {
  constructor() {
    this.users = new Map(); // canonicalId -> { canonicalId, aliases:Set, nickname, ip, firstSeen, lastSeen }
  }

  /** 记录一次活跃，返回 canonicalId；同一 IP 只能是一个用户（不关心昵称） */
  touch(clientId, ip, nickname) {
    if (!clientId) return clientId;
    const now = Date.now();
    const existing = this._findByAlias(clientId);
    if (existing) {
      existing.aliases.add(clientId);
      existing.lastSeen = now;
      if (ip) existing.ip = ip;
      // 注意：不覆盖昵称——昵称只由改名接口更新，避免点歌时旧昵称污染用户表
      return existing.canonicalId;
    }
    // 合并：只要有 IP，就归入该 IP 对应的用户（同一 IP 只能一个用户）
    if (ip) {
      const match = [...this.users.values()].find((u) => u.ip === ip);
      if (match) {
        match.aliases.add(clientId);
        match.lastSeen = now;
        // 同上：不覆盖昵称
        return match.canonicalId;
      }
    }
    const canonicalId = clientId;
    this.users.set(canonicalId, {
      canonicalId,
      aliases: new Set([clientId]),
      nickname: nickname || '',
      ip: ip || '',
      firstSeen: now,
      lastSeen: now,
    });
    return canonicalId;
  }

  /** clientId → canonicalId（找不到则视为自身） */
  canonicalOf(clientId) {
    const found = this._findByAlias(clientId);
    return found ? found.canonicalId : clientId;
  }

  /** 修改昵称，返回 canonicalId */
  setNickname(clientId, nickname) {
    const u = this._findByAlias(clientId);
    if (u) {
      u.nickname = nickname;
      return u.canonicalId;
    }
    return clientId;
  }

  get(clientId) {
    return this._findByAlias(clientId) || null;
  }

  _findByAlias(clientId) {
    for (const u of this.users.values()) {
      if (u.aliases.has(clientId)) return u;
    }
    return null;
  }

  /** 管理端列表（含当前队列点歌数） */
  list(queueItems) {
    const now = Date.now();
    return [...this.users.values()]
      .map((u) => ({
        clientId: u.canonicalId,
        nickname: u.nickname || '匿名',
        ip: u.ip || '',
        firstSeen: u.firstSeen,
        lastSeen: u.lastSeen,
        active: now - u.lastSeen < 5 * 60 * 1000, // 5 分钟内活跃
        queued: queueItems.filter((s) => this.canonicalOf(s.requestedBy) === u.canonicalId).length,
      }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  toJSON() {
    return [...this.users.values()].map((u) => ({
      canonicalId: u.canonicalId,
      aliases: [...u.aliases],
      nickname: u.nickname,
      ip: u.ip,
      firstSeen: u.firstSeen,
      lastSeen: u.lastSeen,
    }));
  }

  restore(arr) {
    this.users.clear();
    for (const u of arr || []) {
      this.users.set(u.canonicalId, {
        canonicalId: u.canonicalId,
        aliases: new Set(u.aliases || []),
        nickname: u.nickname || '',
        ip: u.ip || '',
        firstSeen: u.firstSeen || Date.now(),
        lastSeen: u.lastSeen || Date.now(),
      });
    }
    // 历史数据兜底：同 IP 的多个用户合并为第一个（保证"同一 IP 只能一个用户"）
    this._mergeByIp();
  }

  /** 同 IP 合并（restore 后执行，清理历史遗留的重复 IP 用户） */
  _mergeByIp() {
    const byIp = new Map();
    for (const [cid, u] of [...this.users]) {
      if (!u.ip) continue;
      const existing = byIp.get(u.ip);
      if (existing) {
        existing.aliases = new Set([...existing.aliases, ...u.aliases, existing.canonicalId, cid]);
        existing.firstSeen = Math.min(existing.firstSeen, u.firstSeen);
        existing.lastSeen = Math.max(existing.lastSeen, u.lastSeen);
        if (u.nickname) existing.nickname = u.nickname;
        this.users.delete(cid);
      } else {
        byIp.set(u.ip, u);
      }
    }
  }
}

module.exports = new UserRegistry();
