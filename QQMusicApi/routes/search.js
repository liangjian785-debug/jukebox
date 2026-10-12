module.exports = {
  // 搜索
  '/': async ({req, res, request, cache}) => {
    let {
      pageNo = 1,
      pageSize = 20,
      key,
      t = 0, // 0：单曲，2：歌单，7：歌词，8：专辑，9：歌手，12：mv
      raw,
    } = req.query;
    let total = 0;

    if (!key) {
      return res.send({
        result: 500,
        errMsg: '关键词不能为空',
      });
    }

    const cacheKey = `search_${key}_${pageNo}_${pageSize}_${t}`;
    const cacheData = cache.get(cacheKey);
    if (cacheData) {
      res && res.send(cacheData);
      return cacheData;
    }

    const typeMap = {
      0: 'song',
      2: 'songlist',
      7: 'lyric',
      8: 'album',
      12: 'mv',
      9: 'singer',
    };
    const type = typeMap[t];
    if (!type) {
      return res.send({
        result: 500,
        errMsg: '搜索类型错误，检查一下参数 t',
      });
    }

    // 统一走新版 musicu.fcg 搜索（老接口 c.y.qq.com/soso/... 已被 QQ 弃用返回 500）
    // 对外沿用旧 t 参数；新版桌面接口的歌单 search_type 改为 3。
    const body = {
      req_0: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          query: key,
          num_per_page: Number(pageSize),
          page_num: Number(pageNo),
          search_type: Number(t) === 2 ? 3 : Number(t), // 新版桌面接口歌单类型为3；对外保留t=2
          grp: 1,
        },
      },
      comm: { uin: 0, format: 'json', ct: 23, cv: 0 },
    };
    const result = await request({
      url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?-=search',
      method: 'get',
      data: { data: JSON.stringify(body) },
      headers: {
        Referer: 'https://y.qq.com',
      },
    }).catch(() => null);

    if (res.headersSent) return result;

    if (Number(raw)) {
      return res.send(result || { result: 400, errMsg: '搜索失败' });
    }

    // 防御：QQ 接口异常时 result 可能为空/无 data，绝不抛错（避免进程崩溃）
    const section = result && result.req_0 && result.req_0.data && result.req_0.data.body;
    if (!section || (result.req_0 && result.req_0.code)) return res.send({ result: 400, errMsg: '搜索服务暂不可用' });
    const searchResult = section[type] || (t == 2 && section.songlist) || { list: [], totalnum: 0 };
    const {list = [], totalnum = 0} = searchResult;
    const keyword = key;

    const resData = {
      result: 100,
      data: {
        list,
        pageNo: Number(pageNo),
        pageSize: Number(pageSize),
        total: totalnum,
        key: keyword || key,
        t,
        type,
      },
    };
    cache.set(cacheKey, resData, 120);
    res.send && res.send(resData);
    return resData;
  },

  // 热搜词
  '/hot': async ({req, res, request}) => {
    const {raw} = req.query;
    try {
      const result = await request({
        url: 'https://c.y.qq.com/splcloud/fcgi-bin/gethotkey.fcg',
      });
      if (Number(raw)) {
        return res.send(result);
      }
      res.send({
        result: 100,
        data: (result && result.data && result.data.hotkey) || [],
      });
    } catch (e) {
      res.send({ result: 200, errMsg: '获取热搜失败', data: [] });
    }
  },

  // 快速搜索
  '/quick': async ({req, res, request}) => {
    const {raw, key} = req.query;
    if (!key) {
      return res.send({
        result: 500,
        errMsg: 'key ?',
      });
    }
    try {
      const result = await request(
        `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${key}&g_tk=5381`,
      );
      if (Number(raw)) {
        return res.send(result);
      }
      return res.send({
        result: 100,
        data: (result && result.data) || {},
      });
    } catch (e) {
      return res.send({ result: 200, errMsg: '快速搜索失败', data: {} });
    }
  },
};
