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
    id: '2026.11.26-daily-corner',
    version: '2026.11.26 · 每日打卡与提醒',
    date: '2026年11月26日',
    title: 'Lynn，今天也来拆一张小图吧',
    message: '打卡和背词是两件事。不管今天学多少，都可以收下一张图片。',
    items: [
      {icon:'🪻',title:'每天一张小图',text:'点「今日打卡」就能打开今天的图片。'},
      {icon:'🖼️',title:'想分享一张记忆',text:'你挂上新照片，对方的信箱会收到提醒，点开就能看。'},
      {icon:'⏰',title:'给自己留个提醒',text:'可以按北京时间设置每天几点提醒什么。'},
      {icon:'🌱',title:'老地方照常开放',text:'原来的开放倒计时已经收起，照常背词、看房间。'}
    ],
    signOff:'今天也照自己的步调来。'
  };
  Object.defineProperty(root,'LYNN_RELEASE',{configurable:true,get(){
    if(root.location?.pathname?.endsWith('/room-preview.html'))return previewRelease;
    return release;
  }});
})(typeof window !== 'undefined' ? window : globalThis);
