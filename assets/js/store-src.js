/* SNS ごとのダウンロード数を数えるための処理
 * サイトの URL の ?src= が下の 6 つのどれかなら、sessionStorage に入れ、
 * ページ内の App Store（ct=）と Google Play（referrer の utm_source・utm_medium=social）のリンクに引き継ぐ。
 * 6 つ以外の値（サイト内のリンクの src=header など）は無視し、入れてある値を上書きしない。
 * 値がないときは、リンクをいまのまま（ct=site・utm_source=site・utm_medium=web）にする。 */
(function () {
  'use strict';
  var ALLOWED = ['ig', 'fb', 'th', 'yt', 'tt', 'x'];
  var KEY = 'chokalog_src';
  var src = null;

  try {
    var fromUrl = new URLSearchParams(window.location.search).get('src');
    if (fromUrl && ALLOWED.indexOf(fromUrl) !== -1) {
      src = fromUrl;
      try { window.sessionStorage.setItem(KEY, src); } catch (e) { /* 使えないときは何もしない */ }
    } else {
      try {
        var saved = window.sessionStorage.getItem(KEY);
        if (saved && ALLOWED.indexOf(saved) !== -1) src = saved;
      } catch (e) { /* 使えないときは何もしない */ }
    }
  } catch (e) {
    return;
  }
  if (!src) return;

  var links = document.querySelectorAll('a[href*="apps.apple.com"], a[href*="play.google.com/store/apps"]');
  for (var i = 0; i < links.length; i++) {
    try {
      var url = new URL(links[i].href);
      if (url.hostname === 'apps.apple.com') {
        url.searchParams.set('ct', src);
      } else if (url.hostname === 'play.google.com') {
        var ref = new URLSearchParams(url.searchParams.get('referrer') || '');
        ref.set('utm_source', src);
        ref.set('utm_medium', 'social');
        url.searchParams.set('referrer', ref.toString());
      } else {
        continue;
      }
      links[i].href = url.toString();
    } catch (e) { /* このリンクはそのまま */ }
  }
}());
