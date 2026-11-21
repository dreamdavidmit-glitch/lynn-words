(function (root) {
  'use strict';

  // 每次发布新版本时更新这里，并使用一个从未用过的 id。
  // Lynn 第一次打开新版本会看到更新说明，看过后同一版本不再弹出。
  const previewRelease = {
    id: '2026.11.18-3d-furniture-wishes',
    version: '2026.11.18 · 房间与留言',
    date: '2026年11月18日',
    title: 'Lynn，来看看新房间吧',
    message: '小紫怪的房间现在只用 3D 打开。沙发和灯已经摆好，挑个位置坐一会儿吧。',
    items: [
      {icon:'🛋️', title:'想添家具，就写个愿望', text:'房间下方有「想添件家具？」。可以写下想要的家具、颜色或位置，管理者会决定用多少星光。确认后的星光扣除会显示在愿望记录里，家具由管理者安排布置。'},
      {icon:'🪟', title:'有夕阳，也有节日窗景', text:'坐在沙发上可以环顾。每盏灯能单独开关，节日当天会换上 3D 布置。相框等你放进自己的照片。'},
      {icon:'💌', title:'留言可以放心慢慢写', text:'正在写的回复会留在当前标签页。刷新或发送失败后可以接着写。'},
      {icon:'🌱', title:'慢网也能接着学', text:'上一轮同步没完成时，新的进度会排队补传。3D 房间滚到附近才加载，练习时会提前准备接下来几个词的读音。'}
    ],
    signOff: '想把这里布置成什么样，可以慢慢告诉我。'
  };
  const release = {
    id: '2026.11.25-room-together',
    version: '2026.11.25 · 房间和学习',
    date: '2026年11月25日',
    title: 'Lynn，来看看小词窝的新样子',
    message: '背单词还是按你喜欢的节奏。学累了，欢迎到房间坐一会儿。',
    items: [
      {icon:'🌱',title:'难记的词，多见几次',text:'复习会照顾近期答错、犹豫或还没巩固的词。答对以后，还是可以自己点下一题。'},
      {icon:'💌',title:'写到一半的话，等你回来',text:'留言、心情和照片背面的草稿在同一浏览器标签页刷新后还能继续。'},
      {icon:'🚪',title:'来串个门',text:'走廊连着两间房，可以按门铃、点「来啦」、坐长椅一起看日落。圣诞雪夜还能在雾窗上写字。'},
      {icon:'🖼️',title:'留下一点小东西',text:'走廊有共享白板和小展台。相片可以取下再挂回去，手机和平板也换成了移动摇杆。想留给以后自己的话，可以写在私人便签里。'}
    ],
    signOff:'慢慢背，慢慢画，路过的时候再留一句话。'
  };
  Object.defineProperty(root,'LYNN_RELEASE',{configurable:true,get(){
    if(root.location?.pathname?.endsWith('/room-preview.html'))return previewRelease;
    return root.LynnOpening?.isOpen() ? release : undefined;
  }});
})(typeof window !== 'undefined' ? window : globalThis);
