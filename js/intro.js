/* =========================================================================
 * intro.js — 소개서 페이지의 동작
 * 관리자 페이지에서 올린 소개서 이미지를 불러와 화면에 표시합니다.
 * ========================================================================= */

document.addEventListener("DOMContentLoaded", function () {

  var loadingEl = document.getElementById("introLoading");
  var imagesEl = document.getElementById("introImages");
  var emptyEl = document.getElementById("introEmpty");
  var homeBtn = document.getElementById("btnHomepage");

  homeBtn.href = CONFIG.DEFAULT_PURCHASE_URL || "#";

  if (!Api.isConfigured()) {
    loadingEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    emptyEl.innerHTML = '<div class="big">⚙️</div>아직 설정이 완료되지 않았습니다.<br />(config.js의 주소 설정 필요)';
    return;
  }

  Api.jsonp("getSettings")
    .then(function (res) {
      loadingEl.classList.add("hidden");

      if (res && res.homepageUrl) homeBtn.href = res.homepageUrl;

      var images = (res && res.images) ? res.images : [];
      if (!images.length) {
        emptyEl.classList.remove("hidden");
        return;
      }

      imagesEl.innerHTML = "";
      images.forEach(function (url, i) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = "입면환 소개서 " + (i + 1) + "페이지";
        img.loading = "lazy";
        img.onerror = function () { img.style.display = "none"; };
        imagesEl.appendChild(img);
      });
      imagesEl.classList.remove("hidden");
    })
    .catch(function () {
      loadingEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      emptyEl.innerHTML = '<div class="big">⚠️</div>소개서를 불러오지 못했습니다.<br />잠시 후 다시 시도해주세요.';
    });

});
