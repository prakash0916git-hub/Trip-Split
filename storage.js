
const STORAGE_KEY = 'tripSettleUp.data.v1';

const TripStorage = {
  load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(err){
      console.error('TripStorage.load failed:', err);
      return null;
    }
  },

  save(data){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    }catch(err){
      // Most likely QuotaExceededError — large base64 receipt images
      // can fill up localStorage's ~5-10MB limit fast. A production
      // version should move receipt files to IndexedDB instead.
      console.error('TripStorage.save failed:', err);
      return false;
    }
  },

  clear(){
    try{
      localStorage.removeItem(STORAGE_KEY);
    }catch(err){
      console.error('TripStorage.clear failed:', err);
    }
  }
};
