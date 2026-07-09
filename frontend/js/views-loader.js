(function () {
  var views = ['chat', 'requests', 'map', 'history'];
  views.forEach(function (name) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'views/view-' + name + '.html', false); // synchronous
      xhr.send(null);
      if (xhr.status === 200 || xhr.status === 0) {
        var el = document.getElementById('view-' + name);
        if (el) el.innerHTML = xhr.responseText;
      } else {
        console.warn('[views-loader] HTTP ' + xhr.status + ' for views/view-' + name + '.html');
      }
    } catch (e) {
      console.warn('[views-loader] Could not load views/view-' + name + '.html', e);
    }
  });
})();
