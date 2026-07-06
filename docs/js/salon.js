/* 프라이빗 살롱 — 5점 컬렉션 목록 */
(function () {
  "use strict";
  var AUTH_KEY = "meister_salon_pass";

  var pass = {};
  try { pass = JSON.parse(sessionStorage.getItem(AUTH_KEY)) || {}; } catch (e) {}
  if (pass.name) {
    document.getElementById("salonWelcome").textContent =
      pass.name + "님을 위한 프라이빗 살롱";
  }

  document.getElementById("salonLogout").addEventListener("click", function (e) {
    e.preventDefault();
    sessionStorage.removeItem(AUTH_KEY);
    location.href = "index.html";
  });

  var grid = document.getElementById("salonGrid");
  MEISTER_PRODUCTS.forEach(function (p) {
    var a = document.createElement("a");
    a.className = "salon-card";
    a.href = "product.html?id=" + encodeURIComponent(p.id);
    a.innerHTML =
      '<div class="salon-card__img"><img loading="lazy" alt="' + p.name + '" ' +
      'src="' + p.images[0] + '" data-fallback="' + p.name + '"></div>' +
      '<div class="salon-card__body">' +
      '<p class="salon-card__cat">' + p.cat + "</p>" +
      "<h3>" + p.name + "</h3>" +
      "<p>" + p.tagline + "</p>" +
      '<span class="salon-card__price">' + meisterWon(p.price) + "</span>" +
      '<span class="salon-card__rating">' + p.rating.toFixed(2) +
      " (" + p.reviewsCount + ")</span>" +
      "</div>";
    grid.appendChild(a);
  });

  /* 이미지 폴백 (main.js와 동일 로직, 살롱은 main.js 미로드) */
  document.querySelectorAll("img[data-fallback]").forEach(function (img) {
    img.addEventListener("error", function handler() {
      img.removeEventListener("error", handler);
      var ph = document.createElement("div");
      ph.className = "img-fallback";
      ph.textContent = "◆ " + img.getAttribute("data-fallback");
      img.replaceWith(ph);
    });
  });
})();
