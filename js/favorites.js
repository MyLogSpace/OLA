/**
 * js/favorites.js — 즐겨찾기(별표) 저장/조회/삭제.
 * localStorage에 저장되고, 별표 버튼이 있는 페이지 어디서든
 * olaFavorites로 추가/해제하면 마이페이지(pages/mypage.html)에서 볼 수 있습니다.
 */
const olaFavorites = (() => {
  const KEY = "ola_favorites";

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function isFavorited(id) {
    return getAll().some((f) => f.id === id);
  }

  /**
   * @param {{id:string, type:string, title:string, subtitle?:string, url?:string}} item
   */
  function add(item) {
    const list = getAll();
    if (list.some((f) => f.id === item.id)) return;
    list.unshift({ ...item, addedAt: Date.now() });
    saveAll(list);
  }

  function remove(id) {
    saveAll(getAll().filter((f) => f.id !== id));
  }

  function toggle(item) {
    if (isFavorited(item.id)) {
      remove(item.id);
      return false;
    }
    add(item);
    return true;
  }

  return { getAll, isFavorited, add, remove, toggle };
})();

window.olaFavorites = olaFavorites;
