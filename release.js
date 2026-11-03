(function (root) {
  'use strict';

  // 每次发布新版本时更新这里，并使用一个从未用过的 id。
  // Lynn 第一次打开新版本会看到更新说明，看过后同一版本不再弹出。
  root.LYNN_RELEASE = {
    id: '2026.11.03-02',
    version: '2026.11.03 · 02',
    date: '2026年11月3日',
    title: '背单词，更顺手了一点',
    message: '小紫怪认真看完了 Lynn 的反馈，把容易打断节奏的地方都收拾了一遍。',
    items: [
      {
        icon: '🔊',
        title: '读音更快响起',
        text: '下一组单词会提前准备好读音，点下喇叭以后不用再等好几秒。'
      },
      {
        icon: '✨',
        title: '答对自动下一题',
        text: '答对后会短暂停留显示结果，然后自动进入下一个单词，练习更连贯。'
      },
      {
        icon: '📝',
        title: '新增版本更新信',
        text: '以后网站每次更新，第一次打开都会在这里告诉你发生了什么。'
      }
    ],
    signOff: '谢谢 Lynn 认真试用，也谢谢你愿意把不顺手的地方告诉我。'
  };
})(typeof window !== 'undefined' ? window : globalThis);
