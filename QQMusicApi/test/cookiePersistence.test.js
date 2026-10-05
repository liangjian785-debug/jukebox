const fs = require('fs');
const os = require('os');
const path = require('path');
const GlobalCookie = require('../util/globalCookie');
const userRoutes = require('../routes/user');

describe('QQ cookie persistence', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-qq-cookie-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, {recursive: true, force: true});
  });

  test('survives a new store instance', () => {
    const cookie = {uin: '1234567890', qqmusic_key: 'key=with=equals'};
    GlobalCookie(dataDir).updateUserCookie(cookie);

    expect(GlobalCookie(dataDir).userCookie()).toEqual(cookie);
  });

  test('reloads the cookie after its file changes', () => {
    const store = GlobalCookie(dataDir);
    store.updateUserCookie({uin: '1234567890', qqmusic_key: 'first'});

    const file = path.join(dataDir, 'cookie.json');
    const changed = {uin: '1234567890', qqmusic_key: 'second'};
    fs.writeFileSync(file, JSON.stringify(changed), 'utf8');
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(file, future, future);

    expect(store.userCookie()).toEqual(changed);
  });

  test('setCookie preserves equals signs and accepts compact separators', () => {
    const globalCookie = GlobalCookie(dataDir);
    const res = {
      body: null,
      set: jest.fn(),
      send(value) {
        this.body = value;
        return this;
      },
    };

    userRoutes['/setCookie']({
      req: {body: {data: 'uin=o1234567890;qqmusic_key=key=with=equals; login_type=1'}},
      res,
      globalCookie,
    });

    expect(res.body.result).toBe(100);
    expect(GlobalCookie(dataDir).userCookie()).toMatchObject({
      uin: '1234567890',
      qqmusic_key: 'key=with=equals',
    });
  });

  test('rejects cookie without playback credentials', () => {
    const globalCookie = GlobalCookie(dataDir);
    const res = {
      body: null,
      send(value) {
        this.body = value;
        return this;
      },
    };

    userRoutes['/setCookie']({
      req: {body: {data: 'uin=o1234567890; login_type=1'}},
      res,
      globalCookie,
    });

    expect(res.body.result).toBe(400);
    expect(fs.existsSync(path.join(dataDir, 'cookie.json'))).toBe(false);
  });

  test('reports a disk write failure', () => {
    const res = {
      body: null,
      send(value) {
        this.body = value;
        return this;
      },
    };

    userRoutes['/setCookie']({
      req: {body: {data: 'uin=o1234567890; qqmusic_key=valid'}},
      res,
      globalCookie: {
        allCookies: () => ({}),
        updateUserCookie: () => {
          throw new Error('disk unavailable');
        },
        updateAllCookies: jest.fn(),
      },
    });

    expect(res.body.result).toBe(500);
  });
});
