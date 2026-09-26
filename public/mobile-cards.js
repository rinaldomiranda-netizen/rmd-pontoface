/* RMD PontoFace — tabelas no celular.
   Problema: no celular as tabelas (funcionários, batidas, locais, acessos,
   auditoria) eram apertadas em ~340px com colunas fixas, e o texto quebrava
   letra por letra ("espremido"). No tablet e no computador há espaço.
   Solução: em telas de até 640px cada linha da tabela vira um cartão, com
   o nome da coluna ao lado de cada valor. Este arquivo não depende do
   React: ele rotula as células (data-label) sempre que uma tabela aparece
   ou muda, e injeta o estilo uma única vez. */
(function () {
  var LARGURA = 640;
  var css = [
    '@media (max-width:' + LARGURA + 'px){',
    '  #root table{table-layout:auto!important;min-width:0!important;width:100%!important;border:0!important}',
    '  #root thead{display:none!important}',
    '  #root tbody, #root tr{display:block!important;width:100%!important}',
    '  #root tr{margin:0 0 12px!important;padding:10px 12px!important;border:1px solid var(--border,#dfe5ec)!important;border-radius:14px!important;background:var(--surface,#fff)!important;box-shadow:0 2px 10px rgba(15,23,42,.06)!important}',
    '  #root td{display:flex!important;justify-content:space-between!important;align-items:flex-start!important;gap:12px!important;width:100%!important;padding:7px 0!important;border:0!important;border-bottom:1px solid var(--border,#eef1f5)!important;text-align:right!important;white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important}',
    '  #root td:last-child{border-bottom:0!important}',
    '  #root td::before{content:attr(data-label);flex:0 0 38%;max-width:38%;text-align:left;font-weight:800;font-size:12px;color:var(--muted,#64748b);white-space:normal}',
    '  #root td[data-label=""]::before{display:none}',
    '  #root td[data-label=""]{justify-content:flex-end!important}',
    '  #root td > *{max-width:100%}',
    '  #root td button{min-height:40px}',
    '}'
  ].join('\n');

  function injetarEstilo() {
    if (document.getElementById('rmd-mobile-cards')) return;
    var s = document.createElement('style');
    s.id = 'rmd-mobile-cards';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function rotular(tabela) {
    var titulos = [];
    var cab = tabela.querySelector('thead tr') || tabela.querySelector('tr');
    if (!cab) return;
    var ths = cab.querySelectorAll('th');
    if (!ths.length) return;
    for (var i = 0; i < ths.length; i++) titulos.push((ths[i].textContent || '').trim());
    var linhas = tabela.querySelectorAll('tbody tr');
    for (var l = 0; l < linhas.length; l++) {
      var tds = linhas[l].children;
      for (var c = 0; c < tds.length; c++) {
        if (tds[c].tagName !== 'TD') continue;
        var rotulo = titulos[c] == null ? '' : titulos[c];
        if (tds[c].getAttribute('data-label') !== rotulo) tds[c].setAttribute('data-label', rotulo);
      }
    }
  }

  var agendado = false;
  function rotularTudo() {
    agendado = false;
    var tabelas = document.querySelectorAll('table');
    for (var i = 0; i < tabelas.length; i++) rotular(tabelas[i]);
  }
  function agendar() {
    if (agendado) return;
    agendado = true;
    (window.requestAnimationFrame || setTimeout)(rotularTudo);
  }

  function iniciar() {
    injetarEstilo();
    rotularTudo();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
