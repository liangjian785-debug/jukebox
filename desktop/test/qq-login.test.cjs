const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyQQLogin } = require('../netease-login.cjs');
test('QQ login uses authenticated status rather than key renewal', async () => {
  const cookie = 'uin=123; qqmusic_key=fixture';
  for (const [result, expected] of [[{code:0,req:{code:0,data:{info:{nick:'fixture'}}}},cookie],[{code:0,req:{code:1000,data:{}}},false],[{code:0,req:{code:0,data:{}}},false]]) {
    const actual = await verifyQQLogin(cookie, async (url, options) => {
      assert.equal(new URL(url).hostname, 'u.y.qq.com');
      assert.equal(options.headers.Cookie,cookie);
      assert.equal(JSON.parse(options.body).req.method,'GetLoginUserInfo');
      return {ok:true,json:async()=>result};
    });
    assert.equal(actual,expected);
  }
});
