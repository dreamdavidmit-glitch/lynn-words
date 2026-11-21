const soundTracks = {
  everyday:{label:'风声', file:'assets/room/ambience-wind.mp3'},
  lantern:{label:'水声', file:'assets/room/ambience-water.mp3'},
  dongzhi:{label:'炉火', file:'assets/room/ambience-fire.mp3'}
};

const players = new Map();
function playerFor(file) {
  if (!players.has(file)) {
    const audio = new Audio(file);
    audio.preload = 'none';
    audio.loop = true;
    audio.setAttribute('playsinline','');
    players.set(file,audio);
  }
  return players.get(file);
}

export function mountRoomAmbience(stage, tools, theme, initial, save) {
  const track = soundTracks[theme || 'everyday'];
  if (!track) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'room-light-trigger room-ambient-toggle';
  button.dataset.roomAmbient = '';
  button.setAttribute('aria-label','环境声 ' + track.label);
  tools.appendChild(button);
  let wanted = initial === true, visible = false, leaving = false;
  let player = null, pending = false, blocked = false, generation = 0;

  function paint() {
    button.textContent = track.label + ' · ' + (!wanted ? '关' : blocked ? '待播放' : '开');
    button.setAttribute('aria-pressed',String(wanted));
    button.title = blocked ? '点一下房间可恢复播放，点此可关闭环境声' : '房间环境声';
  }
  function pause() {
    generation++;
    pending = false;
    player?.pause();
  }
  function sync() {
    if (!wanted || !visible || leaving || document.hidden || !stage.isConnected) {
      pause();
      return;
    }
    if (pending || blocked) return;
    player ||= playerFor(track.file);
    if (!player.paused) return;
    pending = true;
    const request = ++generation;
    const playback = player.play();
    Promise.resolve(playback).then(() => {
      if (request === generation) pending = false;
    }).catch(() => {
      if (request !== generation) return;
      pending = false;
      blocked = true;
      paint();
    });
  }
  function toggle() {
    wanted = !wanted;
    blocked = false;
    save(wanted);
    paint();
    sync();
  }
  function retry(event) {
    if (!blocked || button.contains(event.target)) return;
    blocked = false;
    if (player?.error) player.load();
    paint();
    sync();
  }
  const leave = () => { leaving = true; pause(); };
  const returnToPage = () => { leaving = false; sync(); };
  const observer = new IntersectionObserver(entries => {
    visible = (entries[0]?.intersectionRatio || 0) >= .08;
    sync();
  },{threshold:.08});
  observer.observe(stage);
  button.addEventListener('click',toggle);
  stage.addEventListener('pointerdown',retry);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',leave);
  window.addEventListener('pageshow',returnToPage);
  paint();
  return {
    destroy() {
      leave();
      observer.disconnect();
      button.removeEventListener('click',toggle);
      stage.removeEventListener('pointerdown',retry);
      document.removeEventListener('visibilitychange',sync);
      window.removeEventListener('pagehide',leave);
      window.removeEventListener('pageshow',returnToPage);
    }
  };
}
