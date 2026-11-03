(function (root) {
  'use strict';

  // 每次发布新版本时更新这里，并使用一个从未用过的 id。
  // Lynn 第一次打开新版本会看到更新说明，看过后同一版本不再弹出。
  root.LYNN_RELEASE = {
    id: '2026.11.03-03',
    version: '2026.11.03 · 03',
    date: '2026年11月3日',
    title: '学习进度会跟着你啦',
    message: '小紫怪给 Lynn 准备了一朵自己的进度云，换手机、iPad 或电脑也能接着背。',
    items: [
      {
        icon: '☁️',
        title: '多设备云端同步',
        text: '每次学习后会自动把进度保存到云端，在新设备输入同步密码就能继续。'
      },
      {
        icon: '🌙',
        title: '断网也可以学习',
        text: '所有操作仍会先保存在这台设备，网络恢复后再自动补上同步。'
      },
      {
        icon: '🛟',
        title: '不会悄悄覆盖进度',
        text: '如果两台设备同时有新记录，会先让你选择保留哪一份。'
      }
    ],
    signOff: '从今天起，小词窝会记得你背到哪里。放心去学，剩下的交给小紫怪。'
  };
})(typeof window !== 'undefined' ? window : globalThis);
