/* =========================================================================
 * api.js — 구글 앱스스크립트(서버)와 대화하는 공통 통신 모듈
 * -------------------------------------------------------------------------
 * 이 파일은 직접 수정할 필요가 없습니다. (사이트의 '심부름꾼' 역할)
 *
 * - Api.jsonp(): 읽기/간단요청용. 인터넷 보안규칙(CORS)의 영향을 받지 않아
 *                가장 안전하고 잘 작동합니다. (신청 접수, 설정 읽기 등)
 * - Api.post():  큰 데이터(소개서 이미지 업로드)를 보낼 때 사용합니다.
 * ========================================================================= */

const Api = (function () {

  // APPS_SCRIPT_URL이 제대로 설정됐는지 확인
  function isConfigured() {
    return (
      typeof CONFIG !== "undefined" &&
      CONFIG.APPS_SCRIPT_URL &&
      CONFIG.APPS_SCRIPT_URL.indexOf("script.google.com") !== -1
    );
  }

  /* ---------------------------------------------------------------------
   * jsonp: <script> 태그를 이용한 안전한 호출 방식
   *   action : 요청 종류 (예: "apply", "getSettings", "adminLogin")
   *   params : 함께 보낼 값들 { key: value }
   *   반환   : 서버가 돌려준 결과(JSON 객체)를 Promise로 돌려줍니다.
   * ------------------------------------------------------------------- */
  function jsonp(action, params) {
    return new Promise(function (resolve, reject) {
      if (!isConfigured()) {
        reject(new Error("APPS_SCRIPT_URL이 설정되지 않았습니다. js/config.js 파일을 확인하세요."));
        return;
      }

      var cbName = "jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      var script = document.createElement("script");

      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("서버 응답 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 시도해주세요."));
      }, 25000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (data) {
        cleanup();
        resolve(data);
      };

      var qs = "action=" + encodeURIComponent(action) + "&callback=" + cbName;
      params = params || {};
      Object.keys(params).forEach(function (k) {
        qs += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      });

      script.src = CONFIG.APPS_SCRIPT_URL + "?" + qs;
      script.onerror = function () {
        cleanup();
        reject(new Error("서버 연결에 실패했습니다. 앱스스크립트 주소가 올바른지 확인해주세요."));
      };
      document.body.appendChild(script);
    });
  }

  /* ---------------------------------------------------------------------
   * post: 큰 데이터(이미지)를 보낼 때 사용 (fetch 방식)
   *   action : 요청 종류 (예: "uploadIntro")
   *   data   : 함께 보낼 값들 { key: value }
   * ------------------------------------------------------------------- */
  function post(action, data) {
    if (!isConfigured()) {
      return Promise.reject(new Error("APPS_SCRIPT_URL이 설정되지 않았습니다. js/config.js 파일을 확인하세요."));
    }
    var body = JSON.stringify(Object.assign({ action: action }, data || {}));
    return fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      // text/plain 으로 보내야 CORS(보안규칙) 문제 없이 잘 전달됩니다.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
    }).then(function (res) {
      return res.json();
    });
  }

  return { jsonp: jsonp, post: post, isConfigured: isConfigured };
})();
