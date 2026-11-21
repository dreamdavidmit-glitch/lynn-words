(() => {
  let opening;
  function database() {
    return opening ||= new Promise((resolve,reject)=>{
      const request=indexedDB.open('lynn-room-photo-preview',1);
      request.onupgradeneeded=()=>{
        request.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true});
        request.result.createObjectStore('notes',{keyPath:'id',autoIncrement:true}).createIndex('photoId','photoId');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  const read=request=>new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  async function use(names,mode,work) {
    const db=await database();
    const tx=db.transaction(names,mode);
    const done=new Promise((resolve,reject)=>{
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error || new Error('预览照片保存失败'));
    });
    const photos=tx.objectStore('photos');
    const notes=names.includes('notes') ? tx.objectStore('notes') : null;
    const [result]=await Promise.all([work(photos,notes),done]);
    return result;
  }
  async function photo(store,id) {
    const item=await read(store.get(Number(id)));
    if (!item) throw new Error('这张照片已移除。');
    return item;
  }
  function editPhoto(id,change) {
    return use(['photos'],'readwrite',async store=>{
      const item=await photo(store,id);
      await change(item,store);
      await read(store.put(item));
      return {ok:true};
    });
  }
  window.LynnPreviewPhotos={
    list:()=>use(['photos'],'readonly',async store=>(await read(store.getAll())).map(({blob,...photo})=>photo)),
    roomPhoto:id=>use(['photos'],'readonly',async store=>(await photo(store,id)).blob),
    uploadRoomPhoto:(blob,caption,takenAt=null)=>use(['photos'],'readwrite',async store=>{
      const all=await read(store.getAll());if(all.length>=24)throw Error('相册最多保存 24 张');
      const used=new Set(all.map(item=>item.wallSlot));
      const wallSlot=Array.from({length:12},(_,i)=>i).find(i=>!used.has(i))??-1;
      await read(store.add({blob,caption,takenAt,createdAt:new Date().toISOString(),wallSlot,frameStyle:'walnut'}));
      return {ok:true};
    }),
    updateRoomPhotoLayout:(id,wallSlot,frameStyle)=>editPhoto(id,async (item,store)=>{
      const all=await read(store.getAll());
      if(!Number.isInteger(wallSlot)||wallSlot<-1||wallSlot>11)throw Error('请选择有效的照片位置');
      if (wallSlot>=0&&all.some(other=>other.id!==item.id && other.wallSlot===wallSlot)) throw new Error('这个位置已经有照片了');
      Object.assign(item,{wallSlot,frameStyle});
    }),
    updateRoomPhotoDate:(id,takenAt)=>editPhoto(id,item=>{item.takenAt=takenAt;}),
    removeRoomPhoto:id=>use(['photos','notes'],'readwrite',async (photos,notes)=>{
      const keys=await read(notes.index('photoId').getAllKeys(Number(id)));
      keys.forEach(key=>notes.delete(key));
      await read(photos.delete(Number(id)));
      return {ok:true};
    }),
    notes:(id,before)=>use(['photos','notes'],'readonly',async (photos,notes)=>{
      await photo(photos,id);
      const entries=(await read(notes.index('photoId').getAll(Number(id))))
        .filter(note=>!before || note.id<before);
      return {notes:entries.slice(-30),more:entries.length>30};
    }),
    post:(author,id,body,clientId)=>use(['photos','notes'],'readwrite',async (photos,notes)=>{
      await photo(photos,id);
      const entries=await read(notes.index('photoId').getAll(Number(id)));
      const prior=entries.find(note=>note.author===author && note.clientId===clientId);
      if (prior) return {note:prior};
      const note={photoId:Number(id),author,body,clientId,createdAt:new Date().toISOString()};
      note.id=await read(notes.add(note));
      return {note};
    })
  };
})();
