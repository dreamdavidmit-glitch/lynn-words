(function(){
  'use strict';
  const INDEX_URL='audio/index.json?v=cet4-2';
  let player=null,seq=0,index=null;
  // 双击打开（file://）时由 LynnData 改读 audio/index.js 副本；mp3 本身用 <audio> 播放，双击打开也能放。
  const fileMode=!!(window.LynnData&&window.LynnData.fileMode);
  const loading=(window.LynnData?window.LynnData.json(INDEX_URL):fetch(INDEX_URL).then(r=>r.ok?r.json():{})).then(j=>{index=j;return j;}).catch(()=>{index=null;return null;});
  const fileFor=word=>{if(!index)return null;const hit=index[String(word).toLowerCase()];return typeof hit==='string'?hit:hit?.file||null;};
  const api={
    stop(){seq++;if(player){try{player.pause();}catch(_){}player=null;}try{window.speechSynthesis?.cancel();}catch(_){}},
    voices(){try{return window.speechSynthesis?.getVoices().filter(v=>/^en/i.test(v.lang))||[];}catch(_){return [];}},
    async prefetch(words){if(fileMode)return;try{if(!index)await loading;(words||[]).slice(0,40).forEach(w=>{const f=fileFor(w);if(f)fetch('audio/'+f,{priority:'low'}).catch(()=>{});});}catch(_){}},
    async speak(word,options={}){
      api.stop();const token=seq;
      try{
        if(!index)await loading;
        const path=fileFor(word);
        if(token!==seq)return;
        if(path&&options.accent!=='en-GB'){
          // Created and played synchronously inside the tap so iPad Safari allows it.
          player=new Audio('audio/'+path);player.setAttribute('playsinline','');player.preload='auto';player.playbackRate=options.rate||1;
          await player.play();return;
        }
      }catch(e){if(token!==seq)return;}
      if(token!==seq)return;
      if(!window.speechSynthesis||typeof SpeechSynthesisUtterance!=='function')throw Error('这个浏览器不支持朗读这个词，换 Safari、Chrome 或 Edge 试试～');
      const u=new SpeechSynthesisUtterance(word);u.lang=options.accent||'en-US';u.rate=options.rate||1;
      const voices=api.voices();
      u.voice=voices.find(v=>v.voiceURI===options.voiceURI)||voices.filter(v=>v.lang===u.lang).sort((a,b)=>Number(/Natural|Online|Google|Enhanced|Premium/i.test(b.name))-Number(/Natural|Online|Google|Enhanced|Premium/i.test(a.name)))[0]||null;
      window.speechSynthesis.speak(u);
    }
  };
  window.Pronunciation=api;
})();
