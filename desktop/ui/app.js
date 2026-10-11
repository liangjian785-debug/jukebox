const $ = id => document.getElementById(id);
function update(state) {
  const upgrade = state.update;
  if (upgrade) {
    $('update-version').textContent = '当前版本：' + upgrade.version;
    $('update-status').textContent = upgrade.message;
    $('update-notes').textContent = upgrade.notes || '';
    $('update-check').disabled = ['checking', 'downloading', 'ready'].includes(upgrade.status);
    $('update-download').hidden = upgrade.status !== 'available';
  }
  document.body.classList.toggle('business', state.page !== 'home');
  for (const page of ['home','song','admin']) {
    $('nav-' + page).classList.toggle('selected', state.page === page);
    $('nav-' + page).disabled = page !== 'home' && state.state !== 'running';
  }
  $('setup').hidden = !state.needsSetup; $('status').hidden = state.needsSetup;
  $('badge').textContent = ({ starting:'正在启动',running:'服务运行中',stopping:'正在停止',stopped:'服务已停止',failed:'启动失败', 'main-stopped':'播放服务已停止' })[state.state] || '准备中';
  $('error').textContent = state.error || '';
  $('song').disabled = $('admin').disabled = state.state !== 'running';
  $('restart').disabled = ['starting','stopping'].includes(state.state);
  $('resume').hidden = state.state !== 'main-stopped';
  $('address').textContent = state.state === 'running' ? (state.addresses[0] || '未发现局域网地址，请连接网络。') : '服务启动后显示';
  $('copy').disabled = state.state !== 'running' || !state.addresses.length;
  if (document.activeElement !== $('main-port')) $('main-port').value = state.ports.main;
  $('save-port').disabled = ['starting','stopping'].includes(state.state);
  $('api-ports').textContent = '内部音乐接口：QQ ' + state.ports.qq + ' · 网易云 ' + state.ports.netease + '（被占用时自动切换）';
  $('password-section').hidden = state.needsSetup;
  $('save-password').disabled = ['starting','stopping'].includes(state.state);
  $('login-message').textContent = state.loginMessage || '';
  $('login-check').hidden = !state.page.endsWith('-login');
  $('login-message').hidden = !state.page.endsWith('-login');
}
async function action(fn) { try { const result = await fn(); if (result?.state) update(result); } catch(error) { $('error').textContent = error.message; } }
document.querySelector('#setup form').addEventListener('submit', event => { event.preventDefault(); const key = $('key').value; $('key').value = ''; action(() => window.desktop.setup(key)); });
$('port-form').addEventListener('submit', event => { event.preventDefault(); action(() => window.desktop.port(Number($('main-port').value))); });
$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('new-key').value !== $('confirm-key').value) { $('error').textContent = '两次新口令不一致'; return; }
  const oldKey = $('old-key').value, newKey = $('new-key').value;
  $('save-password').disabled = true;
  try { update(await window.desktop.password(oldKey, newKey)); $('password-form').reset(); $('password-result').textContent = '口令已修改，下次进入管理台请使用新口令。'; }
  catch (error) { $('password-result').textContent = error.message; }
  finally { $('save-password').disabled = false; }
});
$('quit').onclick = () => action(() => window.desktop.quit());
$('update-check').onclick = () => action(() => window.desktop.updateCheck());
$('update-download').onclick = () => action(() => window.desktop.updateDownload());
$('update-release').onclick = () => action(() => window.desktop.updateRelease());
$('login-check').onclick = () => action(() => window.desktop.loginCheck());
for (const page of ['song','admin']) $(page).onclick = () => action(() => window.desktop.open(page));
for (const page of ['home','song','admin']) $('nav-' + page).onclick = () => action(() => window.desktop.open(page));
$('restart').onclick = () => action(() => window.desktop.restart());
$('resume').onclick = () => action(() => window.desktop.resume());
$('copy').onclick = () => action(() => window.desktop.copy());
for (const kind of ['data','logs']) $(kind).onclick = () => action(() => window.desktop.folder(kind));
window.desktop.onState(update); action(() => window.desktop.state());
