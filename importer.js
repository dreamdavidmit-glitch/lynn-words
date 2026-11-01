(function (root) {
  'use strict';
  const MAX_BYTES = 40 * 1024 * 1024, MAX_PAGES = 150, MAX_OCR_PAGES = 30;
  const base = () => new URL('vendor/', document.baseURI);
  const fileURL = path => new URL(path, base()).href;
  let pdfModule, tesseractScript;
  function aborted() { return new DOMException('已取消识别', 'AbortError'); }
  function check(signal) { if (signal?.aborted) throw aborted(); }
  function abortable(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve,reject) => {
      const stop = () => reject(aborted());
      if (signal.aborted) { reject(aborted()); return; }
      signal.addEventListener('abort',stop,{once:true});
      Promise.resolve(promise).then(resolve,reject).finally(() => signal.removeEventListener('abort',stop));
    });
  }
  async function loadPDF() {
    if (!pdfModule) pdfModule = import(fileURL('pdfjs-legacy/pdf.min.mjs')).then(lib => {lib.GlobalWorkerOptions.workerSrc=fileURL('pdfjs-legacy/pdf.worker.min.mjs');return lib;}).catch(error => {pdfModule=null;throw error;});
    return pdfModule;
  }
  function coreFile() {
    let simd=false;
    try { simd=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); } catch (_) {}
    return simd?'tesseract-core-simd-lstm.wasm.js':'tesseract-core-lstm.wasm.js';
  }
  function timeout(promise, ms, message) {
    let id; return Promise.race([promise, new Promise((_,reject)=>{id=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(id));
  }
  async function loadOCR() {
    if (root.Tesseract) return root.Tesseract;
    if (!tesseractScript) tesseractScript = new Promise((resolve,reject) => {
      const script=document.createElement('script');script.src=fileURL('tesseract/tesseract.min.js');
      script.onload=()=>resolve(root.Tesseract);script.onerror=()=>{tesseractScript=null;script.remove();reject(new Error('识别组件加载失败，请检查网络后重试。'));};document.head.append(script);
    });
    return tesseractScript;
  }
  async function imageCanvas(file, signal) {
    const bitmap = await abortable(createImageBitmap(file),signal);
    try {
      if (bitmap.width*bitmap.height > 80000000) throw new Error('图片尺寸过大，请缩小到 8,000 万像素以下后重试。');
      const scale=Math.min(1,3000/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
    } finally {bitmap.close();}
  }
  async function read(file, options={}) {
    const {signal,onProgress=()=>{},forceOCR=false}=options;
    check(signal);
    if (!file || typeof file.arrayBuffer!=='function') throw new Error('请选择 PDF、PNG 或 JPG 文件。');
    if (file.size>MAX_BYTES) throw new Error('文件超过 40 MB，请压缩文件或分成几个部分导入。');
    if (!file.size) throw new Error('这个文件是空的，请重新选择。');
    const name=file.name||'', pdf=/\.pdf$/i.test(name)||file.type==='application/pdf';
    const image=/\.(?:png|jpe?g|webp)$/i.test(name)||/^image\/(?:png|jpeg|webp)$/.test(file.type);
    if (!pdf&&!image) throw new Error('暂时支持 PDF、PNG、JPG 和 WebP；其他文本可以复制后粘贴导入。');
    if (location.protocol==='file:') throw new Error('双击打开的网页读不了 PDF 和照片 😢 要用网址打开才行。也可以把单词复制下来，用下面的“直接粘贴”导入。');
    let worker=null, workerPending=null, loadingTask=null, documentPDF=null, renderTask=null, currentPage=0, total=1, ocrCount=0;
    const pages=[],warnings=[];
    const report=(stage,progress,message) => {try {onProgress({stage,page:currentPage,total,progress:Math.max(0,Math.min(1,progress||0)),message});}catch(_){}};
    const stop=()=>{if(worker) void worker.terminate();if(loadingTask) void loadingTask.destroy();if(renderTask) renderTask.cancel();};
    signal?.addEventListener('abort',stop,{once:true});
    async function recognize(canvas) {
      check(signal);ocrCount++;
      if (ocrCount>MAX_OCR_PAGES) throw new Error('一次最多识别 30 页扫描页。请设置较小的页码范围，分批导入。');
      if (!worker) {
        report('ocr',0,'正在准备中英文扫描识别，首次使用需要加载识别组件…');
        const Tesseract=await abortable(loadOCR(),signal);check(signal);
        workerPending=Tesseract.createWorker(['eng','chi_sim'],1,{
          workerPath:fileURL('tesseract/worker.min.js'),corePath:fileURL('tesseract/core/'+coreFile()),langPath:fileURL('tesseract/lang').replace(/\/$/,''),
          workerBlobURL:false,gzip:true,errorHandler:()=>{},logger:message=>report('ocr',message.progress,`正在识别第 ${currentPage} 页${message.status==='recognizing text'?' · '+Math.round((message.progress||0)*100)+'%':''}`)
        });
        workerPending.then(value=>{if(signal?.aborted) void value.terminate();},()=>{});
        worker=await abortable(timeout(workerPending,120000,'扫描识别组件加载超时，请检查网络后重试，或直接粘贴文字。'),signal);check(signal);
        await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'3'});
      }
      const result=await abortable(worker.recognize(canvas,{}, {text:true}),signal);
      return result.data.text||'';
    }
    try {
      report('loading',0,'正在打开文件…');
      if (image) {
        currentPage=1;const canvas=await imageCanvas(file,signal);
        try {pages.push({page:1,text:await recognize(canvas),method:'ocr'});}finally{canvas.width=canvas.height=0;}
      } else {
        const lib=await abortable(loadPDF(),signal);check(signal);
        const bytes=new Uint8Array(await abortable(file.arrayBuffer(),signal));check(signal);
        loadingTask=lib.getDocument({data:bytes,cMapUrl:fileURL('pdfjs/cmaps/'),cMapPacked:true,standardFontDataUrl:fileURL('pdfjs/standard_fonts/'),wasmUrl:fileURL('pdfjs/wasm/'),isEvalSupported:false,enableXfa:false});
        documentPDF=await abortable(loadingTask.promise,signal);check(signal);
        const from=Number(options.fromPage||1),to=options.toPage==null||options.toPage===''?documentPDF.numPages:Number(options.toPage);
        if (!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>documentPDF.numPages) throw new Error(`页码范围无效。这个 PDF 共 ${documentPDF.numPages} 页，请填写 1 至 ${documentPDF.numPages} 之间的范围。`);
        total=to-from+1;
        if(total>MAX_PAGES)throw new Error(`一次最多处理 ${MAX_PAGES} 页。这个范围有 ${total} 页，请缩小页码范围后分批导入。`);
        if(forceOCR&&total>MAX_OCR_PAGES)throw new Error('强制扫描识别一次最多 30 页，请缩小页码范围。');
        for(let pageNumber=from;pageNumber<=to;pageNumber++) {
          check(signal);currentPage=pageNumber;report('text',(pageNumber-from)/total,`正在读取第 ${pageNumber} 页 / 共 ${documentPDF.numPages} 页…`);
          const page=await abortable(documentPDF.getPage(pageNumber),signal);
          try {
            const content=await abortable(page.getTextContent(),signal);
            let text=root.ExtractWords.layoutText(content.items),method='text';
            const english=(text.match(/[A-Za-z]{2,}/g)||[]).length;
            if(forceOCR||english===0||text.replace(/\s/g,'').length<4) {
              const viewport=page.getViewport({scale:Math.min(3,2400/Math.max(page.getViewport({scale:1}).width,page.getViewport({scale:1}).height))});
              const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
              try {
                renderTask=page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport,background:'rgb(255,255,255)'});
                await abortable(renderTask.promise,signal);renderTask=null;check(signal);text=await recognize(canvas);method='ocr';
              } finally {canvas.width=canvas.height=0;}
            }
            if(!text.trim())warnings.push(`第 ${pageNumber} 页没有识别到文字，可能是空白页或图片不清晰。`);
            pages.push({page:pageNumber,text,method});
          } finally {page.cleanup();}
        }
      }
      check(signal);
      if(ocrCount)warnings.unshift(`有 ${ocrCount} 页经过扫描识别。请核对单词拼写、词组和中文，尤其是模糊或多栏的页面。`);
      const text=pages.map(page=>page.text).join('\n\n');
      if(!text.trim())throw new Error('没有识别到文字。请换用更清晰、摆正的扫描页，或粘贴单词表文本。');
      report('done',1,`已读取 ${pages.length} 页，请检查识别结果。`);
      return {text,pages,warnings};
    } catch(error) {
      if(signal?.aborted||error.name==='AbortError')throw aborted();
      if(error.name==='PasswordException')throw new Error('这个 PDF 需要密码。请先用阅读器解锁并另存，再导入。');
      if(error.name==='InvalidPDFException')throw new Error('PDF 无法读取，文件可能损坏或并非真正的 PDF。请重新导出后再试。');
      if(error instanceof TypeError && /fetch|network|import|module/i.test(error.message))throw new Error('识别组件没加载出来，检查一下网络再试试～也可以把单词复制下来直接粘贴。');
      throw error;
    } finally {
      signal?.removeEventListener('abort',stop);
      if(worker){try{await worker.terminate();}catch(_){}}
      if(loadingTask){try{await loadingTask.destroy();}catch(_){}}
    }
  }
  root.ImportEngine={read,limits:{maxBytes:MAX_BYTES,maxPages:MAX_PAGES,maxOCRPages:MAX_OCR_PAGES}};
})(window);
